// @ts-nocheck
/** @jsxImportSource @opentui/solid */
// Kairos shell panel: the gentle-shell reading surface docked to the left of
// the OpenCode session. It mirrors what gentle-shell pins around its
// transcript — the header (project, branch, dirty count, profile, model,
// tokens, cost) and the Status → Changes → TODO rail, integrations included —
// and then adds kairos' own ODD feature task and the live subagents, so the
// panel reads as the visual combination of both harnesses. It paints into the
// host's `session_left` slot (kairos-patched binary, tui.json:
// session_left_width); the stock binary never renders that slot.
import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { readOddTasks } from "./odd-tasks"
import {
  GLYPH,
  STATE_TONE,
  SESSION_EVENTS,
  collectRuns,
  formatCost,
  formatElapsed,
  formatTokens,
  mergeRuns,
  runState,
  shortModel,
  stateRank,
} from "./subagents"

const id = "kairos-shell"

const TICK_MS = 2000
const CHILDREN_THROTTLE_MS = 2000
const AGENT_ROWS = 5
const CHANGE_ROWS = 3
const TODO_ROWS = 4
const ODD_ROWS = 3
const DEFAULT_WIDTH = 40
const AGENT_NAME_MAX = 15

// Native plan rows, same vocabulary the host sidebar uses.
const TODO_GLYPH = { completed: "✓", in_progress: "◐", pending: "○", cancelled: "✗" }
const TODO_TONE = { completed: "success", in_progress: "accent", pending: "textMuted", cancelled: "error" }

const clip = (text, max) => {
  const value = String(text ?? "")
  if (max <= 0) return ""
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value
}

const baseName = (path) => {
  const parts = String(path ?? "").replace(/\/+$/, "").split("/").filter(Boolean)
  return parts[parts.length - 1] ?? String(path ?? "")
}

const Panel = (props) => {
  const api = props.api
  const sessionID = () => (typeof props.session_id === "string" ? props.session_id : undefined)
  const [tick, setTick] = createSignal(0)
  const [children, setChildren] = createSignal(null)

  const now = createMemo(() => {
    tick()
    return Date.now()
  })

  // Same shape as the host sidebar: the slot is width - padding (2) - margin (1).
  const width = () => Math.max(20, Number(api.tuiConfig?.session_left_width) || DEFAULT_WIDTH) - 3

  const rows = createMemo(() => {
    tick()
    const sid = sessionID()
    if (!sid) return []
    const merged = mergeRuns(collectRuns(api, sid), children() ?? [], (childID) => api.state.session.status(childID))
    for (const run of merged) {
      if (!run.childID) continue
      try {
        run.question = api.state.session.question(run.childID).length > 0
      } catch {
        run.question = false
      }
    }
    return merged.sort(
      (left, right) =>
        stateRank[runState(left, now())] - stateRank[runState(right, now())] || (right.started ?? 0) - (left.started ?? 0),
    )
  })

  const counts = createMemo(() => {
    const list = rows()
    const active = list.filter((run) => ["running", "waiting", "queued"].includes(runState(run, now()))).length
    const done = list.filter((run) => runState(run, now()) === "done").length
    return { active, done, total: list.length }
  })

  // Project, branch, profile, session name, model, tokens and cost: the live
  // header data gentle-shell keeps above its rail.
  const status = createMemo(() => {
    tick()
    const sid = sessionID()
    let info
    try {
      info = sid ? api.state.session.get(sid) : undefined
    } catch {
      info = undefined
    }
    const tokens = info?.tokens
      ? Number(info.tokens.input ?? 0) + Number(info.tokens.output ?? 0) + Number(info.tokens.reasoning ?? 0)
      : undefined
    return {
      project: baseName(api.state.path.worktree) || "kairos",
      branch: api.state.vcs?.branch,
      profile: typeof info?.agent === "string" ? info.agent : undefined,
      title: typeof info?.title === "string" ? info.title : undefined,
      model: shortModel(info?.model),
      tokens,
      cost: typeof info?.cost === "number" ? info.cost : undefined,
    }
  })

  // Git state of the session the host already tracks for its sidebar.
  const changes = createMemo(() => {
    tick()
    const sid = sessionID()
    if (!sid) return { files: [], additions: 0, deletions: 0 }
    try {
      const files = api.state.session.diff(sid) ?? []
      let additions = 0
      let deletions = 0
      for (const file of files) {
        additions += Number(file?.additions ?? 0)
        deletions += Number(file?.deletions ?? 0)
      }
      return { files, additions, deletions }
    } catch {
      return { files: [], additions: 0, deletions: 0 }
    }
  })

  // The model's own plan (`todo` tool), the card gentle-shell titles TODO.
  const todos = createMemo(() => {
    tick()
    const sid = sessionID()
    if (!sid) return []
    try {
      return api.state.session.todo(sid) ?? []
    } catch {
      return []
    }
  })

  const todoDone = createMemo(() => todos().filter((item) => item?.status === "completed").length)

  // Integrations, the other half of gentle-shell's Status card.
  const integrations = createMemo(() => {
    tick()
    const parts = []
    try {
      const items = api.state.mcp() ?? []
      if (items.length) {
        let ok = 0
        let bad = 0
        for (const item of items) {
          if (item?.status === "connected") ok += 1
          else if (item?.status !== "disabled") bad += 1
        }
        parts.push(`mcp ${ok} ok${bad ? ` · ${bad} fallos` : ""}`)
      }
    } catch {
      // sin datos de MCP no se pinta la línea
    }
    try {
      const items = api.state.lsp() ?? []
      if (items.length) {
        let ok = 0
        let bad = 0
        for (const item of items) {
          if (item?.status === "connected") ok += 1
          else bad += 1
        }
        parts.push(`lsp ${ok} ok${bad ? ` · ${bad} fallos` : ""}`)
      }
    } catch {
      // sin datos de LSP no se pinta la línea
    }
    return parts
  })

  // Kairos' feature document, the part neither host paints.
  const odd = createMemo(() => {
    tick()
    try {
      const tasks = readOddTasks(api.state.path.worktree)
      return tasks.find((entry) => entry.done < entry.total) ?? tasks[0]
    } catch {
      return undefined
    }
  })

  let childrenSeq = 0
  let lastChildren = 0
  const loadChildren = async (force = false) => {
    const sid = sessionID()
    if (!sid) return
    const stamp = Date.now()
    if (!force && stamp - lastChildren < CHILDREN_THROTTLE_MS) return
    lastChildren = stamp
    const seq = ++childrenSeq
    try {
      const result = await api.client.session.children({ sessionID: sid })
      if (seq !== childrenSeq) return
      setChildren(result.data ?? [])
    } catch {
      if (seq !== childrenSeq) return
      setChildren((current) => current ?? [])
    }
  }

  const timer = setInterval(() => setTick((value) => value + 1), TICK_MS)
  onCleanup(() => clearInterval(timer))

  const offs = SESSION_EVENTS.map((type) =>
    api.event.on(type, (event) => {
      const sid = event?.properties?.sessionID ?? event?.properties?.part?.sessionID ?? event?.properties?.info?.sessionID
      if (sid && sid !== sessionID()) return
      setTick((value) => value + 1)
    }),
  )
  onCleanup(() => offs.forEach((off) => off()))

  createEffect(() => {
    tick()
    void loadChildren()
  })

  return (
    <box flexDirection="column">
      <text fg={api.theme.current.text}>
        <b>Status</b>
        {status().profile ? <span fg={api.theme.current.textMuted}>{` · ${status().profile}`}</span> : null}
        {status().title ? <span fg={api.theme.current.textMuted}>{` · ${clip(status().title, Math.max(6, width() - 16))}`}</span> : null}
      </text>
      <text>
        <span fg={api.theme.current.text}>{clip(status().project, Math.max(8, width() - 14))}</span>
        {status().branch ? <span fg={api.theme.current.textMuted}>{` · ${clip(status().branch, 12)}`}</span> : null}
        {changes().files.length ? <span fg={api.theme.current.warning}>{` ●${changes().files.length}`}</span> : null}
      </text>
      <text fg={api.theme.current.textMuted}>
        {clip(
          [status().model, status().tokens ? `${formatTokens(status().tokens)} tok` : undefined, status().cost !== undefined ? formatCost(status().cost) : undefined]
            .filter(Boolean)
            .join(" · ") || "sin sesión",
          width(),
        )}
      </text>
      {integrations().length ? (
        <text fg={api.theme.current.textMuted}>{clip(integrations().join(" · "), width())}</text>
      ) : null}
      <text> </text>
      <text fg={api.theme.current.text}>
        <b>Changes</b>
        <span fg={api.theme.current.textMuted}>
          {changes().files.length ? ` · ${changes().files.length} archivos · ` : " · sin cambios"}
        </span>
        {changes().files.length ? <span fg={api.theme.current.diffAdded}>{`+${changes().additions}`}</span> : null}
        {changes().files.length ? <span fg={api.theme.current.textMuted}> </span> : null}
        {changes().files.length ? <span fg={api.theme.current.diffRemoved}>{`−${changes().deletions}`}</span> : null}
      </text>
      {changes()
        .files.slice(0, CHANGE_ROWS)
        .map((file) => <text fg={api.theme.current.textMuted}>{`· ${clip(file.file, width() - 2)}`}</text>)}
      {changes().files.length > CHANGE_ROWS ? (
        <text fg={api.theme.current.textMuted}>{`  … +${changes().files.length - CHANGE_ROWS}`}</text>
      ) : null}
      <text> </text>
      <text fg={api.theme.current.text}>
        <b>TODO</b>
        <span fg={api.theme.current.textMuted}>
          {todos().length ? ` · ${todoDone()}/${todos().length}` : " · sin plan"}
        </span>
      </text>
      {todos()
        .slice(0, TODO_ROWS)
        .map((item) => (
          <text fg={api.theme.current[TODO_TONE[item.status] ?? "textMuted"]}>
            {`${TODO_GLYPH[item.status] ?? "○"} `}
            <span fg={api.theme.current.text}>{clip(item.content, width() - 2)}</span>
          </text>
        ))}
      {todos().length > TODO_ROWS ? (
        <text fg={api.theme.current.textMuted}>{`  … +${todos().length - TODO_ROWS}`}</text>
      ) : null}
      <text> </text>
      <text fg={api.theme.current.text}>
        <b>ODD</b>
        <span fg={api.theme.current.textMuted}>{odd() ? ` · ${odd().done} of ${odd().total}` : " · sin tarea"}</span>
      </text>
      {odd() ? <text fg={api.theme.current.accent}>{clip(odd().name, width())}</text> : null}
      {odd()
        ? odd()
            .pending.slice(0, ODD_ROWS)
            .map((item) => <text fg={api.theme.current.textMuted}>{`○ ${clip(item, width() - 2)}`}</text>)
        : null}
      {odd() && odd().pending.length > ODD_ROWS ? (
        <text fg={api.theme.current.textMuted}>{`○ … +${odd().pending.length - ODD_ROWS}`}</text>
      ) : null}
      <text> </text>
      <text fg={api.theme.current.text}>
        <b>Agents</b>
        <span fg={api.theme.current.textMuted}>
          {counts().total > 0 ? ` · ${counts().active} activos · ${counts().done} hechos` : " · sin subagentes"}
        </span>
      </text>
      {rows()
        .slice(0, AGENT_ROWS)
        .map((run) => {
          const state = runState(run, now())
          const elapsed = run.started ? formatElapsed((run.ended ?? now()) - run.started) : ""
          const name = clip(run.agent, AGENT_NAME_MAX)
          const description = clip(run.description || run.prompt, Math.max(0, width() - name.length - elapsed.length - 4))
          return (
            <text fg={api.theme.current[STATE_TONE[state]]}>
              {`${GLYPH[state]} `}
              <span fg={api.theme.current.text}>{name}</span>
              {description ? <span fg={api.theme.current.textMuted}>{` ${description}`}</span> : null}
              {elapsed ? <span fg={api.theme.current.textMuted}>{`  ${elapsed}`}</span> : null}
            </text>
          )
        })}
      {rows().length > AGENT_ROWS ? (
        <text fg={api.theme.current.textMuted}>{`  … +${rows().length - AGENT_ROWS}`}</text>
      ) : null}
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 90,
    slots: {
      session_left(_ctx, props) {
        return <Panel api={api} session_id={props?.session_id} />
      },
    },
  })
}

const plugin = { id, tui }
export default plugin
