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

test("el HUD también pinta la sección de la sidebar de sesión", () => {
  assert.match(src, /sidebar_content/, "la sección vive en la sidebar de sesión");
});

test("la sección lista los pendientes de la tarea ODD con tope", () => {
  assert.match(src, /pending\.slice\(0, PENDING_ROWS\)/, "muestra los primeros pendientes");
  assert.match(src, /pending\.length > PENDING_ROWS/, "resume el resto con +N");
});

test("el HUD lee la tarea ODD con el lector compartido", () => {
  assert.match(src, /import \{ readOddTasks \} from "\.\/odd-tasks"/, "usa el módulo compartido");
  assert.ok(!/const readOddTasks = /.test(src), "sin copia local del lector");
});

test("el HUD está cargado en tui.json", () => {
  assert.ok(
    tuiJson.plugin.includes("./tui-plugins/kairos-hud.tsx"),
    "tui.json debe cargar ./tui-plugins/kairos-hud.tsx",
  );
});

test("el HUD prefiere la tarea con pendientes", () => {
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

test("el HUD tolera entornos sin marcador", () => {
  assert.match(src, /if \(!configDir \|\| !home\) return false/, "sin entorno no avisa");
});

test("la fila y el panel respetan el ancho del host (sin partirse en dos líneas)", () => {
  assert.match(src, /ROW_NAME_MAX = 12/, "nombre recortado para el slot del prompt (~26 columnas)");
  assert.match(src, /short\(task\(\)\.name, ROW_NAME_MAX\)/, "el contador n/m siempre entra en la fila");
  assert.match(src, /PANEL_NAME_MAX = 21/, "el nombre del panel cabe con el contador (~33 columnas)");
  assert.match(src, /short\(active\(\)\.name, PANEL_NAME_MAX\)/, "el nombre del panel se recorta a ese ancho");
  assert.match(src, /PANEL_ITEM_MAX = 30/, "los pendientes caben en el ancho real de la sidebar (~33)");
  assert.match(src, /short\(item, PANEL_ITEM_MAX\)/, "pendientes recortados a ese ancho");
});
