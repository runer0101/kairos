// gentle-shell portado a OpenCode: guarda de comandos destructivos + aviso al terminar.
// Lógica de la guarda: copiada de gentle-pi (lib/destructive-command-guard.ts), MIT.
import type { Plugin } from "@opencode-ai/plugin"
import { recognizeDestructiveCommands } from "../lib/destructive-command-guard"

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
    // Notificación de escritorio cuando la sesión queda inactiva (tarea terminada).
    event: async ({ event }) => {
      if (event.type !== "session.idle") return
      await $`notify-send -a opencode-venjix "OpenCode" "Tarea terminada"`.nothrow().quiet()
    },
  }
}
