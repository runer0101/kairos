// ODD task reader shared by the HUD (kairos-hud.tsx) and the agents view
// (kairos-agents.tsx): the session worktree's odd/tasks, newest first, cached
// by mtime+size. Width budgets stay in each consumer.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

export type OddTask = { name: string; done: number; total: number; pending: string[] }

type CacheEntry = { stamp: number; task: OddTask }

const cache = new Map<string, CacheEntry>()

const countCheckboxes = (text: string) => {
  const boxes = [...text.matchAll(/^[-*]\s+\[( |x|X)\]\s*(.*)$/gm)]
  const done = boxes.filter((box) => box[1].toLowerCase() === "x").length
  const pending = boxes.filter((box) => box[1] === " ").map((box) => box[2].trim())
  return { done, total: boxes.length, pending }
}

export const readOddTasks = (worktree: string): Array<OddTask & { mtime: number }> => {
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
        const { done, total, pending } = countCheckboxes(readFileSync(file, "utf8"))
        task = { name: entry.replace(/\.md$/, ""), done, total, pending }
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
