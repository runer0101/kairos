// @ts-nocheck
/** @jsxImportSource @opentui/solid */
// Kairos unified view: the session workspace on the left (session row, live
// subagents, agent catalog and the active ODD task) and what OpenCode shows on
// the right (the live thread of the session or subagent, or the agent card) —
// the gentle-shell `alt+a` overlay rebuilt with the OpenCode TUI plugin API.
// Open it with KAIROS_AGENTS_KEY (default alt+g) or with the `/agentes` slash
// command; Esc returns to the session.
import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
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

const id = "kairos-agents"
const ROUTE = "kairos-agents"

// Elapsed/status refresh cadence; fetches are throttled on top of this.
const TICK_MS = 1000
const CHILDREN_THROTTLE_MS = 2000
const THREAD_THROTTLE_MS = 800
const THREAD_CACHE_MAX = 8

// Two panes need room; below this the view shows one pane at a time.
const NARROW_WIDTH = 100
const LIST_MIN = 26
const LIST_MAX = 40
const LIST_RATIO = 0.34
const CHROME_ROWS = 2

// ODD section: pending rows shown before collapsing into "… +N".
const ODD_ROWS = 3

// Session row: title budget before the meta chip (kept short so the row fits).
const SESSION_TITLE_MAX = 22

// View shortcut: alt+a is taken by OpenCode's prompt editor (visual line home),
// so the free alt+g is the default. Change it with KAIROS_AGENTS_KEY; an empty
// value or "off" leaves only the palette and `/agents`.
const VIEW_KEY = process.env.KAIROS_AGENTS_KEY ?? "alt+g"
const VIEW_KEY_ENABLED = VIEW_KEY !== "" && VIEW_KEY.toLowerCase() !== "off"

const clip = (text, max) => {
  const value = String(text ?? "")
  if (max <= 0) return ""
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value
}

// Word wrap for thread lines; long unbroken tokens are cut at the width.
const wrapLine = (line, maxWidth) => {
  const width = Math.max(8, Math.floor(maxWidth))
  const output = []
  let rest = String(line ?? "")
  if (rest === "") return [""]
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width)
    if (cut <= 0) cut = width
    output.push(rest.slice(0, cut))
    rest = rest.slice(cut).trimStart()
  }
  output.push(rest)
  return output
}

const compactLines = (lines) => {
  const output = []
  let blank = false
  for (const line of lines) {
    const empty = line.text.trim() === ""
    if (empty) {
      if (!blank && output.length) output.push({ text: "", tone: line.tone })
      blank = true
      continue
    }
    blank = false
    output.push(line)
  }
  while (output.length && output[output.length - 1].text === "") output.pop()
  return output
}

// Transcript of a child session: user prompt, assistant text and tool lines.
// Reasoning, files and step markers stay out to keep the pane readable.
const threadFromEntries = (entries, width) => {
  const lines = []
  const push = (text, tone) => {
    for (const piece of wrapLine(text, width)) lines.push({ text: piece, tone })
  }
  for (const entry of entries ?? []) {
    const info = entry?.info
    const parts = entry?.parts ?? []
    if (info?.role === "user") {
      const first = parts.find((part) => part?.type === "text" && part.text?.trim())
      if (first) push(`▸ ${first.text.trim().split("\n")[0]}`, "accent")
      continue
    }
    for (const part of parts) {
      if (part?.type === "text" && part.text?.trim()) {
        for (const line of part.text.split("\n")) push(line, "text")
      } else if (part?.type === "tool") {
        const state = part.state?.status
        const glyph = state === "error" ? GLYPH.failed : state === "running" ? GLYPH.running : "·"
        const title = part.state?.title ?? state ?? ""
        push(`${glyph} ${part.tool}${title ? ` — ${title}` : ""}`, "textMuted")
      }
    }
  }
  return compactLines(lines)
}

const sessionTone = (api, tone) => {
  if (typeof tone === "string" && tone.startsWith("#")) return tone
  return api.theme.current[tone] ?? api.theme.current.text
}

// Agents carry a color (theme name or hex): the catalog row and the card use
// the same color the host paints next to the prompt for that profile/agent.
const agentTone = (api, agent) => {
  const direct = typeof agent?.color === "string" ? agent.color : undefined
  const configured = direct ?? api.state.config.agent?.[agent?.name]?.color
  if (typeof configured !== "string" || configured === "") return "text"
  if (configured.startsWith("#")) return configured
  return api.theme.current[configured] ? configured : "text"
}

const AgentsView = (props) => {
  const api = props.api
  const dimensions = useTerminalDimensions()
  const sessionID = () => (typeof props.params?.sessionID === "string" ? props.params.sessionID : undefined)

  const [tick, setTick] = createSignal(0)
  const [cursor, setCursor] = createSignal(0)
  const [follow, setFollow] = createSignal(true)
  const [scroll, setScroll] = createSignal(0)
  const [detailOpen, setDetailOpen] = createSignal(false)
  const [children, setChildren] = createSignal(null)
  const [agents, setAgents] = createSignal(null)
  const [thread, setThread] = createSignal(null)

  const now = createMemo(() => {
    tick()
    return Date.now()
  })
  const narrow = () => dimensions().width < NARROW_WIDTH
  const shellWidth = () => Math.max(20, dimensions().width - 2)
  const listWidth = () => Math.min(LIST_MAX, Math.max(LIST_MIN, Math.floor(dimensions().width * LIST_RATIO)))
  // The list box has one column of left padding; rows must fit inside it or
  // the host wraps them onto a second line.
  const listContent = () => Math.max(10, (narrow() ? dimensions().width : listWidth()) - 1)
  const rightWidth = () => Math.max(20, narrow() ? shellWidth() - 2 : dimensions().width - listWidth() - 4)
  const bodyRows = () => Math.max(3, dimensions().height - CHROME_ROWS)

  const runs = createMemo(() => {
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
    return merged.sort((left, right) => {
      const a = runState(left, now())
      const b = runState(right, now())
      return stateRank[a] - stateRank[b] || (right.started ?? 0) - (left.started ?? 0)
    })
  })

  const sessionTitle = createMemo(() => {
    const sid = sessionID()
    if (!sid) return undefined
    try {
      return api.state.session.get(sid)?.title
    } catch {
      return undefined
    }
  })

  // Session meta for the first row and the session detail pane.
  const sessionInfo = createMemo(() => {
    tick()
    const sid = sessionID()
    if (!sid) return {}
    try {
      const session = api.state.session.get(sid)
      if (!session) return {}
      const tokens = session.tokens
        ? Number(session.tokens.input ?? 0) + Number(session.tokens.output ?? 0) + Number(session.tokens.reasoning ?? 0)
        : undefined
      return {
        model: shortModel(session.model),
        tokens,
        cost: typeof session.cost === "number" ? session.cost : undefined,
        updated: typeof session.time?.updated === "number" ? session.time.updated : undefined,
      }
    } catch {
      return {}
    }
  })

  const sessionStatus = createMemo(() => {
    tick()
    const sid = sessionID()
    if (!sid) return undefined
    try {
      return api.state.session.status(sid)?.type
    } catch {
      return undefined
    }
  })

  // Active ODD task of the worktree (shared reader with the HUD).
  const oddTask = createMemo(() => {
    tick()
    try {
      const tasks = readOddTasks(api.state.path.worktree)
      return tasks.find((entry) => entry.done < entry.total) ?? tasks[0]
    } catch {
      return undefined
    }
  })

  const agentRows = createMemo(() => {
    const list = agents()
    if (!list) return []
    return [...list]
      .filter((agent) => agent.hidden !== true)
      .sort(
        (left, right) =>
          (left.mode === "primary" ? 0 : 1) - (right.mode === "primary" ? 0 : 1) ||
          String(left.name).localeCompare(String(right.name)),
      )
  })

  const counts = createMemo(() => {
    const list = runs()
    const active = list.filter((run) => ["running", "waiting", "queued"].includes(runState(run, now()))).length
    const done = list.filter((run) => runState(run, now()) === "done").length
    const failed = list.filter((run) => runState(run, now()) === "failed").length
    return { active, done, failed, total: list.length }
  })

  const rows = createMemo(() => {
    const output = [{ kind: "session", key: "session" }]
    output.push({ kind: "header", title: "Subagentes" })
    const list = runs()
    if (list.length === 0) output.push({ kind: "note", text: children() === null ? "cargando subagentes…" : "sin subagentes en esta sesión" })
    for (const run of list) output.push({ kind: "run", key: run.key, run })
    output.push({ kind: "header", title: "Agentes" })
    const catalog = agentRows()
    if (catalog.length === 0) output.push({ kind: "note", text: agents() === null ? "cargando agentes…" : "sin agentes configurados" })
    for (const agent of catalog) output.push({ kind: "agent", key: `agent:${agent.name}`, agent })
    const odd = oddTask()
    if (odd && odd.total > 0) {
      output.push({ kind: "header", title: `ODD ${odd.name} · ${odd.done}/${odd.total}` })
      for (const [index, item] of odd.pending.slice(0, ODD_ROWS).entries()) output.push({ kind: "odd", key: `odd:${index}`, text: item })
      if (odd.pending.length > ODD_ROWS) output.push({ kind: "odd", key: "odd:more", text: `… +${odd.pending.length - ODD_ROWS}` })
    }
    return output
  })

  const selectable = createMemo(() => rows().filter((row) => row.kind === "session" || row.kind === "run" || row.kind === "agent"))
  const selected = createMemo(() => {
    const list = selectable()
    if (list.length === 0) return null
    return list[Math.max(0, Math.min(cursor(), list.length - 1))]
  })

  const listWindow = createMemo(() => {
    const all = rows()
    const height = bodyRows()
    const index = Math.max(0, all.findIndex((row) => (row.kind === "session" || row.kind === "run" || row.kind === "agent") && row.key === selected()?.key))
    const offset = Math.max(0, Math.min(index - Math.floor(height / 2), Math.max(0, all.length - height)))
    return all.slice(offset, offset + height)
  })

  const threadLines = createMemo(() => {
    const current = thread()
    if (!current) return null
    return threadFromEntries(current.entries, rightWidth() - 2)
  })

  const detail = createMemo(() => {
    const row = selected()
    if (!row) return { title: "", subtitle: "", lines: [], tone: "textMuted" }
    if (row.kind === "agent") {
      const agent = row.agent
      const width = rightWidth() - 2
      const lines = []
      const description = String(agent.description ?? "").trim()
      if (description) for (const piece of wrapLine(description, width)) lines.push({ text: piece, tone: "text" })
      lines.push({ text: "", tone: "text" })
      lines.push({ text: `modelo: ${shortModel(agent.model) ?? "hereda el del perfil activo"}`, tone: "textMuted" })
      if (agent.steps) lines.push({ text: `pasos: ${agent.steps}`, tone: "textMuted" })
      const owned = runs().filter((run) => run.agent === agent.name).length
      lines.push({ text: `tareas en esta sesión: ${owned}`, tone: "textMuted" })
      return {
        title: String(agent.name),
        subtitle: agent.mode === "primary" ? "perfil primario" : agent.mode === "subagent" ? "agente subagente" : `agente ${agent.mode ?? "subagente"}`,
        lines,
        tone: agentTone(api, agent),
      }
    }
    if (row.kind === "session") {
      const sid = sessionID()
      const info = sessionInfo()
      const status = sessionStatus()
      const meta = []
      if (info.model) meta.push(info.model)
      if (info.tokens) meta.push(`${formatTokens(info.tokens)} tok`)
      if (info.cost) meta.push(formatCost(info.cost))
      if (status) meta.push(String(status))
      const current = thread()
      const loading = !current || current.key !== sid
      const lines = loading
        ? [{ text: "cargando hilo…", tone: "textMuted" }]
        : (threadLines() ?? []).length > 0
          ? threadLines()
          : [{ text: "sin mensajes todavía", tone: "textMuted" }]
      return {
        title: sessionTitle() ?? "sesión actual",
        subtitle: meta.join(" · ") || "—",
        lines,
        tone: status === "busy" || status === "retry" ? "accent" : "text",
      }
    }
    const run = row.run
    const state = runState(run, now())
    const meta = []
    const child = run.childID ? api.state.session.get(run.childID) : undefined
    const model = shortModel(child?.model)
    if (model) meta.push(model)
    if (run.tokens) meta.push(`${formatTokens(run.tokens)} tok`)
    if (run.cost) meta.push(formatCost(run.cost))
    if (run.started) meta.push(formatElapsed((run.ended ?? now()) - run.started))
    const current = thread()
    const loading = !current || current.key !== run.childID
    const lines = loading
      ? [{ text: "cargando hilo…", tone: "textMuted" }]
      : (threadLines() ?? []).length > 0
        ? threadLines()
        : [{ text: "sin mensajes todavía", tone: "textMuted" }]
    return { title: String(run.agent), subtitle: meta.join(" · "), lines, tone: STATE_TONE[state] }
  })

  const detailWindow = createMemo(() => {
    const all = detail().lines
    const height = Math.max(1, bodyRows() - 3)
    const overflow = Math.max(0, all.length - height)
    const fromBottom = Math.max(0, Math.min(scroll(), overflow))
    const offset = follow() ? overflow : Math.max(0, overflow - fromBottom)
    return all.slice(offset, offset + height)
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

  let threadSeq = 0
  let threadInflight = null
  // shortcut: one bottom-anchored window and an 8-slot thread cache; no
  // per-thread scrollback. Revisit if long threads need jump navigation.
  const threadCache = new Map()
  const loadThread = async (childID, options = {}) => {
    if (!childID) return
    const cached = threadCache.get(childID)
    const stamp = Date.now()
    // A cached idle thread is reused as-is; a running one (or one whose run
    // ended after the cache was written) refreshes, at most once per throttle.
    const stale = !cached || (stamp - cached.at > THREAD_THROTTLE_MS && (options.busy || cached.at < (options.endedAt ?? 0)))
    if (!stale) {
      setThread(cached)
      return
    }
    // One request per child at a time: the tick cannot cancel its own fetch.
    if (threadInflight?.childID === childID) return
    const seq = ++threadSeq
    threadInflight = { childID, seq }
    try {
      const result = await api.client.session.messages({ sessionID: childID })
      if (seq !== threadSeq) return
      const entry = { key: childID, at: Date.now(), entries: result.data ?? [] }
      threadCache.set(childID, entry)
      if (threadCache.size > THREAD_CACHE_MAX) threadCache.delete(threadCache.keys().next().value)
      setThread(entry)
    } catch {
      if (seq !== threadSeq) return
      setThread({ key: childID, at: Date.now(), entries: [{ info: { role: "assistant" }, parts: [{ type: "text", text: "◗ no se pudo leer el hilo del subagente" }] }] })
    } finally {
      if (threadInflight?.seq === seq) threadInflight = null
    }
  }

  // shortcut: the catalog is fetched once per view (plus manual refresh);
  // revisit if agents change at runtime.
  const loadAgents = async (force = false) => {
    if (agents() && !force) return
    try {
      const result = await api.client.app.agents({})
      setAgents(result.data ?? [])
    } catch {
      const configured = api.state.config.agent ?? {}
      setAgents(
        Object.entries(configured)
          .filter(([, value]) => !value?.disable)
          .map(([name, value]) => ({
            name,
            mode: value?.mode ?? "subagent",
            description: value?.description,
            model: value?.model,
          })),
      )
    }
  }

  // One clock for elapsed times; fetches stay throttled inside the loaders.
  const timer = setInterval(() => setTick((value) => value + 1), TICK_MS)
  onCleanup(() => clearInterval(timer))

  // Structural events bump the clock only when they touch this session or the
  // selected child; the throttles keep a streaming subagent from flooding.
  const offs = SESSION_EVENTS.map((type) =>
    api.event.on(type, (event) => {
      const sid = event?.properties?.sessionID ?? event?.properties?.part?.sessionID ?? event?.properties?.info?.sessionID
      if (sid && sid !== sessionID() && sid !== selected()?.run?.childID) return
      setTick((value) => value + 1)
    }),
  )
  onCleanup(() => offs.forEach((off) => off()))

  createEffect(() => {
    tick()
    void loadChildren()
    void loadAgents()
    const row = selected()
    if (row?.kind === "session") {
      const sid = sessionID()
      const status = sessionStatus()
      const busy = status === "busy" || status === "retry"
      void loadThread(sid, { busy, endedAt: sessionInfo().updated })
    } else if (row?.kind === "run" && row.run.childID) {
      const busy = row.run.live === "busy" || row.run.live === "retry" || row.run.tool === "running"
      void loadThread(row.run.childID, { busy, endedAt: row.run.ended })
    }
  })

  const move = (delta) => {
    if (narrow() && detailOpen()) return
    const total = selectable().length
    if (total === 0) return
    setCursor((value) => Math.max(0, Math.min(value + delta, total - 1)))
    setFollow(true)
    setScroll(0)
  }

  const scrollThread = (delta) => {
    setFollow(false)
    setScroll((value) => Math.max(0, value + delta))
  }

  const openSelected = () => {
    const row = selected()
    if (!row || row.kind !== "run" || !row.run.childID) return
    api.route.navigate("session", { sessionID: row.run.childID })
  }

  const leave = () => {
    const sid = sessionID()
    api.route.navigate(sid ? "session" : "home", sid ? { sessionID: sid } : undefined)
  }

  const stopSelected = () => {
    const row = selected()
    if (!row || row.kind !== "run" || !row.run.childID) return
    const run = row.run
    const busy = run.live === "busy" || run.live === "retry" || run.tool === "running"
    if (!busy) {
      api.ui.toast({ variant: "info", message: "Ese subagente ya no está corriendo", duration: 2500 })
      return
    }
    const DialogConfirm = api.ui.DialogConfirm
    api.ui.dialog.replace(() => (
      <DialogConfirm
        title="Detener subagente"
        message={`¿Detener ${run.agent} (${clip(run.description || run.prompt, 48)})?`}
        onConfirm={() => {
          api.ui.dialog.clear()
          void api.client.session
            .abort({ sessionID: run.childID })
            .then(() => setTick((value) => value + 1))
            .catch(() => {})
        }}
        onCancel={() => api.ui.dialog.clear()}
      />
    ))
  }

  useKeyboard((event) => {
    if (api.route.current.name !== ROUTE) return
    // A host dialog (e.g. the stop confirmation) owns the keyboard while open.
    if (api.ui.dialog.open) return
    const name = event.name
    const stop = () => {
      event.preventDefault?.()
      event.stopPropagation?.()
    }
    if (event.ctrl || event.meta) return
    if (name === "j" || name === "down") {
      stop()
      move(1)
    } else if (name === "k" || name === "up") {
      stop()
      move(-1)
    } else if (name === "return" || name === "enter") {
      stop()
      if (narrow()) setDetailOpen((value) => !value)
      else openSelected()
    } else if (name === "o") {
      stop()
      openSelected()
    } else if (name === "f") {
      stop()
      setFollow((value) => !value)
      setScroll(0)
    } else if (name === "pageup") {
      stop()
      scrollThread(bodyRows())
    } else if (name === "pagedown") {
      stop()
      const next = Math.max(0, scroll() - bodyRows())
      setScroll(next)
      if (next === 0) setFollow(true)
    } else if (name === "s") {
      stop()
      stopSelected()
    } else if (name === "r") {
      stop()
      const row = selected()
      if (row?.kind === "run" && row.run.childID) threadCache.delete(row.run.childID)
      setThread(null)
      void loadChildren(true)
      void loadAgents(true)
    } else if (name === "escape") {
      stop()
      if (narrow() && detailOpen()) setDetailOpen(false)
      else leave()
    } else if (name === "q") {
      stop()
      leave()
    }
  })

  const hints = () => {
    if (narrow()) return detailOpen() ? "pgup/pgdn scroll · f seguir · s detener · esc volver a la lista" : "j/k mover · enter detalle · o abrir sesión · esc volver"
    return "j/k mover · enter abrir sesión · f seguir · pgup/pgdn scroll · s detener · esc volver"
  }

  const rowLine = (row, active) => {
    const theme = api.theme.current
    const width = listContent()
    if (row.kind === "header") {
      return (
        <text fg={theme.textMuted}>
          <b>{clip(row.title, width)}</b>
        </text>
      )
    }
    if (row.kind === "note") {
      return <text fg={theme.textMuted}>{clip(`  ${row.text}`, width)}</text>
    }
    if (row.kind === "session") {
      const busy = sessionStatus() === "busy" || sessionStatus() === "retry"
      const info = sessionInfo()
      const meta = [
        info.model,
        info.tokens ? `${formatTokens(info.tokens)} tok` : undefined,
        info.cost ? formatCost(info.cost) : undefined,
      ]
        .filter(Boolean)
        .join(" · ")
      const head = `${active ? "▸" : " "}${busy ? GLYPH.running : GLYPH.queued} ${clip(sessionTitle() ?? "sesión actual", SESSION_TITLE_MAX)}`
      return (
        <text fg={active || busy ? theme.accent : theme.text}>
          {head}
          {meta ? <span fg={theme.textMuted}>{`  ${clip(meta, Math.max(0, width - head.length - 2))}`}</span> : null}
        </text>
      )
    }
    if (row.kind === "odd") {
      return <text fg={theme.textMuted}>{clip(`  · ${row.text}`, width)}</text>
    }
    const marker = active ? "▸" : " "
    if (row.kind === "agent") {
      const tag = row.agent.mode === "primary" ? "perfil" : "subagente"
      const model = shortModel(row.agent.model)
      const left = `${marker} ${clip(row.agent.name, 18)}`
      const right = `${tag}${model ? ` · ${model}` : ""}`
      return (
        <text fg={active ? theme.accent : sessionTone(api, agentTone(api, row.agent))}>
          {`${left} `}
          <span fg={theme.textMuted}>{clip(right, Math.max(0, width - left.length - 1))}</span>
        </text>
      )
    }
    const run = row.run
    const state = runState(run, now())
    const head = `${marker}${GLYPH[state]} ${clip(run.agent, 16)}`
    const meta = run.started ? formatElapsed((run.ended ?? now()) - run.started) : ""
    const description = clip(run.description || run.prompt, Math.max(4, width - head.length - 1 - (meta ? meta.length + 2 : 0)))
    return (
      <text fg={active ? theme.accent : sessionTone(api, STATE_TONE[state])}>
        {`${head} ${description}`}
        {meta ? <span fg={theme.textMuted}>{`  ${meta}`}</span> : null}
      </text>
    )
  }

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={api.theme.current.background}>
      <box flexDirection="row" paddingLeft={1}>
        <text fg={api.theme.current.accent}>{"❀ Agentes"}</text>
        <text fg={api.theme.current.textMuted}>
          {`  ·  ${clip(sessionTitle() ?? "sin sesión", 48)}  ·  ${counts().active} activos · ${counts().done} hechos${
            counts().failed ? ` · ${counts().failed} fallos` : ""
          }`}
        </text>
      </box>
      <box flexDirection="row" flexGrow={1}>
        {!narrow() || !detailOpen() ? (
          <box flexDirection="column" width={narrow() ? "100%" : listWidth()} paddingLeft={1}>
            {listWindow().map((row) => rowLine(row, selected()?.key != null && row.key === selected()?.key))}
          </box>
        ) : null}
        {!narrow() ? <text fg={api.theme.current.border}>{"│"}</text> : null}
        {!narrow() || detailOpen() ? (
          <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
            <text fg={sessionTone(api, detail().tone)}>
              <b>{clip(detail().title || "—", rightWidth())}</b>
            </text>
            <text fg={api.theme.current.textMuted}>{clip(detail().subtitle, rightWidth())}</text>
            <text> </text>
            {detailWindow().map((line) => (
              <text fg={sessionTone(api, line.tone)}>{line.text === "" ? " " : line.text}</text>
            ))}
          </box>
        ) : null}
      </box>
      <box paddingLeft={1}>
        <text fg={api.theme.current.textMuted}>{hints()}</text>
      </box>
    </box>
  )
}

const tui = async (api) => {
  api.route.register([{ name: ROUTE, render: ({ params }) => <AgentsView api={api} params={params} /> }])

  const open = () => {
    const current = api.route.current
    if (current.name === ROUTE) return
    if (current.name === "session" && current.params?.sessionID) {
      api.route.navigate(ROUTE, { sessionID: current.params.sessionID })
      return
    }
    api.ui.toast({
      variant: "warning",
      message: "Abre una sesión para ver sus agentes y subagentes",
      duration: 3000,
    })
  }

  api.keymap.registerLayer({
    commands: [
      {
        name: "kairos-agents.open",
        title: "Agentes: abrir vista",
        description: "Subagentes y agentes de la sesión (lista a la izquierda)",
        category: "Agentes",
        run: open,
      },
    ],
    bindings: VIEW_KEY_ENABLED ? [{ key: VIEW_KEY, cmd: "kairos-agents.open" }] : [],
  })

  api.command?.register?.(() => [
    {
      title: "Agentes: abrir vista",
      value: "kairos-agents.open",
      description: "Subagentes y agentes de la sesión",
      category: "Agentes",
      keybind: VIEW_KEY_ENABLED ? VIEW_KEY : undefined,
      slash: { name: "agentes" },
      onSelect: open,
    },
  ])
}

const plugin = { id, tui }
export default plugin
