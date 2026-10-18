// Pruebas del aviso de escritorio del plugin de servidor: solo la sesión principal
// avisa, con la marca kairos y un texto honesto (un turno terminado no es una tarea
// terminada). Los subagentes, las sesiones internas del clasificador y las
// transiciones que no corresponden (idle sin corrida previa, done tras un error)
// quedan en silencio. Interruptor: KAIROS_NO_NOTIFY=1.
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
function harness() {
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
    return { commands, $ };
}

const created = (info) => ({ type: "session.created", properties: { info } });
const updated = (info) => ({ type: "session.updated", properties: { info } });
const deleted = (info) => ({ type: "session.deleted", properties: { info } });
const status = (sessionID, type) => ({ type: "session.status", properties: { sessionID, status: { type } } });
const failed = (sessionID, error = { name: "UnknownError", data: { message: "boom" } }) => ({
    type: "session.error",
    properties: { sessionID, error },
});

const TOP = { id: "ses-principal", title: "trabajo real" };
const CHILD = { id: "ses-subagente", parentID: TOP.id, title: "explore" };
const INTERNAL = { id: "ses-clasificador", title: "kairos auto-approval classifier" };

test("avisa al terminar un turno de la sesión principal, con marca y texto honestos", async () => {
    const { commands, $ } = harness();
    const hooks = await GentleShellPlugin({ $ });
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
    const { commands, $ } = harness();
    const hooks = await GentleShellPlugin({ $ });
    await hooks.event({ event: created(CHILD) });
    await hooks.event({ event: status(CHILD.id, "busy") });
    await hooks.event({ event: status(CHILD.id, "idle") });
    assert.equal(commands.length, 0);
});

test("no avisa en un idle sin corrida previa (evento espurio)", async () => {
    const { commands, $ } = harness();
    const hooks = await GentleShellPlugin({ $ });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 0);
});

test("tras un error avisa el error y calla el done falso", async () => {
    const { commands, $ } = harness();
    const hooks = await GentleShellPlugin({ $ });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: failed(TOP.id) });
    assert.equal(commands.length, 1, "el error sí se avisa");
    assert.ok(commands[0].includes(ERROR_TEXT));
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 1, "el idle posterior no debe decir listo");
});

test("una cancelación del usuario (Esc) no genera aviso", async () => {
    const { commands, $ } = harness();
    const hooks = await GentleShellPlugin({ $ });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: failed(TOP.id, { name: "MessageAbortedError", data: { message: "aborted" } }) });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 0);
});

test("un modelo que deja de responder se avisa con su texto propio", async () => {
    const { commands, $ } = harness();
    const hooks = await GentleShellPlugin({ $ });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: failed(TOP.id, { name: "UnknownError", data: { message: "SSE read timed out" } }) });
    assert.equal(commands.length, 1);
    assert.ok(commands[0].includes(MODEL_STOPPED_TEXT));
});

test("no avisa por las sesiones internas del clasificador", async () => {
    const { commands, $ } = harness();
    const hooks = await GentleShellPlugin({ $ });
    await hooks.event({ event: created(INTERNAL) });
    await hooks.event({ event: status(INTERNAL.id, "busy") });
    await hooks.event({ event: status(INTERNAL.id, "idle") });
    assert.equal(commands.length, 0);
});

test("detecta al clasificador aunque el título llegue en session.updated", async () => {
    const { commands, $ } = harness();
    const hooks = await GentleShellPlugin({ $ });
    await hooks.event({ event: created({ id: INTERNAL.id, title: "" }) });
    await hooks.event({ event: updated(INTERNAL) });
    await hooks.event({ event: status(INTERNAL.id, "busy") });
    await hooks.event({ event: status(INTERNAL.id, "idle") });
    assert.equal(commands.length, 0);
});

test("KAIROS_NO_NOTIFY=1 apaga todos los avisos", async () => {
    process.env.KAIROS_NO_NOTIFY = "1";
    try {
        const { commands, $ } = harness();
        const hooks = await GentleShellPlugin({ $ });
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
    const { commands, $ } = harness();
    const hooks = await GentleShellPlugin({ $ });
    await hooks.event({ event: created(TOP) });
    await hooks.event({ event: status(TOP.id, "busy") });
    await hooks.event({ event: deleted(TOP) });
    await hooks.event({ event: status(TOP.id, "idle") });
    assert.equal(commands.length, 0);
});
