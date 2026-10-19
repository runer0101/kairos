// Pruebas del panel izquierdo de kairos (tui-plugins/kairos-shell.tsx): la
// superficie de gentle-shell (agentes, todos y estado) junto a la conversación
// de OpenCode, a través del slot `session_left` del binario parcheado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "tui-plugins", "kairos-shell.tsx"), "utf8");
const subSrc = readFileSync(join(ROOT, "tui-plugins", "subagents.ts"), "utf8");
const viewSrc = readFileSync(join(ROOT, "tui-plugins", "kairos-agents.tsx"), "utf8");
const tuiJson = JSON.parse(readFileSync(join(ROOT, "tui.json"), "utf8"));

test("el panel está cargado en tui.json y pide su ancho", () => {
  assert.ok(tuiJson.plugin.includes("./tui-plugins/kairos-shell.tsx"), "tui.json debe cargar kairos-shell.tsx");
  assert.equal(tuiJson.session_left_width, 40, "ancho del panel en tui.json");
});

test("con OpenCode oficial la sidebar queda como estaba (a la derecha)", () => {
  assert.equal(tuiJson.sidebar_position, undefined, "sin sidebar_position: el layout por defecto");
});

test("el panel se registra en el slot session_left del host parcheado", () => {
  assert.match(src, /session_left\(_ctx, props\)/, "slot session_left con props del host");
  assert.match(src, /props\?\.session_id/, "usa la sesión que le pasa el host");
  assert.match(src, /api\.tuiConfig\?\.session_left_width/, "mide con el ancho configurado");
});

test("el panel comparte los lectores de subagentes y ODD", () => {
  assert.match(src, /import \{ readOddTasks \} from "\.\/odd-tasks"/, "mismo lector ODD que el HUD y la vista");
  assert.match(src, /from "\.\/subagents"/, "misma lógica de subagentes que la vista");
  assert.match(src, /mergeRuns\(collectRuns\(api, sid\)/, "cruza llamadas task con sesiones hijas");
  assert.match(src, /api\.client\.session\.children\(\{ sessionID: sid \}\)/, "hijos reales para estado y coste");
});

test("el panel muestra lo de gentle-shell: Agents, Todos y estado", () => {
  assert.match(src, /<b>Agents<\/b>/, "sección Agents");
  assert.match(src, /<b>Todos<\/b>/, "sección Todos");
  assert.match(src, /` · \$\{odd\(\)\.done\} of \$\{odd\(\)\.total\}`/, "contador todos");
  assert.match(src, /stateLine/, "línea de estado al pie");
});

test("respeta presupuestos de ancho y no usa hex fijos", () => {
  assert.match(src, /AGENT_ROWS = 6/, "tope de filas de subagentes");
  assert.match(src, /ODD_ROWS = 4/, "tope de pendientes");
  assert.match(src, /clip\(/, "recorte por ancho");
  assert.match(src, /api\.theme\.current/, "colores desde el tema");
  assert.ok(!/#[0-9a-fA-F]{6}/.test(src), "sin colores hex fijos");
});

test("se refresca con reloj y eventos y limpia al desmontarse", () => {
  assert.match(src, /setInterval\(/, "reloj de tiempos");
  assert.match(src, /onCleanup\(\(\) => clearInterval\(timer\)\)/, "detiene el reloj");
  assert.match(src, /api\.event\.on\(/, "escucha eventos de sesión");
  assert.match(src, /onCleanup\(\(\) => offs\.forEach\(\(off\) => off\(\)\)\)/, "suelta las suscripciones");
});

test("tolera fallos sin romper la TUI", () => {
  assert.match(src, /setChildren\(\(current\) => current \?\? \[\]\)/, "un fallo de children conserva lo cacheado");
  assert.match(src, /catch \{\s*return undefined/, "sin tarea ODD no pinta la sección");
});

test("los datos compartidos viven en subagents.ts, sin copias", () => {
  assert.match(subSrc, /export const collectRuns/, "collectRuns exportado");
  assert.match(subSrc, /export const mergeRuns/, "mergeRuns exportado");
  assert.match(subSrc, /export const GLYPH/, "glifos de estado exportados");
  assert.match(subSrc, /export const SESSION_EVENTS/, "eventos de sesión exportados");
  assert.ok(!/const collectRuns = /.test(viewSrc), "la vista no tiene copia local");
  assert.ok(!/const mergeRuns = /.test(viewSrc), "la vista no tiene copia local");
});

test("sin rutas de la máquina en los archivos versionados", () => {
  for (const source of [src, subSrc]) {
    assert.ok(!/\/(?:home|Users)\/[A-Za-z0-9._-]+\//.test(source), "sin rutas absolutas del usuario");
  }
});
