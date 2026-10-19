// @ts-nocheck
/** @jsxImportSource @opentui/solid */
// Kairos HUD: session row that surfaces what the OpenCode host does not paint
// natively — the active ODD task (checkbox progress from odd/tasks) and a
// stale gentle-shell sync warning. Colors come from the active theme.
import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createMemo, createSignal } from "solid-js"
import { readOddTasks } from "./odd-tasks"

const id = "kairos-hud"

// Re-read cadence for the ODD/sync snapshot (files are small; keeps I/O low).
const REFRESH_MS = 4000

// Panel rows: pending steps shown before collapsing into "… +N".
const PENDING_ROWS = 3

// Width budgets measured on the host (1.18.35): the session_prompt_right slot
// is ~26 columns with the default model chip, and the sidebar section ~33; a
// longer row makes the host wrap it onto a second line and lose the counter.
const ROW_NAME_MAX = 12
const PANEL_NAME_MAX = 21
const PANEL_ITEM_MAX = 30

const [tick, setTick] = createSignal(0)

const short = (text: string, max = 44) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

// Is the port behind the installed gentle-shell? (launcher writes the marker;
// the version file lives behind the ~/.gentle-shell/current symlink)
const syncPending = (): boolean => {
  const configDir = process.env.OPENCODE_CONFIG_DIR
  const home = process.env.HOME
  if (!configDir || !home) return false
  try {
    const marker = JSON.parse(readFileSync(join(configDir, ".gentle-shell-sync.json"), "utf8"))
    const current = readFileSync(
      join(home, ".gentle-shell", "current", ".gentle-shell-version"),
      "utf8",
    ).trim()
    return Boolean(marker?.gentleShell) && marker.gentleShell !== current
  } catch {
    return false
  }
}

const tui: TuiPlugin = async (api) => {
  const interval = setInterval(() => setTick((value) => value + 1), REFRESH_MS)
  api.lifecycle.onDispose(() => clearInterval(interval))

  const Row = () => {
    const task = createMemo(() => {
      tick()
      const tasks = readOddTasks(api.state.path.worktree)
      return tasks.find((entry) => entry.done < entry.total) ?? tasks[0]
    })
    const stale = createMemo(() => {
      tick()
      return syncPending()
    })

    return (
      <box flexDirection="row">
        {task() ? (
          <text fg={task().done >= task().total ? api.theme.current.success : api.theme.current.accent}>
            {`◆ odd ${short(task().name, ROW_NAME_MAX)} ${task().done}/${task().total}${task().done >= task().total ? " ✓" : ""}`}
          </text>
        ) : null}
        {stale() ? <text fg={api.theme.current.warning}>{" · sync pendiente"}</text> : null}
      </box>
    )
  }

  // Sidebar section: the active ODD task with its next pending steps — the
  // project plan nobody else knows about (the host paints todos/MCP/LSP).
  const OddPanel = () => {
    const active = createMemo(() => {
      tick()
      const tasks = readOddTasks(api.state.path.worktree)
      return tasks.find((entry) => entry.done < entry.total) ?? tasks[0]
    })
    const stale = createMemo(() => {
      tick()
      return syncPending()
    })

    return (
      <box flexDirection="column">
        {active() ? (
          <text fg={active().done >= active().total ? api.theme.current.success : api.theme.current.accent}>
            {`◆ ODD ${short(active().name, PANEL_NAME_MAX)} ${active().done}/${active().total}`}
          </text>
        ) : null}
        {active() ? active().pending.slice(0, PENDING_ROWS).map((item) => <text fg={api.theme.current.textMuted}>{`· ${short(item, PANEL_ITEM_MAX)}`}</text>) : null}
        {active() && active().pending.length > PENDING_ROWS ? (
          <text fg={api.theme.current.textMuted}>{`· … +${active().pending.length - PENDING_ROWS}`}</text>
        ) : null}
        {stale() ? <text fg={api.theme.current.warning}>{"⚠ sync gentle-shell"}</text> : null}
      </box>
    )
  }

  api.slots.register({
    order: 95,
    slots: {
      session_prompt_right: () => <Row />,
      sidebar_content: () => <OddPanel />,
    },
  })
}

const plugin = { id, tui }
export default plugin
