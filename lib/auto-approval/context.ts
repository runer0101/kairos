// Bounded, redacted classifier context built from live session messages and the
// pending action. Secrets are masked before any text is included, the live
// request always comes first, and the oldest history is dropped first.
import { INPUT_BYTES, truncateToBytes, utf8Bytes } from "./budgets.ts";

/** Adapter shape for a live session message: {role, text} only. */
export interface SessionMessage {
	role: string;
	text: string;
}

export interface RedactedAction {
	toolName: string;
	input: unknown;
}

export interface RedactionResult<T> {
	value: T;
	truncated: boolean;
}

export interface ClassifierContext {
	/** True when a live user request was found and included. */
	hasRequest: boolean;
	/** Redacted live request, truncated to the budget when needed. */
	request: string | null;
	/** Redacted action under classification. */
	action: RedactedAction;
	/** Redacted older messages, chronological; the live request is excluded. */
	history: Array<{ role: string; text: string }>;
	/** Number of older messages dropped for size (oldest first). */
	dropped: number;
	/** True when any included text or the action was truncated to fit. */
	truncated: boolean;
	/** Effective byte budget of `text`. */
	maxBytes: number;
	/** Bounded JSON payload: request first, then action, then history. */
	text: string;
}

/** Marks content the host cut for size; classifiers must not read it as permission. */
export const TRUNCATION_MARKER = " [truncated by host]";
/** Default per-string cap inside a redacted action. */
const ACTION_STRING_BYTES = 8 * 1024;
const ACTION_TRUNCATED_VALUE = "[action truncated by host]";
const MAX_ACTION_NODES = 64;
const MAX_ACTION_DEPTH = 8;
const MAX_TOOL_NAME_BYTES = 256;

const SECRET_KEY = /(?:password|passwd|secret|token|api[_-]?key|apikey|authorization|credential|private[_-]?key)/i;
// Conservative credential shapes: private keys, known token prefixes, bearer
// tokens, URL userinfo and JWTs. Anything matching is masked whole.
const CREDENTIAL_TEXT =
	/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{10,}|AKIA[A-Z0-9]{16})\b|\bBearer\s+[^\s'";]+|https?:\/\/[^\s/@:]+:[^\s/@]+@|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi;
const AUTHORIZATION = /\b(Authorization\s*[:=]\s*)(?:Bearer\s+)?[^\s"',;]+/gi;
const ASSIGNMENT =
	/\b([A-Za-z0-9_]*(?:password|passwd|secret|token|api[_-]?key|apikey|credential|private[_-]?key)[A-Za-z0-9_]*)(\s*[=:]\s*)("(?:[^"\\]|\\.)*"|'[^']*'|\S+)/gi;
// Long base64-ish runs: blobs and opaque keys, never ordinary prose.
const BASE64_RUN = /[A-Za-z0-9+/]{40,}={0,2}/g;

/** Deterministic masking of likely secrets in free text (commands, diffs, messages). */
export function redactText(text: string): string {
	if (typeof text !== "string" || text === "") return "";
	let out = text.replace(AUTHORIZATION, "$1[REDACTED]");
	out = out.replace(CREDENTIAL_TEXT, "[REDACTED]");
	out = out.replace(ASSIGNMENT, (raw, key: string, separator: string, value: string) => {
		// Numeric token constants are code/configuration, not authentication values.
		if (["token", "max_tokens"].includes(key.toLowerCase()) && /^\d+(?:\.\d+)?$/.test(value)) return raw;
		return `${key}${separator}[REDACTED]`;
	});
	out = out.replace(BASE64_RUN, "[REDACTED]");
	return out;
}

interface RedactState {
	nodes: number;
	truncated: boolean;
	maxStringBytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMaskableValue(key: string, value: unknown): boolean {
	if (value === null || value === "") return false;
	if (["token", "max_tokens"].includes(key.toLowerCase()) && typeof value === "number") return false;
	return true;
}

// Walks own enumerable data properties only: accessors never run, cycles are
// cut, and hostile prototypes become "[unsupported]" instead of throwing.
function redactNode(value: unknown, state: RedactState, seen: Set<object>, depth: number): unknown {
	if (typeof value === "string") {
		const redacted = redactText(value);
		const bounded = truncateToBytes(redacted, state.maxStringBytes);
		if (bounded !== redacted) state.truncated = true;
		return bounded;
	}
	if (value === null || typeof value === "number" || typeof value === "boolean") return value;
	if (typeof value === "bigint") return String(value);
	if (typeof value !== "object") return "[unsupported]";
	if (depth >= MAX_ACTION_DEPTH || state.nodes >= MAX_ACTION_NODES) {
		state.truncated = true;
		return "[omitted by host]";
	}
	if (seen.has(value)) return "[circular]";
	state.nodes += 1;
	seen.add(value);
	const isArray = Array.isArray(value);
	const prototype = Object.getPrototypeOf(value);
	if (!isArray && prototype !== Object.prototype && prototype !== null) {
		seen.delete(value);
		return "[unsupported]";
	}
	const out: Record<string, unknown> | unknown[] = isArray ? [] : Object.create(null);
	for (const key of Object.keys(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor || !Object.hasOwn(descriptor, "value")) {
			(out as Record<string, unknown>)[key] = "[unsupported]";
			continue;
		}
		if (!isArray && SECRET_KEY.test(key) && isMaskableValue(key, descriptor.value)) {
			(out as Record<string, unknown>)[key] = "[REDACTED]";
			continue;
		}
		(out as Record<string, unknown>)[key] = redactNode(descriptor.value, state, seen, depth + 1);
	}
	seen.delete(value);
	return out;
}

/**
 * Redacts an action before it is shown to the classifier: string leaves are
 * masked and bounded, secret-named keys are replaced whole. Never throws.
 */
export function redactAction(action: unknown, maxStringBytes = ACTION_STRING_BYTES): RedactionResult<RedactedAction> {
	const state: RedactState = {
		nodes: 0,
		truncated: false,
		maxStringBytes: Number.isFinite(maxStringBytes) && maxStringBytes > 0 ? Math.floor(maxStringBytes) : ACTION_STRING_BYTES,
	};
	const record = isRecord(action) ? action : {};
	const rawToolName = typeof record.toolName === "string" ? record.toolName : "";
	const toolName = truncateToBytes(rawToolName, MAX_TOOL_NAME_BYTES);
	if (toolName !== rawToolName) state.truncated = true;
	const input = redactNode(record.input ?? null, state, new Set(), 0);
	return { value: { toolName, input }, truncated: state.truncated };
}

const OMISSION_MARKER_BYTES = utf8Bytes(TRUNCATION_MARKER);

function boundText(text: string, room: number): { text: string; truncated: boolean } {
	if (text === "") return { text, truncated: false };
	if (!Number.isFinite(room) || room <= 0) return { text: "", truncated: true };
	if (utf8Bytes(text) <= room) return { text, truncated: false };
	const markerRoom = room - OMISSION_MARKER_BYTES;
	if (markerRoom >= 0) {
		const prefix = truncateToBytes(text, markerRoom);
		return { text: prefix + TRUNCATION_MARKER, truncated: true };
	}
	return { text: truncateToBytes(text, room), truncated: true };
}

/**
 * Builds the BOUNDED classifier context. Priority is the live request first
 * (latest non-blank user message), then the redacted action, then older history
 * in chronological order; the oldest history is dropped (or the sole newest one
 * truncated) until the payload fits `maxBytes`.
 */
export function buildClassifierContext(
	messages: readonly SessionMessage[],
	action: unknown,
	maxBytes: number = INPUT_BYTES,
): ClassifierContext {
	const budget = Number.isFinite(maxBytes) && maxBytes > 0 ? Math.floor(maxBytes) : INPUT_BYTES;

	// Adapter: keep only {role, text} entries, in order.
	const adapted: Array<{ role: string; text: string }> = [];
	if (Array.isArray(messages)) {
		for (const message of messages) {
			if (!message || typeof message !== "object") continue;
			const role = (message as { role?: unknown }).role;
			const text = (message as { text?: unknown }).text;
			if (typeof role !== "string" || role.trim() === "" || typeof text !== "string") continue;
			adapted.push({ role: role.trim(), text });
		}
	}

	// Live request = latest non-blank user message; everything else is history.
	let requestIndex = -1;
	for (let index = adapted.length - 1; index >= 0; index--) {
		if (adapted[index].role === "user" && adapted[index].text.trim() !== "") {
			requestIndex = index;
			break;
		}
	}
	const hasRequest = requestIndex >= 0;
	let request: string | null = hasRequest ? redactText(adapted[requestIndex].text) : null;
	const history: Array<{ role: string; text: string }> = [];
	for (let index = 0; index < adapted.length; index++) {
		if (index === requestIndex) continue;
		history.push({ role: adapted[index].role, text: redactText(adapted[index].text) });
	}

	// The action is redacted and bounded to at most half the budget, so a giant
	// diff or command can never crowd out the request entirely.
	const leafBytes = Math.min(ACTION_STRING_BYTES, Math.max(256, Math.floor(budget / 4)));
	const projected = redactAction(action, leafBytes);
	let redactedAction = projected.value;
	let truncated = projected.truncated;
	const actionShare = Math.max(128, Math.floor(budget / 2));
	if (utf8Bytes(JSON.stringify(redactedAction)) > actionShare) {
		redactedAction = { toolName: redactedAction.toolName, input: ACTION_TRUNCATED_VALUE };
		truncated = true;
	}

	const envelope = (
		requestText: string | null,
		historyItems: readonly { role: string; text: string }[],
		omitted: number,
	): string => {
		const payload: Record<string, unknown> = {};
		if (requestText !== null) payload.request = requestText;
		payload.action = redactedAction;
		payload.history = historyItems;
		if (omitted > 0) payload.omittedHistory = omitted;
		return JSON.stringify(payload);
	};

	if (request !== null) {
		const overhead = utf8Bytes(envelope("", [], 0));
		const bounded = boundText(request, budget - overhead);
		if (bounded.truncated) truncated = true;
		request = bounded.text;
	}

	let dropped = 0;
	const fits = () => utf8Bytes(envelope(request, history, dropped)) <= budget;
	while (history.length > 1 && !fits()) {
		history.shift();
		dropped += 1;
	}
	if (history.length === 1 && !fits()) {
		const overhead = utf8Bytes(envelope(request, [{ role: history[0].role, text: "" }], dropped));
		const bounded = boundText(history[0].text, budget - overhead);
		if (bounded.truncated) truncated = true;
		history[0] = { role: history[0].role, text: bounded.text };
		if (!fits()) {
			history.shift();
			dropped += 1;
		}
	}

	let text = envelope(request, history, dropped);
	// Hard safety net for pathological budgets below the minimum envelope.
	if (utf8Bytes(text) > budget) text = truncateToBytes(text, budget);

	return {
		hasRequest,
		request,
		action: redactedAction,
		history: [...history],
		dropped,
		truncated,
		maxBytes: budget,
		text,
	};
}
