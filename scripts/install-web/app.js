const token = new URLSearchParams(location.search).get("token") ?? ""
const withToken = (path) => `${path}?token=${encodeURIComponent(token)}`
const $ = (id) => document.getElementById(id)

const setText = (id, text) => {
  const node = $(id)
  if (node) node.textContent = text
}

const renderSystem = (plan) => {
  const system = $("system")
  system.replaceChildren()
  const rows = [
    ["Sistema", `${plan.os} · ${plan.arch}`],
    ["glibc", plan.libc ?? "desconocido"],
    ["Repositorio", plan.repo],
    ["Destino", plan.canonical],
    ["Lanzador", plan.launcher],
    ["gentle-shell", plan.gentleShellVersion ?? "no instalado"],
  ]
  for (const [label, value] of rows) {
    const wrapper = document.createElement("div")
    const dt = document.createElement("dt")
    dt.textContent = label
    const dd = document.createElement("dd")
    dd.textContent = value
    wrapper.append(dt, dd)
    system.append(wrapper)
  }

  const tools = $("tools")
  tools.replaceChildren()
  for (const tool of plan.tools) {
    const tr = document.createElement("tr")
    const name = document.createElement("td")
    name.textContent = tool.name
    const detected = document.createElement("td")
    detected.textContent = tool.version ?? "no encontrada"
    detected.className = tool.version ? "ok" : "missing"
    const required = document.createElement("td")
    required.textContent = tool.required ?? "—"
    tr.append(name, detected, required)
    tools.append(tr)
  }

  $("canonical").textContent = plan.canonical
  const state = $("system-state")
  const button = $("install")
  if (plan.supported) {
    state.textContent = "Compatible"
    state.className = "ok"
    button.disabled = false
    setText("status", "Todo listo. Pulsa Instalar kairos para empezar.")
  } else {
    state.textContent = `No compatible: ${plan.os} · ${plan.libc ?? "libc desconocida"}`
    state.className = "bad"
    button.disabled = true
    setText("status", "kairos requiere Linux con glibc en x86_64 o arm64.")
  }
}

const renderStatus = (status) => {
  const log = $("log")
  log.textContent = status.log.join("\n")
  log.scrollTop = log.scrollHeight
  if (status.phase === "running") {
    setText("status", "Instalando… no cierres esta pestaña.")
    $("install").disabled = true
    return true
  }
  if (status.phase === "done") {
    setText("status", "Instalación completa.")
    $("install").disabled = true
    $("next").hidden = false
    return false
  }
  if (status.phase === "error") {
    setText("status", `La instalación falló (código ${status.exitCode ?? "desconocido"}). Revisa el log.`)
    $("install").disabled = false
    return false
  }
  return false
}

const poll = async () => {
  const response = await fetch(withToken("/api/status"))
  if (!response.ok) {
    setText("status", "El enlace caducó o el servidor se cerró. Vuelve a ejecutar el instalador.")
    return
  }
  const status = await response.json()
  if (renderStatus(status)) setTimeout(poll, 700)
}

const install = async () => {
  $("install").disabled = true
  setText("status", "Iniciando la instalación…")
  const response = await fetch(withToken("/api/install"), { method: "POST" })
  if (!response.ok && response.status !== 409) {
    const body = await response.json().catch(() => ({}))
    setText("status", body.error ?? "No se pudo iniciar la instalación.")
    $("install").disabled = false
    return
  }
  void poll()
}

const close = async () => {
  await fetch(withToken("/api/close"), { method: "POST" }).catch(() => {})
  setText("status", "Servidor cerrado. Puedes cerrar esta pestaña.")
  $("install").disabled = true
}

$("install").addEventListener("click", () => void install())
$("close").addEventListener("click", () => void close())

void (async () => {
  try {
    const response = await fetch(withToken("/api/plan"))
    if (!response.ok) throw new Error("plan no disponible")
    renderSystem(await response.json())
    void poll()
  } catch {
    setText("status", "No se pudo leer el plan. Vuelve a ejecutar el instalador.")
  }
})()
