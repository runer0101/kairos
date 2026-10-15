// gentle-shell portado a OpenCode: guarda de comandos destructivos + aviso y sonidos al terminar.
// Lógica de la guarda: copiada de gentle-pi (lib/destructive-command-guard.ts), MIT.
// Sonidos: tonos originales de gentle-pi (assets/sounds), MIT; apagados salvo OPENCODE_VENJIX_SOUNDS=1.
import type { Plugin } from "@opencode-ai/plugin"
import { recognizeDestructiveCommands } from "../lib/destructive-command-guard"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SOUNDS_ENABLED = process.env.OPENCODE_VENJIX_SOUNDS === "1"
const SOUNDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "sounds")

// Reproduce un tono sin bloquear: prueba reproductores en orden y sigue con el siguiente
// si el anterior no existe. Sin reproductor disponible, se ignora en silencio.
function playSound(name: "success" | "error" | "attention") {
  if (!SOUNDS_ENABLED) return
  const file = join(SOUNDS_DIR, `${name}.wav`)
  if (!existsSync(file)) return
  const candidates: [string, string[]][] =
    process.platform === "darwin"
      ? [["afplay", [file]]]
      : [
          ["paplay", [file]],
          ["pw-play", [file]],
          ["aplay", ["-q", file]],
        ]
  const tryNext = (index: number) => {
    const candidate = candidates[index]
    if (!candidate) return
    const child = spawn(candidate[0], candidate[1], { stdio: "ignore", detached: true })
    child.on("error", () => tryNext(index + 1))
    child.unref()
  }
  tryNext(0)
}

export const GentleShellPlugin: Plugin = async ({ $ }) => {
  return {
    // Bloquea (fail-closed) bash con formas destructivas reconocibles: DROP/TRUNCATE/DELETE sin WHERE,
    // rm -rf sobre rutas peligrosas, git push --force, etc.
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return
      const command = typeof output.args?.command === "string" ? output.args.command : ""
      if (!command) return
      const matches = recognizeDestructiveCommands(command)
      if (matches.length > 0) {
        const kinds = [...new Set(matches.map((m) => m.kind))].join(", ")
        throw new Error(
          `gentle-shell: comando destructivo bloqueado (${kinds}). Pide confirmación explícita al usuario antes de reintentar.`,
        )
      }
    },
    // Notificación de escritorio al terminar y sonidos opcionales: fin de tarea (success),
    // error de sesión (error) y petición de permiso o pregunta (attention).
    event: async ({ event }) => {
      const type: string = event.type
      if (type === "session.idle") playSound("success")
      else if (type === "session.error") playSound("error")
      else if (type === "permission.asked" || type === "question.asked") playSound("attention")
      if (type !== "session.idle") return
      await $`notify-send -a opencode-venjix "OpenCode" "Tarea terminada"`.nothrow().quiet()
    },
  }
}
