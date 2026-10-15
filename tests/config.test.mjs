// Pruebas de configuración: perfiles, modelo por defecto, permisos y referencias a archivos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(ROOT, "opencode.json"), "utf8"));
const DEEPSEEK = "opencode-go/deepseek-v4.1-flash";

test("el agente por defecto es el perfil equilibrado", () => {
  assert.equal(cfg.default_agent, "venjix");
  assert.equal(cfg.agent.venjix.mode, "primary");
});

test("el modelo por defecto es DeepSeek v4.1 Flash", () => {
  assert.equal(cfg.model, DEEPSEEK);
  assert.equal(cfg.small_model, DEEPSEEK);
});

test("el proveedor ollama global queda deshabilitado (evita modelos fantasma)", () => {
  assert.ok(cfg.disabled_providers.includes("ollama"));
  assert.equal(cfg.provider, undefined, "no debe haber proveedores fijos en opencode.json");
});

test("existen los perfiles como agentes primarios con el mismo prompt", () => {
  for (const name of ["venjix", "venjix-auto"]) {
    const a = cfg.agent[name];
    assert.ok(a, `falta el perfil ${name}`);
    assert.equal(a.mode, "primary", `${name} debe ser primario`);
    assert.equal(a.prompt, "{file:./prompts/orchestrator.md}", `${name} debe usar el prompt común`);
    assert.ok(a.description && a.description.length > 10, `${name} necesita descripción`);
  }
  assert.ok(existsSync(join(ROOT, "prompts", "orchestrator.md")), "falta prompts/orchestrator.md");
});

test("todos los perfiles usan DeepSeek v4.1 Flash", () => {
  for (const name of ["venjix", "venjix-auto"]) {
    assert.equal(cfg.agent[name].model, DEEPSEEK, `${name} debe usar DeepSeek v4.1 Flash`);
  }
});

test("modo normal: edición y bash piden confirmación, lectura libre", () => {
  assert.equal(cfg.permission.edit, "ask");
  assert.equal(cfg.permission.read, "allow");
  assert.equal(cfg.permission.bash["*"], "ask");
  assert.equal(cfg.permission.bash["git push*"], "ask");
});

test("las lecturas habituales de bash están permitidas y van después del comodín", () => {
  const keys = Object.keys(cfg.permission.bash);
  assert.equal(keys[0], "*", "el comodín debe ir primero (la última regla que coincide gana)");
  assert.equal(cfg.permission.bash["git status*"], "allow");
});

test("modo automático (venjix-auto) permite todo; la guarda de comandos sigue en el plugin", () => {
  assert.equal(cfg.agent["venjix-auto"].permission, "allow");
  assert.ok(existsSync(join(ROOT, "plugins", "gentle-shell.ts")));
});

test("build, plan y el perfil duplicado quedan fuera del selector", () => {
  assert.equal(cfg.agent.build?.disable, true, "build debe estar desactivado");
  assert.equal(cfg.agent.plan?.disable, true, "plan debe estar desactivado");
  assert.equal(cfg.agent["venjix-deep"], undefined, "venjix-deep se retiró");
});

test("subagentes con modelo propio: explorador con pasos acotados y juez B con el modelo por defecto", () => {
  assert.equal(cfg.agent["gentle-ai-explore"].model, DEEPSEEK);
  assert.ok(Number.isInteger(cfg.agent["gentle-ai-explore"].steps));
  assert.equal(cfg.agent["jd-judge-b"].model, DEEPSEEK);
});

test("funciones de calidad activas: lsp, formatter, snapshot (undo)", () => {
  assert.equal(cfg.lsp, true);
  assert.equal(cfg.formatter, true);
  assert.equal(cfg.snapshot, true);
});

// La configuración no debe contener rutas absolutas de la máquina: el repo se publica
// tal cual. El binario de engram se referencia como {env:HOME}/... y lo expande el runtime.
function assertNoAbsolutePaths(obj) {
  const absolute = JSON.stringify(obj).match(/"\/[^"]+"/g) || [];
  assert.deepEqual(absolute, [], `rutas absolutas inesperadas: ${absolute.join(", ")}`);
}

test("la configuración no contiene rutas absolutas", () => {
  assertNoAbsolutePaths(cfg);
});

test("una ruta absoluta no permitida se detecta", () => {
  const bad = structuredClone(cfg);
  bad.mcp.engram.command = ["/tmp/opencode", "mcp"];
  assert.throws(() => assertNoAbsolutePaths(bad), /rutas absolutas inesperadas/);
});
