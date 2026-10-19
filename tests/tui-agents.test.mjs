// Pruebas de la vista unificada de kairos (tui-plugins/kairos-agents.tsx):
// la paridad con el overlay `alt+a` de gentle-shell y el modo unificado —
// sesión, subagentes, agentes y ODD a la izquierda, hilo o ficha a la derecha.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "tui-plugins", "kairos-agents.tsx"), "utf8");
const subSrc = readFileSync(join(ROOT, "tui-plugins", "subagents.ts"), "utf8");
const tuiJson = JSON.parse(readFileSync(join(ROOT, "tui.json"), "utf8"));

test("la vista de agentes está cargada en tui.json", () => {
  assert.ok(
    tuiJson.plugin.includes("./tui-plugins/kairos-agents.tsx"),
    "tui.json debe cargar ./tui-plugins/kairos-agents.tsx",
  );
});

test("registra la ruta kairos-agents y navega a ella", () => {
  assert.match(src, /const ROUTE = "kairos-agents"/, "nombre de ruta estable");
  assert.match(src, /api\.route\.register\(/, "registra la ruta del plugin");
  assert.match(src, /api\.route\.navigate\(ROUTE, \{ sessionID:/, "abre la vista con la sesión actual");
});

test("se abre desde una sesión y avisa desde el home", () => {
  assert.match(src, /current\.name === "session" && current\.params\?\.sessionID/, "solo hay vista para una sesión");
  assert.match(src, /api\.ui\.toast\(\{/, "el home avisa con un toast");
  assert.match(src, /Abre una sesión para ver sus agentes y subagentes/, "texto del aviso");
});

test("el atajo por defecto es alt+g, configurable y apagable", () => {
  assert.match(src, /KAIROS_AGENTS_KEY/, "permite cambiar el atajo por entorno");
  assert.match(src, /VIEW_KEY = process\.env\.KAIROS_AGENTS_KEY \?\? "alt\+g"/, "alt+g por defecto");
  assert.match(src, /VIEW_KEY\.toLowerCase\(\) !== "off"/, "se puede apagar");
});

test("el slash es /agentes para no chocar con el /agents nativo", () => {
  assert.match(src, /slash: \{ name: "agentes" \}/, "slash propio de la vista");
  assert.ok(!/slash: \{ name: "agents" \}/.test(src), "no pisa el /agents de OpenCode");
  assert.match(src, /api\.command\?\.register\?\.\(/, "entra en la paleta");
});

test("la lista izquierda sale de las partes de la tool task", () => {
  assert.match(subSrc, /part\?\.tool !== "task"/, "solo llamadas task");
  assert.match(subSrc, /metadata\.sessionId/, "enlaza la sesión hija");
  assert.match(subSrc, /input\.subagent_type/, "nombre del agente que corre la tarea");
  assert.match(subSrc, /input\.description/, "resumen de la tarea");
  assert.match(src, /collectRuns\(api, sid\)/, "la vista usa el lector compartido");
});

test("cruza los hijos reales para estado, tokens y coste", () => {
  assert.match(src, /api\.client\.session\.children\(\{ sessionID: sid \}\)/, "lista las sesiones hijas");
  assert.match(subSrc, /statusOf\(child\.id\)\?\.type/, "estado vivo del hijo");
  assert.match(subSrc, /child\.tokens/, "tokens de la sesión hija");
  assert.match(subSrc, /child\.cost/, "coste de la sesión hija");
});

test("muestra el catálogo de agentes configurados", () => {
  assert.match(src, /api\.client\.app\.agents\(\{\}\)/, "agentes del servidor");
  assert.match(src, /agent\.hidden !== true/, "oculta los internos");
  assert.match(src, /\.mode === "primary" \? 0 : 1/, "perfiles primarios primero");
});

test("el panel derecho lee el hilo del subagente", () => {
  assert.match(src, /api\.client\.session\.messages\(\{ sessionID: childID \}\)/, "hilo de la sesión hija");
  assert.match(src, /part\?\.type === "tool"/, "líneas de herramientas en el hilo");
  assert.match(src, /part\.text\.split\("\\n"\)/, "texto del subagente");
});

test("abre la sesión hija y vuelve a la sesión padre", () => {
  assert.match(src, /api\.route\.navigate\("session", \{ sessionID: row\.run\.childID \}\)/, "enter abre el hijo");
  assert.match(src, /api\.route\.navigate\(sid \? "session" : "home"/, "esc/q vuelve a la sesión");
});

test("modo estrecho: una columna con detalle y volver", () => {
  assert.match(src, /NARROW_WIDTH = 100/, "umbral de dos paneles");
  assert.match(src, /detailOpen/, "el detalle se abre y se cierra");
  assert.match(src, /if \(narrow\(\) && detailOpen\(\)\) setDetailOpen\(false\)/, "esc vuelve a la lista");
});

test("detener un subagente pide confirmación y aborta", () => {
  assert.match(src, /DialogConfirm/, "confirmación del host");
  assert.match(src, /\.abort\(\{ sessionID: run\.childID \}\)/, "aborta la sesión hija");
  assert.match(src, /api\.ui\.dialog\.open/, "el diálogo abierto tiene el teclado");
});

test("cada agente del catálogo usa su color configurado", () => {
  assert.match(src, /const agentTone = \(api, agent\)/, "resuelve el color del agente");
  assert.match(src, /api\.state\.config\.agent\?\.\[agent\?\.name\]\?\.color/, "cae al color de la configuración");
  assert.match(src, /sessionTone\(api, agentTone\(api, row\.agent\)\)/, "la fila del catálogo lo usa");
  assert.match(src, /tone: agentTone\(api, agent\)/, "la ficha del agente también");
});

test("los colores salen del tema activo, sin hex fijos", () => {
  assert.match(src, /api\.theme\.current/, "colores desde el tema");
  assert.ok(!/#[0-9a-fA-F]{6}/.test(src), "sin colores hex fijos");
});

test("marca subagentes esperando por una pregunta", () => {
  assert.match(src, /api\.state\.session\.question\(/, "detecta preguntas pendientes");
  assert.match(subSrc, /waiting: "\?"/, "glifo de espera");
});

test("se refresca con reloj y eventos, y limpia todo al salir", () => {
  assert.match(src, /setInterval\(/, "reloj de tiempos");
  assert.match(src, /onCleanup\(\(\) => clearInterval\(timer\)\)/, "detiene el reloj");
  assert.match(src, /api\.event\.on\(/, "escucha eventos de sesión");
  assert.match(src, /onCleanup\(\(\) => offs\.forEach\(\(off\) => off\(\)\)\)/, "suelta las suscripciones");
});

test("tolera fallos de red y sesiones sin datos", () => {
  assert.match(subSrc, /catch \{\s*return runs/, "sin sesión legible devuelve lista vacía");
  assert.match(src, /setChildren\(\(current\) => current \?\? \[\]\)/, "un fallo de children conserva lo cacheado");
  assert.match(src, /no se pudo leer el hilo del subagente/, "hilo ilegible se muestra, no rompe");
  assert.match(src, /sin subagentes en esta sesión/, "estado vacío legible");
});

test("la fila Sesión encabeza la lista y sale seleccionada", () => {
  assert.match(src, /const output = \[\{ kind: "session", key: "session" \}\]/, "primera fila: la sesión");
  assert.match(src, /row\.kind === "session" \|\| row\.kind === "run" \|\| row\.kind === "agent"/, "la sesión es seleccionable");
  assert.match(src, /SESSION_TITLE_MAX = 22/, "título recortado con presupuesto");
});

test("la sección ODD sale del lector compartido", () => {
  assert.match(src, /import \{ readOddTasks \} from "\.\/odd-tasks"/, "mismo lector que el HUD");
  assert.match(src, /odd\.pending\.slice\(0, ODD_ROWS\)/, "pendientes con tope");
  assert.match(src, /… \+\$\{odd\.pending\.length - ODD_ROWS\}/, "el resto se resume con +N");
});

test("el panel derecho muestra el hilo de la sesión activa", () => {
  assert.match(src, /void loadThread\(sid, \{ busy, endedAt: sessionInfo\(\)\.updated \}\)/, "carga el hilo de la sesión");
  assert.match(src, /current\.key !== sid/, "el hilo mostrado es el de la sesión seleccionada");
  assert.match(src, /title: sessionTitle\(\) \?\? "sesión actual"/, "título con respaldo");
});

test("la sesión se pinta con estado y metadatos", () => {
  assert.match(src, /api\.state\.session\.status\(sid\)\?\.type/, "estado vivo de la sesión");
  assert.match(src, /formatTokens\(info\.tokens\)/, "tokens de la sesión");
  assert.match(src, /formatCost\(info\.cost\)/, "coste de la sesión");
});

test("sin rutas de la máquina en el archivo versionado", () => {
  assert.ok(!/\/(?:home|Users)\/[A-Za-z0-9._-]+\//.test(src), "sin rutas absolutas del usuario");
});
