// Pruebas del aviso de escritorio del plugin de servidor: solo la sesión principal
// avisa, con la marca kairos y un texto honesto (un turno terminado no es una tarea
// terminada). Los subagentes, las sesiones internas del clasificador y las
// transiciones que no corresponden (idle sin corrida previa, done tras un error)
// quedan en silencio. Tampoco avisa mientras haya subagentes corriendo (avisa el
// idle del último), con un permiso o pregunta pendiente, ni para sesiones jamás
// vistas. Interruptor: KAIROS_NO_NOTIFY=1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { GentleShellPlugin } = await import(join(ROOT, "plugins", "gentle-shell.ts"));

const DONE_TEXT = "Listo para tu siguiente mensaje";
const ERROR_TEXT = "Error en la sesión";
const MODEL_STOPPED_TEXT = "El modelo dejó de responder";

// Shell falso estilo Bun: registra cada comando y encadena .nothrow().quiet().
// El cliente falso responde a session.get; parentID(sessionID) marca una sesión
// como hija (barrera del servidor) y getThrows simula un servidor sin respuesta.
function harness(options = {}) {
    const commands = [];
    const $ = (strings, ...values) => {
        let command = strings[0];
        values.forEach((value, index) => {
            command += String(value) + strings[index + 1];
        });
        commands.push(command);
        const result = Promise.resolve({ exitCode: 0 });
        result.nothrow = () => result;
        result.quiet = () => result;
        return result;
    };
    const client = {
        session: {
            get: async ({ sessionID }) => {
                if (options.getThrows) throw new Error("sin servidor");
                return { data: { id: sessionID, parentID: options.parentID ? options.parentID(sessionID) : undefined } };
            },
        },
    };
    return { commands, $, client };
}

const created = (info) => ({ type: "session.created", properties: { info } });
const updated = (info) => ({ type: "session.updated", properties: { info } });
const deleted = (info) => ({ type: "session.deleted", properties: { info } });
const status = (sessionID, type) => ({ type: "session.status", properties: { sessionID, status: { type } } });
const failed = (sessionID, error = { name: "UnknownError", data: { message: "boom" } }) => ({
    type: "session.error",
    properties: { sessionID, error },
});
const questionAsked = (sessionID, id) => ({ type: "question.asked", properties: { id, sessionID } });
const questionReplied = (requestID) => ({ type: "question.replied", properties: { requestID } });
const questionRejected = (requestID) => ({ type: "question.rejected", properties: { requestID } });
const permissionAsked = (sessionID, id) => ({ type: "permission.asked", properties: { id, sessionID } });
const permissionReplied = (requestID) => ({ type: "permission.replied", properties: { requestID } });

const TOP = { id: "ses-principal", title: "trabajo real" };
const CHILD = { id: "ses-subagente", parentID: TOP.id, title: "explore" };
const INTERNAL = { id: "ses-clasificador", title: "kairos auto-approval classifier" };

test("avisa al terminar un turno de la sesión principal, con marca y texto honestos", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 1, "debe avisar una sola vez");
    assert.match(commands[0], /notify-send -a kairos/);
    assert.ok(commands[0].includes("Kairos"), "el resumen debe decir Kairos");
    assert.ok(commands[0].includes(DONE_TEXT), "el texto debe ser honesto, sin tarea terminada");
    assert.doesNotMatch(commands[0], /OpenCode|Tarea terminada/);
});

test("no avisa por subagentes que terminan a mitad de la tarea principal", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(CHILD) });
    await hooks.event({ event: status(CHILD.id, "busy") });
    await hooks.event({ event: status(CHILD.id, "idle") });
    assert.equal(commands.length, 0);
});

test("no avisa en un idle sin corrida previa (evento espurio)", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 0);
});

test("tras un error avisa el error y calla el done falso", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: failed(TOP.id) });
    assert.equal(commands.length, 1, "el error sí se avisa");
    assert.ok(commands[0].includes(ERROR_TEXT));
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 1, "el idle posterior no debe decir listo");
});

test("una cancelación del usuario (Esc) no genera aviso", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: failed(TOP.id, { name: "MessageAbortedError", data: { message: "aborted" } }) });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 0);
});

test("un modelo que deja de responder se avisa con su texto propio", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: failed(TOP.id, { name: "UnknownError", data: { message: "SSE read timed out" } }) });
    assert.equal(commands.length, 1);
    assert.ok(commands[0].includes(MODEL_STOPPED_TEXT));
});

test("no avisa por las sesiones internas del clasificador", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(INTERNAL) });
    await hooks.event({ event: status(INTERNAL.id, "busy") });
    await hooks.event({ event: status(INTERNAL.id, "idle") });
    assert.equal(commands.length, 0);
});

test("detecta al clasificador aunque el título llegue en session.updated", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created({ id: INTERNAL.id, title: "" }) });
    await hooks.event({ event: updated(INTERNAL) });
    await hooks.event({ event: status(INTERNAL.id, "busy") });
    await hooks.event({ event: status(INTERNAL.id, "idle") });
    assert.equal(commands.length, 0);
});

test("KAIROS_NO_NOTIFY=1 apaga todos los avisos", async () => {
    process.env.KAIROS_NO_NOTIFY = "1";
    try {
        const { commands, $, client } = harness();
        const hooks = await GentleShellPlugin({ $, client });
        await hooks.event({ event: created(TOP) });
        await hooks.event({ event: status(TOP.id, "busy") });
        await hooks.event({ event: status(TOP.id, "idle") });
        await hooks.event({ event: failed(TOP.id) });
        assert.equal(commands.length, 0);
    } finally {
        delete process.env.KAIROS_NO_NOTIFY;
    }
});

test("una sesión eliminada a mitad de corrida no avisa en un idle tardío", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: deleted(TOP) });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 0);
});

test("con subagentes corriendo no avisa hasta que termina el último", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: created(CHILD) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: status(CHILD.id, "busy") });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 0, "el padre queda idle, pero el subagente sigue vivo");
    await hooks.event({ event: status(CHILD.id, "idle") });
    assert.equal(commands.length, 1, "el aviso sale al terminar el último subagente");
    assert.ok(commands[0].includes(DONE_TEXT));
});

test("una pregunta pendiente silencia el listo; al responderla vuelve a avisar", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: questionAsked(TOP.id, "q1") });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 0, "espera tu respuesta: no está listo");
    await hooks.event({ event: questionReplied("q1") });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 1, "tras responder y terminar, sí avisa");
});

test("un permiso rechazado también deja de silenciar", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: permissionAsked(TOP.id, "p1") });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 0, "espera tu decisión: no está listo");
    await hooks.event({ event: permissionReplied("p1") });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 1);
});

test("un hijo con error no dispara el aviso diferido del padre", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: created(CHILD) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: status(CHILD.id, "busy") });
    await hooks.event({ event: status(TOP.id, "idle") });
    await hooks.event({ event: failed(CHILD.id) });
    await hooks.event({ event: status(CHILD.id, "idle") });
    assert.equal(commands.length, 0, "el padre decidirá qué hacer; sin aviso falso");
});

test("una sesión jamás vista (status sin created) no avisa", async () => {
    const { commands, $, client } = harness();
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: status("ses-desconocida", "busy") });
    await hooks.event({ event: status("ses-desconocida", "idle") });
    assert.equal(commands.length, 0);
});

test("el servidor es la última palabra: una hija no vista como hija no avisa", async () => {
    const { commands, $, client } = harness({ parentID: (sessionID) => (sessionID === TOP.id ? "ses-abuelo" : undefined) });
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 0, "el servidor reporta parentID: es una hija, silencio");
});

test("si el servidor no responde, el aviso no se pierde", async () => {
    const { commands, $, client } = harness({ getThrows: true });
    const hooks = await GentleShellPlugin({ $, client });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 1, "sin respuesta del servidor se confía en el rastreo por eventos");
});
