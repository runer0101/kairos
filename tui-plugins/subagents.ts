// Subagent data for the TUI: runs collected from the session's `task` tool
// calls, merged with the live child sessions. Shared by the agents view
// (kairos-agents.tsx) and the left panel (kairos-shell.tsx).
export const GLYPH = { running: "◐", waiting: "?", queued: "○", done: "✓", failed: "✗" }
export const STATE_TONE = { running: "accent", waiting: "warning", queued: "textMuted", done: "success", failed: "error" }

// Subagent lifecycle keys, same vocabulary the third-party monitor uses.
export const SESSION_EVENTS = [
  "session.created",
  "session.updated",
  "session.status",
  "session.idle",
  "session.error",
  "message.updated",
  "message.part.updated",
  "todo.updated",
  "session.diff",
  "vcs.branch.updated",
]

export const formatElapsed = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes}m${String(total % 60).padStart(2, "0")}s`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`
}

export const formatTokens = (value) => {
  const tokens = Number(value ?? 0)
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`
  return String(tokens)
}

export const formatCost = (value) => `$${Number(value ?? 0).toFixed(2)}`

export const shortModel = (model) => {
  if (!model) return undefined
  const value = typeof model === "string" ? model : `${model.providerID ?? ""}/${model.modelID ?? model.id ?? ""}`
  const tail = value.slice(value.lastIndexOf("/") + 1)
  return tail || value
}

// Every `task` tool call of the session as a run: description, agent and the
// child session id live in the tool part (state.input / state.metadata).
export const collectRuns = (api, sessionID) => {
  const runs = []
  let messages = []
  try {
    messages = api.state.session.messages(sessionID)
  } catch {
    return runs
  }
  for (const message of messages) {
    let parts = []
    try {
      parts = api.state.part(message.id)
    } catch {
      continue
    }
    for (const part of parts) {
      if (part?.type !== "tool" || part?.tool !== "task") continue
      const input = part.state?.input ?? {}
      const metadata = part.state?.metadata ?? {}
      const childID =
        typeof metadata.sessionId === "string"
          ? metadata.sessionId
          : typeof metadata.sessionID === "string"
            ? metadata.sessionID
            : undefined
      runs.push({
        key: part.id,
        agent: typeof input.subagent_type === "string" ? input.subagent_type : "task",
        description: String(input.description ?? part.state?.title ?? ""),
        prompt: typeof input.prompt === "string" ? input.prompt : "",
        childID,
        tool: part.state?.status,
        started: typeof part.state?.time?.start === "number" ? part.state.time.start : undefined,
        ended: typeof part.state?.time?.end === "number" ? part.state.time.end : undefined,
      })
    }
  }
  return runs
}

// Merge the tool calls with the live child sessions (status, tokens, cost).
// A child without a matching call (e.g. an @-mention subtask) still lists.
export const mergeRuns = (runs, children, statusOf) => {
  const merged = runs.map((run) => ({ ...run }))
  const index = new Map()
  for (const run of merged) if (run.childID) index.set(run.childID, run)
  for (const child of children ?? []) {
    const existing = index.get(child.id)
    const live = statusOf(child.id)?.type
    const target = existing ?? {
      key: `child:${child.id}`,
      agent: typeof child.agent === "string" ? child.agent : "task",
      description: String(child.title ?? "").replace(/\s*\(@[^)]*subagent\)\s*$/, ""),
      prompt: "",
      childID: child.id,
      tool: undefined,
      started: child.time?.created,
      ended: child.time?.updated,
    }
    if (!existing) merged.push(target)
    target.live = live
    target.title = child.title
    target.cost = typeof child.cost === "number" ? child.cost : target.cost
    const tokens = child.tokens
    if (tokens) target.tokens = Number(tokens.input ?? 0) + Number(tokens.output ?? 0) + Number(tokens.reasoning ?? 0)
    if (!target.agent || target.agent === "task") target.agent = typeof child.agent === "string" ? child.agent : target.agent
    if (!existing && typeof child.time?.created === "number" && typeof child.time?.updated === "number") target.ended = child.time.updated
  }
  return merged
}

export const runState = (run, now) => {
  if (run.question) return "waiting"
  if (run.live === "busy" || run.live === "retry" || run.tool === "running") return "running"
  if (run.tool === "error") return "failed"
  if (run.tool === "completed" || run.live === "idle") return "done"
  if (!run.started) return "queued"
  return run.ended ? "done" : "queued"
}

export const stateRank = { running: 0, waiting: 1, queued: 2, failed: 3, done: 4 }
