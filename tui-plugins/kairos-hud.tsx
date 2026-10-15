// @ts-nocheck
/** @jsxImportSource @opentui/solid */
// Kairos HUD: session row that surfaces what the OpenCode host does not paint
// natively — the active ODD task (checkbox progress from odd/tasks) and a
// stale gentle-shell sync warning. Colors come from the active theme.
import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createMemo, createSignal } from "solid-js"

const id = "kairos-hud"

// Re-read cadence for the ODD/sync snapshot (files are small; keeps I/O low).
const REFRESH_MS = 4000

const [tick, setTick] = createSignal(0)

type OddTask = { name: string; done: number; total: number }

type CacheEntry = { stamp: number; task: OddTask }

const cache = new Map<string, CacheEntry>()

const shortName = (name: string) => (name.length > 26 ? `${name.slice(0, 25)}…` : name)

const countCheckboxes = (text: string) => {
  const boxes = text.match(/^[-*]\s+\[( |x|X)\]/gm) ?? []
  const done = boxes.filter((box) => /\[[xX]\]/.test(box)).length
  return { done, total: boxes.length }
}

// ODD tasks of the session worktree: newest first, cached by mtime+size.
const readOddTasks = (worktree: string): Array<OddTask & { mtime: number }> => {
  const dir = join(worktree, "odd", "tasks")
  let entries: string[]
  try {
    entries = readdirSync(dir).filter((name) => name.endsWith(".md") && name !== "TEMPLATE.md")
  } catch {
    return []
  }
  const tasks: Array<OddTask & { mtime: number }> = []
  for (const entry of entries) {
    const file = join(dir, entry)
    try {
      const stat = statSync(file)
      const stamp = stat.mtimeMs + stat.size
      const hit = cache.get(file)
      let task: OddTask
      if (hit && hit.stamp === stamp) {
        task = hit.task
      } else {
        const { done, total } = countCheckboxes(readFileSync(file, "utf8"))
        task = { name: shortName(entry.replace(/\.md$/, "")), done, total }
        cache.set(file, { stamp, task })
      }
      if (task.total > 0) tasks.push({ ...task, mtime: stat.mtimeMs })
    } catch {
      // unreadable entry: skip
    }
  }
  tasks.sort((a, b) => b.mtime - a.mtime)
  return tasks
}

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
            {`◆ odd ${task().name} ${task().done}/${task().total}${task().done >= task().total ? " ✓" : ""}`}
          </text>
        ) : null}
        {stale() ? <text fg={api.theme.current.warning}>{" · sync pendiente"}</text> : null}
      </box>
    )
  }

  api.slots.register({
    order: 95,
    slots: {
      session_prompt_right: () => <Row />,
    },
  })
}

const plugin = { id, tui }
export default plugin
