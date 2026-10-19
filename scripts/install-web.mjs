#!/usr/bin/env node
// Instalador web local de kairos: sirve un wizard en 127.0.0.1 que muestra el
// plan detectado y ejecuta el mismo install.sh del repositorio, con el log en
// vivo. No escucha fuera de loopback, exige un token de un solo uso en la URL
// y nunca acepta comandos del cliente: la única acción es `bash install.sh`.
import { spawn, execFileSync } from "node:child_process"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { createServer } from "node:http"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ASSETS = join(HERE, "install-web")
const DEFAULT_REPO = resolve(HERE, "..")
const TOKEN_TTL_MS = 30 * 60 * 1000
const MAX_LOG_LINES = 2000

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
}

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
const stripAnsi = (line) => String(line).replace(ANSI, "").replace(/\r/g, "")

// Nunca enviar la ruta absoluta del usuario al navegador: el plan y el log
// muestran ~/... aunque el instalador trabaje con rutas reales.
const displayPath = (path) => {
  const home = process.env.HOME
  if (!home) return path
  if (path === home) return "~"
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

const redactHome = (text) => {
  const home = process.env.HOME
  return home ? String(text).split(home).join("~") : String(text)
}

const parseArgs = (argv) => {
  const out = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith("--")) continue
    const name = arg.slice(2)
    if (["no-open", "no-install"].includes(name)) {
      out[name] = true
      continue
    }
    out[name] = argv[index + 1]
    index += 1
  }
  return out
}

const versionOf = (command, args) => {
  try {
    const output = execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2500,
    }).trim()
    return output.split("\n").filter(Boolean).pop() ?? null
  } catch {
    return null
  }
}

const tokenMatches = (expected, received) => {
  const left = Buffer.from(String(received ?? ""))
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

const securityHeaders = (res) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  )
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("Cache-Control", "no-store")
}

const sendJson = (res, status, body) => {
  securityHeaders(res)
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(body))
}

const sendText = (res, status, text, type = "text/plain; charset=utf-8") => {
  securityHeaders(res)
  res.writeHead(status, { "Content-Type": type })
  res.end(text)
}

const readAsset = (name) => {
  try {
    return readFileSync(join(ASSETS, name), "utf8")
  } catch {
    return null
  }
}

export const buildPlan = (repo) => {
  const home = process.env.HOME ?? ""
  const arch = process.arch === "x64" ? "x64" : process.arch
  const atHome = (...parts) => join(home, ...parts)
  const firstExisting = (...paths) => paths.find((path) => path && existsSync(path))
  const gentleShellVersion = (() => {
    try {
      return readFileSync(atHome(".gentle-shell", "current", ".gentle-shell-version"), "utf8").trim()
    } catch {
      return null
    }
  })()
  const libc = (() => {
    try {
      const output = execFileSync("ldd", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      return /musl/i.test(output) ? "musl" : "glibc"
    } catch {
      return null
    }
  })()
  const opencodeBin = firstExisting(atHome(".opencode", "bin", "opencode"), "opencode")
  const engramBin = firstExisting(atHome(".local", "share", "kairos", "engram-3.4.0", "engram"), "engram")
  const pnpmBin = firstExisting(atHome(".local", "share", "kairos", `pnpm-11.22.0-linux-${arch}`, "pnpm"), "pnpm")
  const tools = [
    { name: "Node.js", version: process.version.replace(/^v/, ""), required: ">=22" },
    { name: "pnpm", version: versionOf(pnpmBin, ["--version"]), required: "11.22.0" },
    { name: "OpenCode", version: versionOf(opencodeBin, ["--version"]), required: "1.18.x" },
    { name: "engram", version: versionOf(engramBin, ["--version"]), required: "3.4.0" },
    { name: "git", version: versionOf("git", ["--version"]), required: null },
    { name: "curl", version: versionOf("curl", ["--version"]), required: null },
  ]
  return {
    os: process.platform === "linux" ? "Linux" : process.platform,
    arch: process.arch === "x64" ? "x86_64" : process.arch,
    libc,
    repo: displayPath(repo),
    canonical: home ? displayPath(atHome(".config", "kairos")) : "~/.config/kairos",
    launcher: home ? displayPath(atHome(".local", "bin", "kairos")) : "~/.local/bin/kairos",
    gentleShellVersion,
    supported: process.platform === "linux" && ["x64", "arm64"].includes(process.arch) && libc !== "musl",
    tools,
  }
}

export const startInstaller = async (options = {}) => {
  const repo = resolve(options.repo ?? DEFAULT_REPO)
  const installScript = join(repo, "install.sh")
  if (!existsSync(installScript)) throw new Error(`falta ${installScript}`)
  const allowInstall = options.allowInstall !== false
  const token = options.token ?? randomBytes(24).toString("base64url")
  const state = {
    phase: "idle",
    log: [],
    exitCode: null,
    startedAt: null,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  }
  let child = null
  let closed = false

  const pushLog = (chunk) => {
    for (const line of String(chunk).split("\n")) {
      const clean = redactHome(stripAnsi(line)).trimEnd()
      if (!clean) continue
      state.log.push(clean)
    }
    if (state.log.length > MAX_LOG_LINES) state.log.splice(0, state.log.length - MAX_LOG_LINES)
  }

  const server = createServer((req, res) => {
    const remote = req.socket.remoteAddress
    const loopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1"
    if (!loopback) return sendText(res, 403, "solo loopback")

    const port = server.address()?.port
    const host = String(req.headers.host ?? "").toLowerCase()
    const validHost = host === `127.0.0.1:${port}` || host === `localhost:${port}`
    if (!validHost) return sendText(res, 403, "host no permitido")

    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`)
    const asset = url.pathname === "/app.js" ? "app.js" : url.pathname === "/style.css" ? "style.css" : null
    if (req.method === "GET" && asset) {
      const body = readAsset(asset)
      if (body === null) return sendText(res, 404, "no encontrado")
      return sendText(res, 200, body, MIME[`.${asset.split(".").pop()}`])
    }

    if (!tokenMatches(token, url.searchParams.get("token"))) return sendText(res, 403, "token invalido")
    if (Date.now() > state.expiresAt && state.phase !== "running") return sendText(res, 403, "enlace caducado")

    if (req.method === "GET" && url.pathname === "/") {
      const html = readAsset("index.html")
      if (html === null) return sendText(res, 500, "falta index.html")
      return sendText(res, 200, html, MIME[".html"])
    }
    if (req.method === "GET" && url.pathname === "/api/plan") {
      return sendJson(res, 200, buildPlan(repo))
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      return sendJson(res, 200, {
        phase: state.phase,
        exitCode: state.exitCode,
        startedAt: state.startedAt,
        log: state.log.slice(-400),
      })
    }
    if (req.method === "POST" && url.pathname === "/api/install") {
      if (!allowInstall) return sendJson(res, 403, { error: "instalacion deshabilitada" })
      if (state.phase === "running") return sendJson(res, 409, { error: "ya hay una instalacion en curso" })
      const origin = req.headers.origin
      const allowed = [`http://127.0.0.1:${port}`, `http://localhost:${port}`]
      if (origin && !allowed.includes(origin)) return sendJson(res, 403, { error: "origen no permitido" })
      state.phase = "running"
      state.exitCode = null
      state.log = []
      state.startedAt = Date.now()
      state.expiresAt = Date.now() + TOKEN_TTL_MS
      pushLog("▸ instalando kairos…")
      child = spawn("bash", [installScript], {
        cwd: repo,
        env: { ...process.env, KAIROS_WEB: "1", NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      })
      child.stdout.on("data", pushLog)
      child.stderr.on("data", pushLog)
      child.on("error", (error) => {
        pushLog(`✗ no se pudo iniciar el instalador: ${error.message}`)
        state.phase = "error"
        state.exitCode = 1
        child = null
      })
      child.on("close", (code) => {
        state.exitCode = typeof code === "number" ? code : 1
        state.phase = state.exitCode === 0 ? "done" : "error"
        pushLog(state.exitCode === 0 ? "✓ instalación completa" : `✗ instalación terminada con código ${state.exitCode}`)
        child = null
        state.expiresAt = Date.now() + TOKEN_TTL_MS
      })
      return sendJson(res, 202, { ok: true })
    }
    if (req.method === "POST" && url.pathname === "/api/close") {
      sendJson(res, 200, { ok: true })
      setTimeout(() => shutdown(0), 50)
      return
    }
    return sendText(res, 404, "no encontrado")
  })

  const shutdown = (code) => {
    if (closed) return
    closed = true
    if (child) {
      child.kill("SIGTERM")
      child = null
    }
    server.close(() => process.exit(code))
    server.closeAllConnections?.()
    setTimeout(() => process.exit(code), 1000).unref()
  }

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen)
    server.listen(Number(options.port ?? 0), "127.0.0.1", resolveListen)
  })
  const port = server.address().port
  const url = `http://127.0.0.1:${port}/?token=${token}`

  if (!options.noOpen) {
    try {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref()
    } catch {
      // sin xdg-open el enlace se imprime igual.
    }
  }

  const close = () =>
    new Promise((resolveClose) => {
      if (closed) return resolveClose()
      closed = true
      if (child) {
        child.kill("SIGTERM")
        child = null
      }
      server.close(() => resolveClose())
      server.closeAllConnections?.()
    })

  return { server, port, token, url, state, close }
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  try {
    const app = await startInstaller({
      repo: args.repo ?? DEFAULT_REPO,
      port: args.port,
      noOpen: Boolean(args["no-open"]),
      allowInstall: !args["no-install"],
    })
    console.log(`kairos: instalador web en ${app.url}`)
    console.log("kairos: solo accesible desde esta máquina; el enlace caduca en 30 minutos")
    if (args["no-open"]) {
      console.log("kairos: abre ese enlace en tu navegador")
    }
    process.on("SIGINT", () => void app.close().then(() => process.exit(0)))
  } catch (error) {
    console.error(`kairos: no se pudo iniciar el instalador web: ${error.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
