// Pruebas del HUD de kairos (tui-plugins/kairos-hud.tsx): la fila de sesión
// que muestra lo que el host no pinta (tarea ODD activa y sync pendiente).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "tui-plugins", "kairos-hud.tsx"), "utf8");
const tuiJson = JSON.parse(readFileSync(join(ROOT, "tui.json"), "utf8"));

test("el HUD se pinta junto al prompt de sesión", () => {
  assert.match(src, /api\.slots\.register\(/, "debe registrar slots");
  assert.match(src, /session_prompt_right/, "la fila vive junto al prompt de sesión");
});

test("el HUD está cargado en tui.json", () => {
  assert.ok(
    tuiJson.plugin.includes("./tui-plugins/kairos-hud.tsx"),
    "tui.json debe cargar ./tui-plugins/kairos-hud.tsx",
  );
});

test("el HUD lee la tarea ODD del worktree y excluye la plantilla", () => {
  assert.match(src, /join\(worktree, "odd", "tasks"\)/, "lee odd/tasks del worktree");
  assert.match(src, /name !== "TEMPLATE\.md"/, "TEMPLATE.md no es una tarea");
  assert.match(src, /\.endsWith\("\.md"\)/, "solo mira archivos .md");
});

test("el HUD cuenta checkboxes y prefiere la tarea con pendientes", () => {
  assert.match(src, /\\\[\( \|x\|X\)\\\]/, "reconoce checkboxes marcados y sin marcar");
  assert.match(
    src,
    /tasks\.find\(\(entry\) => entry\.done < entry\.total\)/,
    "elige la tarea con pendientes más reciente",
  );
});

test("el HUD avisa cuando el sync con gentle-shell está pendiente", () => {
  assert.match(src, /\.gentle-shell-sync\.json/, "lee el marcador de sincronización");
  assert.match(src, /\.gentle-shell-version/, "compara con la versión instalada");
  assert.match(src, /sync pendiente/, "el aviso es visible");
});

test("el HUD usa los colores del tema activo, sin hex fijos", () => {
  assert.match(src, /api\.theme\.current/, "colores desde el tema");
  assert.ok(!/#[0-9a-fA-F]{6}/.test(src), "sin colores hex fijos");
});

test("el HUD se actualiza periódicamente y limpia su temporizador", () => {
  assert.match(src, /setInterval\(/, "snapshot periódico del estado");
  assert.match(src, /api\.lifecycle\.onDispose\(/, "registra la limpieza");
  assert.match(src, /clearInterval\(/, "detiene el temporizador al descargarse");
  assert.match(src, /createMemo\(/, "los datos se recalculan de forma reactiva");
});

test("el HUD tolera proyectos sin odd/ y entornos sin marcador", () => {
  assert.match(src, /catch \{\s*return \[\]/, "sin odd/tasks devuelve lista vacía");
  assert.match(src, /if \(!configDir \|\| !home\) return false/, "sin entorno no avisa");
});
