// Pruebas de configuración: perfiles, modelo por defecto, permisos y referencias a archivos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(ROOT, "opencode.json"), "utf8"));

test("el agente por defecto es el perfil equilibrado", () => {
  assert.equal(cfg.default_agent, "venjix");
  assert.equal(cfg.agent.venjix.mode, "primary");
});

test("el modelo por defecto es gratuito de OpenCode, no local", () => {
  assert.equal(cfg.model, "opencode/big-pickle");
  assert.equal(cfg.small_model, "opencode/big-pickle");
});

test("el proveedor ollama global queda deshabilitado (evita modelos fantasma)", () => {
  assert.ok(cfg.disabled_providers.includes("ollama"));
  assert.equal(cfg.provider, undefined, "no debe haber proveedores fijos en opencode.json");
});

test("existen los tres perfiles como agentes primarios con el mismo prompt", () => {
  for (const name of ["venjix", "venjix-deep", "venjix-yolo"]) {
    const a = cfg.agent[name];
    assert.ok(a, `falta el perfil ${name}`);
    assert.equal(a.mode, "primary", `${name} debe ser primario`);
    assert.equal(a.prompt, "{file:./prompts/orchestrator.md}", `${name} debe usar el prompt común`);
    assert.ok(a.description && a.description.length > 10, `${name} necesita descripción`);
  }
  assert.ok(existsSync(join(ROOT, "prompts", "orchestrator.md")), "falta prompts/orchestrator.md");
});

test("el perfil profundo usa un modelo distinto del equilibrado", () => {
  assert.notEqual(cfg.agent["venjix-deep"].model, cfg.agent.venjix.model);
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

test("modo autónomo (yolo) permite todo; la guarda de comandos sigue en el plugin", () => {
  assert.equal(cfg.agent["venjix-yolo"].permission, "allow");
  assert.ok(existsSync(join(ROOT, "plugins", "gentle-shell.ts")));
});

test("subagentes con modelo propio: explorador barato con pasos acotados, juez B distinto", () => {
  assert.equal(cfg.agent["gentle-ai-explore"].model, "opencode/big-pickle");
  assert.ok(Number.isInteger(cfg.agent["gentle-ai-explore"].steps));
  assert.notEqual(cfg.agent["jd-judge-b"].model, cfg.agent.venjix.model, "los dos jueces deben usar modelos distintos");
});

test("funciones de calidad activas: lsp, formatter, snapshot (undo)", () => {
  assert.equal(cfg.lsp, true);
  assert.equal(cfg.formatter, true);
  assert.equal(cfg.snapshot, true);
});

test("el único ruta absoluta permitida es el binario de engram", () => {
  const absolute = JSON.stringify(cfg).match(/"\/[^"]+"/g) || [];
  for (const v of absolute) {
    assert.ok(/engram/.test(v) || /^"\/tmp/.test(v) === false, `ruta absoluta inesperada: ${v}`);
  }
});
