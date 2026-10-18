// gentle-shell portado a OpenCode: guarda de comandos destructivos, piso de rutas sensibles
// y aviso de escritorio al terminar un turno. Lógica de la guarda: copiada de gentle-pi
// (lib/destructive-command-guard.ts), MIT. Los sonidos viven en el pack nativo "kairos"
// (tui-plugins/gentle-sounds.ts; se activa con KAIROS_SOUNDS=1).
//
// El aviso de escritorio espeja al plugin interno "internal:notifications" de OpenCode:
// avisa solo sesiones principales al pasar de busy a idle, calla el "listo" después de un
// error (avisando el error) y no avisa por subagentes ni por las sesiones internas del
// clasificador. Un turno terminado no es una tarea terminada: el texto lo dice. Se apaga
// con KAIROS_NO_NOTIFY=1.
import type { Plugin } from "@opencode-ai/plugin"
import { recognizeDestructiveCommands } from "../lib/destructive-command-guard.ts"
import { CLASSIFIER_SESSION_TITLE } from "../lib/auto-approval/session.ts"

// Rutas sensibles: piso inviolable para todos los agentes (incluido kairos-auto, que se
// salta las preguntas de permiso). Leer o escribir aquí se bloquea siempre.
const SENSITIVE_PATH = [
  /(^|\/)\.ssh(\/|$)/,
  /(^|\/)\.gnupg(\/|$)/,
  /(^|\/)\.aws(\/|$)/,
  /(^|\/)\.git-credentials$/,
  /(^|\/)\.netrc$/,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/,
  /(^|\/)auth\.json$/,
]

// Aviso de escritorio: marca propia (nunca "OpenCode") y textos honestos.
const NOTIFY_APP = "kairos"
const NOTIFY_TITLE = "Kairos"
const NOTIFY_DONE = "Listo para tu siguiente mensaje"
const NOTIFY_ERROR = "Error en la sesión"
const NOTIFY_MODEL_STOPPED = "El modelo dejó de responder"

function blockedSensitivePath(args: Record<string, unknown> | undefined): string | null {
  if (!args) return null
  const candidate = [args.filePath, args.path].find((v) => typeof v === "string") as string | undefined
  if (!candidate) return null
  return SENSITIVE_PATH.some((re) => re.test(candidate)) ? candidate : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** Texto del aviso de error; null cuando no corresponde avisar (cancelación del usuario). */
function errorNotice(error: unknown): string | null {
  const record = asRecord(error)
  if (record?.name === "MessageAbortedError") return null
  const data = asRecord(record?.data)
  if (data?.message === "SSE read timed out") return NOTIFY_MODEL_STOPPED
  return NOTIFY_ERROR
}

export const GentleShellPlugin: Plugin = async ({ $ }) => {
  // Estado del aviso de escritorio: espejo del plugin interno "internal:notifications"
  // de OpenCode. Los sets se alimentan en el hilo de eventos y se limpian al borrar la sesión.
  const notifyEnabled = process.env.KAIROS_NO_NOTIFY !== "1"
  /** Sesiones hijas (subagentes): terminan a mitad de tarea, no se avisan. */
  const childSessions = new Set<string>()
  /** Sesiones internas del clasificador de auto-aprobación: tampoco se avisan. */
  const internalSessions = new Set<string>()
  /** Sesiones que corrieron desde el último idle: filtran idles espurios. */
  const busySessions = new Set<string>()
  /** Sesiones con error reciente: el idle siguiente no debe decir "listo". */
  const erroredSessions = new Set<string>()

  async function notify(message: string): Promise<void> {
    if (!notifyEnabled) return
    await $`notify-send -a ${NOTIFY_APP} ${NOTIFY_TITLE} ${message}`.nothrow().quiet()
  }

  function trackSession(info: { id: string; title?: string; parentID?: string } | undefined): void {
    if (!info || typeof info.id !== "string") return
    if (typeof info.parentID === "string" && info.parentID !== "") childSessions.add(info.id)
    if (info.title === CLASSIFIER_SESSION_TITLE) internalSessions.add(info.id)
  }

  function isInternal(sessionID: string): boolean {
    return childSessions.has(sessionID) || internalSessions.has(sessionID)
  }

  function forgetSession(sessionID: string): void {
    childSessions.delete(sessionID)
    internalSessions.delete(sessionID)
    busySessions.delete(sessionID)
    erroredSessions.delete(sessionID)
  }

  return {
    // Bloquea (fail-closed) bash con formas destructivas reconocibles: DROP/TRUNCATE/DELETE sin WHERE,
    // rm -rf sobre rutas peligrosas, git push --force, etc. Además, bloquea rutas sensibles
    // (claves SSH/GPG, credenciales AWS/git/netrc, auth.json) en lectura y escritura.
    "tool.execute.before": async (input, output) => {
      if (["read", "edit", "write", "grep"].includes(input.tool)) {
        const blocked = blockedSensitivePath(output.args)
        if (blocked) {
          throw new Error(
            `gentle-shell: ruta sensible bloqueada (${blocked}). Esa ruta la debe manejar el usuario a mano.`,
          )
        }
      }
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
      // Un comando que referencia credenciales también se bloquea: la vía bash no debe
      // esquivar la protección de rutas sensibles (p. ej. `cat ~/.ssh/id_rsa` en kairos-auto).
      if (SENSITIVE_PATH.some((re) => re.test(command))) {
        throw new Error(
          "gentle-shell: el comando referencia una ruta sensible (.ssh, .gnupg, .aws o credenciales) y se bloqueó. Esa ruta la debe manejar el usuario a mano.",
        )
      }
    },
    // Aviso de escritorio: solo un busy→idle de una sesión principal merece aviso.
    event: async ({ event }) => {
      switch (event.type) {
        case "session.created":
        case "session.updated":
          trackSession(event.properties.info)
          return
        case "session.deleted":
          forgetSession(event.properties.info.id)
          return
        case "session.status": {
          const { sessionID, status } = event.properties
          if (status.type === "busy" || status.type === "retry") {
            busySessions.add(sessionID)
            erroredSessions.delete(sessionID)
            return
          }
          if (status.type !== "idle") return
          if (!busySessions.delete(sessionID)) return
          if (isInternal(sessionID)) {
            erroredSessions.delete(sessionID)
            return
          }
          if (erroredSessions.delete(sessionID)) return
          await notify(NOTIFY_DONE)
          return
        }
        case "session.error": {
          const sessionID = event.properties.sessionID
          if (!sessionID) return
          erroredSessions.add(sessionID)
          if (isInternal(sessionID)) return
          const message = errorNotice(event.properties.error)
          if (message) await notify(message)
          return
        }
      }
    },
  }
}
