// Pruebas del instalador web local: loopback, token, cabeceras y plan.
// No ejecuta la instalación real (`allowInstall: false`).
import { test } from "node:test"
import assert from "node:assert/strict"
import { request } from "node:http"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { buildPlan, startInstaller } from "../scripts/install-web.mjs"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const INSTALL = readFileSync(join(ROOT, "install.sh"), "utf8")

const httpStatus = (port, path, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, headers }, (res) => {
      res.resume()
      res.on("end", () => resolve(res.statusCode))
    })
    req.on("error", reject)
    req.end()
  })

test("install.sh expone --web y delega en el servidor local", () => {
  assert.match(INSTALL, /--web\) web_install/)
  assert.match(INSTALL, /install-web\.mjs/)
  assert.match(INSTALL, /exec node "\$REPO\/scripts\/install-web\.mjs"/)
})

test("el plan detecta el sistema sin inventar versiones ni exponer la ruta personal", () => {
  const plan = buildPlan(ROOT)
  assert.equal(plan.os, "Linux")
  assert.ok(["x86_64", "arm64", "ia32"].includes(plan.arch))
  assert.equal(typeof plan.supported, "boolean")
  assert.ok(Array.isArray(plan.tools))
  assert.ok(plan.tools.some((tool) => tool.name === "Node.js"))
  const expected = ROOT.startsWith(`${process.env.HOME}/`) ? `~${ROOT.slice(process.env.HOME.length)}` : ROOT
  assert.equal(plan.repo, expected)
  assert.ok(!JSON.stringify(plan).includes(process.env.HOME ?? "/home/"), "el plan no debe incluir la ruta absoluta del usuario")
})

test("el wizard solo responde en loopback, con token y con cabeceras seguras", async () => {
  const app = await startInstaller({ repo: ROOT, port: 0, noOpen: true, allowInstall: false })
  try {
    assert.equal(await httpStatus(app.port, "/"), 403, "sin token no se sirve la página")
    assert.equal(await httpStatus(app.port, "/?token=incorrecto"), 403, "token inválido")

    const page = await fetch(`http://127.0.0.1:${app.port}/?token=${app.token}`)
    assert.equal(page.status, 200)
    assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'none'/)
    assert.equal(page.headers.get("x-content-type-options"), "nosniff")
    assert.match(await page.text(), /Instalar kairos/)

    const plan = await fetch(`http://127.0.0.1:${app.port}/api/plan?token=${app.token}`)
    assert.equal(plan.status, 200)
    assert.equal((await plan.json()).os, "Linux")

    assert.equal(await httpStatus(app.port, `/?token=${app.token}`, { Host: "evil.example" }), 403, "Host ajeno")
    assert.equal(await httpStatus(app.port, "/app.js"), 200, "los assets estáticos no exponen datos")
  } finally {
    await app.close()
  }
})

test("la acción de instalar está deshabilitada en modo prueba", async () => {
  const app = await startInstaller({ repo: ROOT, port: 0, noOpen: true, allowInstall: false })
  try {
    const response = await fetch(`http://127.0.0.1:${app.port}/api/install?token=${app.token}`, { method: "POST" })
    assert.equal(response.status, 403)
    assert.equal(app.state.phase, "idle")
  } finally {
    await app.close()
  }
})

test("el wizard ejecuta install.sh y redacta la ruta del usuario en el log", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "kairos-web-"))
  const script = join(tmp, "install.sh")
  writeFileSync(script, '#!/usr/bin/env bash\necho "hola desde el instalador"\necho "ruta: $HOME/privado"\nexit 0\n')
  chmodSync(script, 0o755)
  const app = await startInstaller({ repo: tmp, port: 0, noOpen: true, allowInstall: true })
  try {
    const response = await fetch(`http://127.0.0.1:${app.port}/api/install?token=${app.token}`, { method: "POST" })
    assert.equal(response.status, 202)
    for (let attempt = 0; attempt < 50 && app.state.phase === "running"; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 50))
    }
    assert.equal(app.state.phase, "done")
    assert.equal(app.state.exitCode, 0)
    assert.ok(app.state.log.includes("hola desde el instalador"))
    assert.ok(app.state.log.some((line) => line.includes("~/privado")), "la ruta se muestra con ~")
    assert.ok(!app.state.log.some((line) => line.includes(process.env.HOME ?? "/home/")), "sin ruta absoluta en el log")
  } finally {
    await app.close()
    rmSync(tmp, { recursive: true, force: true })
  }
})
