// Pack de sonidos nativo de OpenCode: registra los tonos de gentle-shell como pack "venjix".
// Se activa de forma persistente solo con OPENCODE_VENJIX_SOUNDS=1; el volumen y el modo
// "solo cuando la ventana no tiene foco" los gestiona la configuración de atención de OpenCode.
import type { TuiPlugin } from "@opencode-ai/plugin/tui"

const id = "gentle-sounds"

const tui: TuiPlugin = async (api) => {
  const base = (typeof process !== "undefined" && process.env?.OPENCODE_CONFIG_DIR) || ""
  if (!base) return
  const dir = `${base}/assets/sounds`

  let unregister: (() => void) | undefined
  try {
    unregister = api.attention.soundboard.registerPack({
      id: "venjix",
      name: "venjix (gentle-shell)",
      sounds: {
        default: `${dir}/attention.wav`,
        done: `${dir}/success.wav`,
        subagent_done: `${dir}/success.wav`,
        error: `${dir}/error.wav`,
        permission: `${dir}/attention.wav`,
        question: `${dir}/attention.wav`,
      },
    })
  } catch {
    return
  }
  api.lifecycle.onDispose(() => unregister?.())

  const enabled = typeof process !== "undefined" && process.env?.OPENCODE_VENJIX_SOUNDS === "1"
  if (enabled && api.attention.soundboard.current() !== "venjix") {
    try {
      api.attention.soundboard.activate("venjix", { persist: true })
    } catch {
      // sin activación persistente: el pack queda registrado y se puede elegir a mano.
    }
  }
}

const plugin = { id, tui }
export default plugin
