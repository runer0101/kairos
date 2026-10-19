// @ts-nocheck
/** @jsxImportSource @opentui/solid */
// Kairos shell panel: the gentle-shell reading surface docked to the left of
// the OpenCode session — live subagents, the active ODD task and the session
// running cost — so kairos reads as the visual combination of both harnesses.
// It paints into the host's `session_left` slot (kairos-patched binary,
// tui.json: session_left_width); the stock binary never renders that slot.
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
const AGENT_ROWS = 6
const ODD_ROWS = 4
const DEFAULT_WIDTH = 40
const AGENT_NAME_MAX = 15

const clip = (text, max) => {
  const value = String(text ?? "")
  if (max <= 0) return ""
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value
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

  const odd = createMemo(() => {
    tick()
    try {
      const tasks = readOddTasks(api.state.path.worktree)
      return tasks.find((entry) => entry.done < entry.total) ?? tasks[0]
    } catch {
      return undefined
    }
  })

  const session = createMemo(() => {
    tick()
    const sid = sessionID()
    if (!sid) return {}
    try {
      const info = api.state.session.get(sid)
      const tokens = info?.tokens
        ? Number(info.tokens.input ?? 0) + Number(info.tokens.output ?? 0) + Number(info.tokens.reasoning ?? 0)
        : undefined
      return { model: shortModel(info?.model), tokens, cost: typeof info?.cost === "number" ? info.cost : undefined }
    } catch {
      return {}
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

  const stateLine = () => {
    const info = session()
    const parts = [info.model, info.tokens ? `${formatTokens(info.tokens)} tok` : undefined, info.cost ? formatCost(info.cost) : undefined]
      .filter(Boolean)
      .join(" · ")
    return parts || "kairos"
  }

  return (
    <box flexDirection="column">
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
      <text> </text>
      <text fg={api.theme.current.text}>
        <b>Todos</b>
        {odd() ? (
          <span fg={api.theme.current.textMuted}>{` · ${odd().done} of ${odd().total}`}</span>
        ) : (
          <span fg={api.theme.current.textMuted}> · sin tarea ODD</span>
        )}
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
      <box flexGrow={1} />
      <text fg={api.theme.current.textMuted}>{clip(stateLine(), width())}</text>
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
