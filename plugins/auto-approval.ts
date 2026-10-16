// Auto-approval classifier plugin: replies "once" to safe `ask` prompts and
// vetoes dangerous `allow` actions before they run. The classifier is contextual
// advice only: every failure, timeout or concurrent classification leaves the
// current decision untouched, and the veto path never acts on an ask-status
// action (a human prompt stays a human prompt).
//
// Mechanism as verified in T1 (OpenCode 1.18.35):
// - `permission.ask` is declared but never dispatched. The ask-side signal is
//   the `permission.asked` event, answered through the low-level client:
//   POST /permission/{requestID}/reply with { reply: "once" }.
// - `allow` emits no permission event; the veto goes through
//   `tool.execute.before` (throwing there blocks the tool).
import type { Plugin } from "@opencode-ai/plugin"
import {
	buildClassifierPrompt,
	createInFlightGuard,
	DEADLINE_MS,
	decidePolicy,
	parseVerdict,
	type FailureKind,
	type SessionMessage,
	type Verdict,
} from "../lib/auto-approval/index.ts"

/** Default classifier model; override with KAIROS_CLASSIFIER_MODEL=provider/model. */
const DEFAULT_MODEL = { providerID: "opencode-go", modelID: "deepseek-v4.1-flash" }
/** Deterministic stub reason; used by KAIROS_CLASSIFIER_STUB and the e2e smoke. */
const STUB_REASON = "stub"
/** Bounded verdict/ask cache so event and veto paths do not double-classify. */
const MAX_CACHE_ENTRIES = 64
/** Tools whose calls can carry a veto in allow-status sessions. */
const VETO_TOOLS = new Set(["bash", "edit", "write"])
const CLASSIFIER_SESSION_TITLE = "kairos auto-approval classifier"
const REPLY_URL = "/permission/{requestID}/reply"

type StubMode = "allow" | "deny" | "timeout"
type ModelRef = { providerID: string; modelID: string }
type Outcome = { verdict: Verdict | null; failure: FailureKind }
type PermissionStatus = "allow" | "not-allow" | "unknown"
type AsyncMethod = (options?: unknown) => Promise<unknown>

interface MessageRecord {
	info?: unknown
	parts?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null
	return value as Record<string, unknown>
}

function firstString(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value === "string" && value !== "") return value
	}
	return null
}

function readStub(value: string | undefined): StubMode | null {
	return value === "allow" || value === "deny" || value === "timeout" ? value : null
}

function readModel(value: string | undefined): ModelRef {
	if (typeof value !== "string") return { ...DEFAULT_MODEL }
	const source = value.trim()
	const slash = source.indexOf("/")
	if (slash <= 0 || slash === source.length - 1) return { ...DEFAULT_MODEL }
	return { providerID: source.slice(0, slash), modelID: source.slice(slash + 1) }
}

/** Invokes a client method by name, preserving its `this`; null when unavailable. */
function callMethod(owner: unknown, name: string, options?: unknown): Promise<unknown> | null {
	const record = asRecord(owner)
	if (!record) return null
	const method = record[name]
	if (typeof method !== "function") return null
	return (method as AsyncMethod).call(owner, options) as Promise<unknown>
}

async function fetchSessionMessages(client: unknown, sessionID: string): Promise<MessageRecord[] | null> {
	const pending = callMethod(asRecord(client)?.session, "messages", { path: { id: sessionID } })
	if (!pending) return null
	const data = asRecord(await pending)?.data
	if (!Array.isArray(data)) return null
	return data as MessageRecord[]
}

async function fetchAgents(client: unknown): Promise<unknown[] | null> {
	const pending = callMethod(asRecord(client)?.app, "agents")
	if (!pending) return null
	const data = asRecord(await pending)?.data
	return Array.isArray(data) ? data : null
}

// The runtime resolves /agent permissions as an ordered rule list where the last
// matching rule wins; the SDK types describe an object shape instead. Both are
// accepted, and every other shape is "unknown" (never a wrong veto).
function effectiveRuleAction(rules: readonly unknown[], name: string): string | null {
	for (let index = rules.length - 1; index >= 0; index--) {
		const rule = asRecord(rules[index])
		if (!rule) continue
		if (rule.permission !== name && rule.permission !== "*") continue
		const pattern = rule.pattern
		const generic = pattern === undefined || pattern === "*" || (Array.isArray(pattern) && pattern.includes("*"))
		if (!generic) continue
		const action = rule.action
		if (action === "allow" || action === "ask" || action === "deny") return action
	}
	return null
}

function permissionStatusFor(permission: unknown, tool: string): PermissionStatus {
	if (Array.isArray(permission)) {
		const target = tool === "bash" ? "bash" : "edit" // write is covered by the edit permission
		const action = effectiveRuleAction(permission, target)
		if (action === null) return "unknown"
		if (action !== "allow") return "not-allow"
		const external = effectiveRuleAction(permission, "external_directory")
		if (external === "ask" || external === "deny") return "not-allow"
		return "allow"
	}
	const record = asRecord(permission)
	if (!record) return "unknown"
	if (record.external_directory === "ask" || record.external_directory === "deny") return "not-allow"
	if (tool === "bash") {
		if (record.bash === "allow") return "allow"
		if (typeof record.bash === "string") return "not-allow"
		const map = asRecord(record.bash)
		if (!map) return "unknown"
		if (map["*"] === "allow") return "allow"
		if (typeof map["*"] === "string") return "not-allow"
		return "unknown"
	}
	if (record.edit === "allow") return "allow"
	if (typeof record.edit === "string") return "not-allow"
	return "unknown"
}

function latestUserAgent(messages: readonly MessageRecord[]): string | null {
	for (let index = messages.length - 1; index >= 0; index--) {
		const info = asRecord(messages[index]?.info)
		if (!info || info.role !== "user") continue
		if (typeof info.agent === "string" && info.agent !== "") return info.agent
	}
	return null
}

async function resolvePermissionStatus(
	client: unknown,
	messages: readonly MessageRecord[] | null,
	tool: string,
): Promise<PermissionStatus> {
	if (!messages) return "unknown"
	const agentName = latestUserAgent(messages)
	if (!agentName) return "unknown"
	const agents = await fetchAgents(client)
	if (!agents) return "unknown"
	for (const entry of agents) {
		const agent = asRecord(entry)
		if (!agent || agent.name !== agentName) continue
		return permissionStatusFor(agent.permission, tool)
	}
	return "unknown"
}

/** Maps live session messages to {role, text}, text parts only; tool and meta parts are skipped. */
function toSessionMessages(messages: readonly MessageRecord[]): SessionMessage[] {
	const adapted: SessionMessage[] = []
	for (const message of messages) {
		const entry = asRecord(message)
		if (!entry) continue
		const info = asRecord(entry.info)
		if (!info || typeof info.role !== "string") continue
		const parts = Array.isArray(entry.parts) ? entry.parts : []
		for (const part of parts) {
			const record = asRecord(part)
			if (!record || record.type !== "text") continue
			if (record.synthetic === true || record.ignored === true) continue
			if (typeof record.text !== "string" || record.text.trim() === "") continue
			adapted.push({ role: info.role, text: record.text })
		}
	}
	return adapted
}

function actionFromPermissionEvent(permissionType: "bash" | "edit", properties: Record<string, unknown>) {
	const metadata = asRecord(properties.metadata) ?? {}
	const patterns = Array.isArray(properties.patterns)
		? properties.patterns.filter((entry): entry is string => typeof entry === "string")
		: []
	if (permissionType === "bash") {
		return { toolName: "bash", input: { command: firstString(metadata.command, patterns[0]) ?? "" } }
	}
	const filepath = firstString(metadata.filepath, metadata.path, patterns[0]) ?? ""
	const diff = firstString(metadata.diff)
	return { toolName: "edit", input: diff === null ? { filepath } : { filepath, diff } }
}

function actionFromToolCall(tool: string, args: unknown) {
	const record = asRecord(args) ?? {}
	if (tool === "bash") {
		return { toolName: "bash", input: { command: firstString(record.command) ?? "" } }
	}
	const filepath = firstString(record.filePath, record.path) ?? ""
	const diff = firstString(record.diff, record.content, record.newString)
	return { toolName: tool, input: diff === null ? { filepath } : { filepath, diff } }
}

function extractVerdict(data: unknown): Verdict | null {
	const payload = asRecord(data)
	if (!payload) return null
	const parts = Array.isArray(payload.parts) ? payload.parts : []
	for (const part of parts) {
		const record = asRecord(part)
		if (!record || record.type !== "text" || typeof record.text !== "string") continue
		const verdict = parseVerdict(record.text)
		if (verdict) return verdict
	}
	return null
}

async function withDeadline(pending: Promise<unknown>, deadlineMs: number): Promise<{ timedOut: boolean; value: unknown }> {
	const TIMED_OUT = Symbol("auto-approval timed out")
	let timer: ReturnType<typeof setTimeout> | undefined
	const deadline = new Promise<symbol>((resolve) => {
		timer = setTimeout(() => resolve(TIMED_OUT), deadlineMs)
	})
	try {
		const value = await Promise.race([pending, deadline])
		return value === TIMED_OUT ? { timedOut: true, value: undefined } : { timedOut: false, value }
	} finally {
		if (timer !== undefined) clearTimeout(timer)
	}
}

async function callClassifierModel(
	client: unknown,
	model: ModelRef,
	prompt: { system: string; user: string },
	rememberInternal: (sessionID: string) => void,
): Promise<Outcome> {
	const sessionApi = asRecord(client)?.session
	const create = callMethod(sessionApi, "create", { body: { title: CLASSIFIER_SESSION_TITLE } })
	if (!create) return { verdict: null, failure: "error" }
	let createdID: string | null = null
	try {
		const created = asRecord(await create)
		createdID = firstString(asRecord(created?.data)?.id)
		if (!createdID) return { verdict: null, failure: "error" }
		rememberInternal(createdID)
		// No tools in the internal session: the classifier can never recurse.
		const pending = callMethod(sessionApi, "prompt", {
			path: { id: createdID },
			body: {
				model: { providerID: model.providerID, modelID: model.modelID },
				system: prompt.system,
				tools: {},
				parts: [{ type: "text", text: prompt.user }],
			},
		})
		if (!pending) return { verdict: null, failure: "error" }
		const raced = await withDeadline(pending, DEADLINE_MS)
		if (raced.timedOut) return { verdict: null, failure: "timeout" }
		const envelope = asRecord(raced.value)
		if (!envelope || envelope.data === undefined) return { verdict: null, failure: "error" }
		const verdict = extractVerdict(envelope.data)
		if (!verdict) return { verdict: null, failure: "invalid" }
		return { verdict, failure: "none" }
	} catch {
		return { verdict: null, failure: "error" }
	} finally {
		if (createdID) {
			const destroy = callMethod(sessionApi, "delete", { path: { id: createdID } })
			if (destroy) {
				try {
					await destroy
				} catch {
					// Best-effort cleanup; a stale classifier session is harmless.
				}
			}
		}
	}
}

async function runClassification(
	client: unknown,
	model: ModelRef,
	sessionID: string,
	action: unknown,
	preloaded: readonly MessageRecord[] | null,
	rememberInternal: (sessionID: string) => void,
): Promise<Outcome> {
	try {
		const messages = preloaded ?? (await fetchSessionMessages(client, sessionID))
		if (!messages) return { verdict: null, failure: "error" }
		const prompt = buildClassifierPrompt(toSessionMessages(messages), action)
		return await callClassifierModel(client, model, prompt, rememberInternal)
	} catch {
		return { verdict: null, failure: "error" }
	}
}

export const AutoApprovalPlugin: Plugin = async ({ client }) => {
	// Switches are read once at load; KAIROS_NO_CLASSIFIER=1 keeps the plugin inert.
	const disabled = process.env.KAIROS_NO_CLASSIFIER === "1"
	const stub = readStub(process.env.KAIROS_CLASSIFIER_STUB)
	const model = readModel(process.env.KAIROS_CLASSIFIER_MODEL)
	const guard = createInFlightGuard()
	const cache = new Map<string, Outcome>()
	// Classifier session ids stay guarded even after deletion so late events
	// from the plugin's own session are always ignored; the set stays bounded.
	const internalSessions = new Set<string>()

	function remember(key: string | null, outcome: Outcome): Outcome {
		if (key === null) return outcome
		cache.delete(key)
		cache.set(key, outcome)
		while (cache.size > MAX_CACHE_ENTRIES) {
			const oldest = cache.keys().next()
			if (oldest.done) break
			cache.delete(oldest.value)
		}
		return outcome
	}

	function rememberInternal(sessionID: string): void {
		internalSessions.delete(sessionID)
		internalSessions.add(sessionID)
		while (internalSessions.size > MAX_CACHE_ENTRIES) {
			const oldest = internalSessions.values().next()
			if (oldest.done) break
			internalSessions.delete(oldest.value)
		}
	}

	/** One classification per callID; concurrent callers are skipped (failure "invalid"). */
	async function classify(
		callID: string | null,
		sessionID: string,
		action: unknown,
		preloaded: readonly MessageRecord[] | null,
	): Promise<Outcome> {
		if (callID !== null) {
			const cached = cache.get(callID)
			if (cached) return cached
		}
		if (!guard.tryEnter()) return remember(callID, { verdict: null, failure: "invalid" })
		try {
			if (stub === "allow") return remember(callID, { verdict: { decision: "allow", reason: STUB_REASON }, failure: "none" })
			if (stub === "deny") return remember(callID, { verdict: { decision: "deny", reason: STUB_REASON }, failure: "none" })
			if (stub === "timeout") return remember(callID, { verdict: null, failure: "timeout" })
			return remember(callID, await runClassification(client, model, sessionID, action, preloaded, rememberInternal))
		} catch {
			return remember(callID, { verdict: null, failure: "error" })
		} finally {
			guard.exit()
		}
	}

	async function replyOnce(requestID: string): Promise<void> {
		const pending = callMethod(asRecord(client)?._client, "post", {
			url: REPLY_URL,
			path: { requestID },
			body: { reply: "once" },
		})
		if (pending) await pending
	}

	/** ask path: the event only exists for ask, so the action is definitively ask-status. */
	async function processPermissionEvent(event: unknown): Promise<void> {
		try {
			const record = asRecord(event)
			if (!record || record.type !== "permission.asked") return
			const properties = asRecord(record.properties)
			if (!properties) return
			const permissionType = properties.permission
			if (permissionType !== "bash" && permissionType !== "edit") return
			const sessionID = firstString(properties.sessionID)
			const requestID = firstString(properties.id, properties.requestID, properties.permissionID)
			if (sessionID === null || requestID === null) return
			if (internalSessions.has(sessionID)) return
			const callID = firstString(asRecord(properties.tool)?.callID, properties.callID)
			if (callID !== null && cache.has(callID)) return
			const outcome = await classify(callID, sessionID, actionFromPermissionEvent(permissionType, properties), null)
			if (decidePolicy({ currentStatus: "ask", verdict: outcome.verdict, failure: outcome.failure }) !== "allow") return
			await replyOnce(requestID)
		} catch {
			// Fail-safe: a broken reply or lookup never escapes the hook.
		}
	}

	/**
	 * Veto path: only for CONFIRMED allow-status sessions (the session's agent
	 * comes from its latest user message and the effective permission from
	 * /agent). Unknown or not-allow status never vetoes: a failed lookup leaves
	 * the decision as-is, and an ask-status action must stay a human prompt.
	 * The callID cache also short-circuits anything the event path already saw.
	 * This function never throws: it returns the veto message or null.
	 */
	async function classifyVeto(input: unknown, output: unknown): Promise<string | null> {
		try {
			const inputRecord = asRecord(input)
			const tool = inputRecord?.tool
			if (typeof tool !== "string" || !VETO_TOOLS.has(tool)) return null
			const sessionID = firstString(inputRecord?.sessionID)
			const callID = firstString(inputRecord?.callID)
			if (sessionID === null || callID === null) return null
			if (internalSessions.has(sessionID) || cache.has(callID)) return null
			let messages: MessageRecord[] | null = null
			let status: PermissionStatus = "unknown"
			try {
				messages = await fetchSessionMessages(client, sessionID)
			} catch {
				messages = null
			}
			try {
				status = await resolvePermissionStatus(client, messages, tool)
			} catch {
				status = "unknown"
			}
			if (status !== "allow") return null
			const outcome = await classify(callID, sessionID, actionFromToolCall(tool, asRecord(output)?.args), messages)
			if (decidePolicy({ currentStatus: "allow", verdict: outcome.verdict, failure: outcome.failure }) !== "deny") return null
			return `auto-approval: bloqueado por el clasificador — ${outcome.verdict?.reason ?? ""}`
		} catch {
			return null
		}
	}

	return {
		event: async ({ event }) => {
			if (disabled) return
			await processPermissionEvent(event)
		},
		"tool.execute.before": async (input, output) => {
			if (disabled) return
			const veto = await classifyVeto(input, output)
			if (veto !== null) throw new Error(veto)
		},
	}
}
