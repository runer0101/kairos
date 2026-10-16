// Pruebas de la librería del clasificador de auto-aprobación:
// presupuestos, redacción, contexto acotado, prompt, parseo estricto, política y re-entrada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lib = await import(join(ROOT, "lib", "auto-approval", "index.ts"));

// Valores sintéticos: jamás credenciales reales.
const GITHUB_TOKEN = "ghp_" + "Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv1Wx2";
const OPENAI_KEY = "sk-" + "live1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6";
const BASE64_BLOB = "QWxsIHdvcmsgYW5kIG5vIHBsYXkga2VlcHMgdGhlIHNlY3JldCBzYWZl";

// --- presupuestos ---

test("los presupuestos declaran los límites acordados", () => {
    assert.equal(lib.INPUT_BYTES, 32 * 1024);
    assert.equal(lib.OUTPUT_TOKENS, 512);
    assert.equal(lib.DEADLINE_MS, 15000);
});

test("utf8Bytes y truncateToBytes miden y cortan sin partir puntos de código", () => {
    assert.equal(lib.utf8Bytes("ñ"), 2);
    assert.equal(lib.utf8Bytes("a"), 1);
    assert.equal(lib.truncateToBytes("ñññ", 5), "ññ");
    assert.equal(lib.truncateToBytes("abcd", 2), "ab");
    assert.equal(lib.truncateToBytes("abcd", 99), "abcd");
    assert.equal(lib.truncateToBytes("abcd", 0), "");
    assert.equal(lib.truncateToBytes("abcd", -5), "");
    assert.equal(lib.utf8Bytes(lib.truncateToBytes("🙂🙂", 5)), 4, "nunca parte un carácter multibyte");
});

test("clampDeadlineMs acota al máximo y cae al deadline ante valores inválidos", () => {
    assert.equal(lib.clampDeadlineMs(5000), 5000);
    assert.equal(lib.clampDeadlineMs(20000), lib.DEADLINE_MS);
    assert.equal(lib.clampDeadlineMs(0), lib.DEADLINE_MS);
    assert.equal(lib.clampDeadlineMs(-1), lib.DEADLINE_MS);
    assert.equal(lib.clampDeadlineMs(Number.NaN), lib.DEADLINE_MS);
    assert.equal(lib.clampDeadlineMs(Number.POSITIVE_INFINITY), lib.DEADLINE_MS);
});

test("la guarda de re-entrada admite una sola clasificación en vuelo", () => {
    const guard = lib.createInFlightGuard();
    assert.equal(guard.isBusy(), false);
    assert.equal(guard.tryEnter(), true);
    assert.equal(guard.isBusy(), true);
    assert.equal(guard.tryEnter(), false, "la segunda concurrente se omite");
    assert.equal(guard.isBusy(), true);
    guard.exit();
    assert.equal(guard.isBusy(), false);
    assert.equal(guard.tryEnter(), true, "tras salir se puede volver a entrar");
    guard.exit();
    guard.exit();
    assert.equal(guard.isBusy(), false, "un exit extra es inofensivo");
});

// --- redacción ---

test("redactText enmascara tokens, asignaciones, cabeceras y blobs", () => {
    const dirty = [
        `API_TOKEN=${OPENAI_KEY}`,
        `export GITHUB_TOKEN="${GITHUB_TOKEN}"`,
        `curl -H "Authorization: Bearer token-de-prueba-123" https://example.test/api`,
        `git clone https://usuario:clave-secreta@example.test/repo.git`,
        `printf '%s' ${BASE64_BLOB}`,
    ].join("\n");
    const redacted = lib.redactText(dirty);
    for (const secret of [OPENAI_KEY, GITHUB_TOKEN, "token-de-prueba-123", "clave-secreta", BASE64_BLOB]) {
        assert.ok(!redacted.includes(secret), `quedó visible: ${secret}`);
    }
    assert.ok(redacted.includes("[REDACTED]"));
    assert.ok(redacted.includes("https://example.test/api"), "la URL sin credenciales no se toca");
});

test("redactText es determinista e idempotente y no toca texto limpio", () => {
    const clean = "pnpm test && git status";
    assert.equal(lib.redactText(clean), clean);
    assert.equal(lib.redactText("max_tokens: 512"), "max_tokens: 512");
    const dirty = `token=${OPENAI_KEY}`;
    assert.equal(lib.redactText(lib.redactText(dirty)), lib.redactText(dirty));
});

test("redactAction enmascara claves sensibles y tolera ciclos", () => {
    const cyclic = { filePath: "config.ts", password: "hunter2-de-prueba" };
    cyclic.self = cyclic;
    const result = lib.redactAction({ toolName: "edit", input: cyclic });
    const serialized = JSON.stringify(result.value);
    assert.ok(!serialized.includes("hunter2-de-prueba"));
    assert.ok(serialized.includes("[REDACTED]"));
    assert.ok(serialized.includes("[circular]"));
    assert.equal(result.value.toolName, "edit");
});

// --- contexto acotado ---

test("el contexto redacta la acción antes de incluirla", () => {
    const messages = [{ role: "user", text: "revisa la configuración del servicio" }];
    const action = { toolName: "bash", input: { command: `API_KEY=${OPENAI_KEY} curl https://example.test` } };
    const ctx = lib.buildClassifierContext(messages, action, lib.INPUT_BYTES);
    assert.ok(!ctx.text.includes(OPENAI_KEY));
    assert.ok(ctx.text.includes("[REDACTED]"));
    const payload = JSON.parse(ctx.text);
    assert.equal(payload.action.toolName, "bash");
    assert.ok(payload.action.input.command.includes("[REDACTED]"));
    assert.equal(payload.request, "revisa la configuración del servicio");
});

test("el contexto coloca el pedido vivo primero y luego la acción y el historial", () => {
    const messages = [
        { role: "user", text: "tarea inicial del historial" },
        { role: "assistant", text: "respuesta intermedia" },
        { role: "user", text: "petición viva: corrige el fallo" },
    ];
    const action = { toolName: "edit", input: { filePath: "lib/ejemplo.ts", diff: "+ const x = 1" } };
    const ctx = lib.buildClassifierContext(messages, action, 4096);
    assert.equal(ctx.hasRequest, true);
    assert.equal(ctx.dropped, 0);
    assert.equal(ctx.truncated, false);
    const requestAt = ctx.text.indexOf("petición viva");
    const actionAt = ctx.text.indexOf('"action"');
    const historyAt = ctx.text.indexOf('"history"');
    assert.ok(requestAt >= 0 && actionAt > requestAt && historyAt > actionAt, "orden pedido → acción → historial");
    assert.ok(ctx.text.includes("tarea inicial del historial"));
    assert.ok(ctx.text.includes("respuesta intermedia"));
});

test("el contexto descarta primero los mensajes más antiguos", () => {
    const messages = [
        { role: "user", text: "vieja: iniciar la tarea " + "a ".repeat(80) },
        { role: "assistant", text: "media: continuar la tarea " + "b ".repeat(80) },
        { role: "user", text: "petición viva" },
    ];
    const action = { toolName: "bash", input: { command: "ls" } };
    const full = lib.buildClassifierContext(messages, action, 32768);
    assert.equal(full.dropped, 0);
    assert.equal(full.truncated, false);
    const oldestJson = JSON.stringify({ role: messages[0].role, text: messages[0].text });
    const budget = lib.utf8Bytes(full.text) - lib.utf8Bytes(oldestJson) + 30;
    const tight = lib.buildClassifierContext(messages, action, budget);
    assert.ok(lib.utf8Bytes(tight.text) <= budget);
    assert.equal(tight.dropped, 1, "solo sobra el mensaje más antiguo");
    assert.ok(!tight.text.includes("vieja:"), "lo más antiguo se descarta primero");
    assert.ok(tight.text.includes("media:"));
    assert.ok(tight.text.includes("petición viva"));
    assert.equal(tight.truncated, false);
    assert.equal(JSON.parse(tight.text).omittedHistory, 1);
});

test("el contexto acota el pedido vivo cuando no cabe y deja marca", () => {
    const messages = [{ role: "user", text: "petición viva " + "z ".repeat(2000) }];
    const action = { toolName: "bash", input: { command: "ls" } };
    const ctx = lib.buildClassifierContext(messages, action, 512);
    assert.equal(ctx.hasRequest, true);
    assert.equal(ctx.truncated, true);
    assert.ok(lib.utf8Bytes(ctx.text) <= 512);
    assert.ok(ctx.text.includes("truncated by host"));
    const payload = JSON.parse(ctx.text);
    assert.ok(payload.request.startsWith("petición viva"));
    assert.equal(payload.action.toolName, "bash");
});

test("el contexto acota acciones enormes sin romper el JSON", () => {
    const messages = [{ role: "user", text: "petición viva" }];
    const huge = "línea segura ".repeat(2000);
    const ctx = lib.buildClassifierContext(messages, { toolName: "bash", input: { command: huge } }, 1024);
    assert.ok(lib.utf8Bytes(ctx.text) <= 1024);
    assert.equal(ctx.truncated, true);
    const payload = JSON.parse(ctx.text);
    assert.equal(payload.action.toolName, "bash");
    assert.notEqual(payload.action.input.command, huge);
    assert.ok(payload.action.input.command.length > 0);
});

// --- prompt ---

test("el prompt une el SYSTEM, el contexto y la instrucción estricta", () => {
    const messages = [{ role: "user", text: "petición viva: ejecuta las pruebas" }];
    const action = { toolName: "bash", input: { command: "pnpm test" } };
    const prompt = lib.buildClassifierPrompt(messages, action);
    assert.ok(prompt.system.includes("live human request"));
    assert.ok(prompt.system.length > 200);
    assert.ok(prompt.user.includes("petición viva: ejecuta las pruebas"));
    assert.ok(prompt.user.includes("pnpm test"));
    assert.ok(prompt.user.includes("Reply with only one JSON object"));
    assert.ok(prompt.user.includes('"decision"') && prompt.user.includes('"allow"') && prompt.user.includes('"deny"'));
    assert.ok(lib.utf8Bytes(prompt.user) <= lib.INPUT_BYTES);
});

test("el prompt construido nunca contiene el token", () => {
    const secret = GITHUB_TOKEN;
    const messages = [{ role: "user", text: `usa ${secret} para el despliegue` }];
    const action = { toolName: "bash", input: { command: `curl -H "Authorization: Bearer ${secret}" https://example.test` } };
    const prompt = lib.buildClassifierPrompt(messages, action);
    assert.ok(!prompt.user.includes(secret));
    assert.ok(!prompt.system.includes(secret));
    assert.ok(prompt.user.includes("[REDACTED]"));
});

// --- parseo estricto ---

test("parseVerdict acepta un veredicto válido con espacios", () => {
    assert.deepEqual(lib.parseVerdict('{"decision":"allow","reason":"pruebas rutinarias"}'), {
        decision: "allow",
        reason: "pruebas rutinarias",
    });
    assert.deepEqual(lib.parseVerdict('  {\n  "reason" : "fuera de alcance" ,\n "decision" : "deny" }\n'), {
        decision: "deny",
        reason: "fuera de alcance",
    });
    const quoted = lib.parseVerdict('{"decision":"allow","reason":"ejecutar \\"pnpm test\\""}');
    assert.equal(quoted.reason, 'ejecutar "pnpm test"');
});

test("parseVerdict acepta un único bloque cercado sin ambigüedad", () => {
    assert.deepEqual(lib.parseVerdict('```json\n{"decision":"allow","reason":"ok"}\n```'), {
        decision: "allow",
        reason: "ok",
    });
    assert.deepEqual(lib.parseVerdict('```\n{"decision":"deny","reason":"no"}\n```'), {
        decision: "deny",
        reason: "no",
    });
    assert.equal(lib.parseVerdict('Aquí tienes:\n```json\n{"decision":"allow","reason":"ok"}\n```'), null);
    assert.equal(lib.parseVerdict('```json\n{"decision":"allow","reason":"ok"}\n```\nsobra'), null);
    assert.equal(
        lib.parseVerdict('```json\n{"decision":"allow","reason":"ok"}\n```\n```json\n{"decision":"deny","reason":"no"}\n```'),
        null,
    );
});

test("parseVerdict rechaza JSON inválido, decisiones desconocidas y campos extra", () => {
    const invalid = [
        "",
        "   ",
        "no es json",
        "[]",
        '{"decision":"allow"}',
        '{"decision":"maybe","reason":"x"}',
        '{"decision":true,"reason":"x"}',
        '{"decision":"allow","reason":""}',
        '{"decision":"allow","reason":"   "}',
        '{"decision":"allow","reason":"ok","extra":1}',
        '{"decision":"allow","reason":"a","decision":"deny"}',
        '{"decision":"allow","reason":"ok"} sobra',
        '{"decision":"allow","reason":"a\\nb"}',
    ];
    for (const text of invalid) {
        assert.equal(lib.parseVerdict(text), null, `debió ser null: ${JSON.stringify(text)}`);
    }
});

test("parseVerdict acota el motivo y nunca lanza con entradas raras", () => {
    const longReason = '{"decision":"allow","reason":"' + "x".repeat(1025) + '"}';
    assert.equal(lib.parseVerdict(longReason), null);
    const maxReason = '{"decision":"allow","reason":"' + "x".repeat(1024) + '"}';
    assert.equal(lib.parseVerdict(maxReason).decision, "allow");
    for (const weird of [null, undefined, 42, true, {}, [], Symbol("x")]) {
        assert.equal(lib.parseVerdict(weird), null);
    }
});

// --- política pura ---

test("la tabla de política resuelve todas las filas", () => {
    const allow = { decision: "allow", reason: "ok" };
    const deny = { decision: "deny", reason: "no" };
    const rows = [
        ["ask", allow, "none", "allow"],
        ["ask", deny, "none", "passthrough"],
        ["ask", null, "none", "passthrough"],
        ["ask", allow, "timeout", "passthrough"],
        ["ask", allow, "error", "passthrough"],
        ["ask", allow, "invalid", "passthrough"],
        ["ask", deny, "timeout", "passthrough"],
        ["ask", deny, "error", "passthrough"],
        ["ask", deny, "invalid", "passthrough"],
        ["ask", null, "timeout", "passthrough"],
        ["ask", null, "error", "passthrough"],
        ["ask", null, "invalid", "passthrough"],
        ["allow", allow, "none", "passthrough"],
        ["allow", deny, "none", "deny"],
        ["allow", null, "none", "passthrough"],
        ["allow", allow, "timeout", "passthrough"],
        ["allow", allow, "error", "passthrough"],
        ["allow", allow, "invalid", "passthrough"],
        ["allow", deny, "timeout", "passthrough"],
        ["allow", deny, "error", "passthrough"],
        ["allow", deny, "invalid", "passthrough"],
        ["allow", null, "timeout", "passthrough"],
        ["allow", null, "error", "passthrough"],
        ["allow", null, "invalid", "passthrough"],
    ];
    for (const [currentStatus, verdict, failure, effect] of rows) {
        assert.equal(
            lib.decidePolicy({ currentStatus, verdict, failure }),
            effect,
            `${currentStatus}/${verdict?.decision ?? "null"}/${failure}`,
        );
    }
});

test("cualquier fallo deja la decisión como estaba (fail-safe)", () => {
    for (const failure of ["timeout", "error", "invalid"]) {
        assert.equal(
            lib.decidePolicy({ currentStatus: "ask", verdict: { decision: "allow", reason: "ok" }, failure }),
            "passthrough",
        );
        assert.equal(
            lib.decidePolicy({ currentStatus: "allow", verdict: { decision: "deny", reason: "no" }, failure }),
            "passthrough",
        );
    }
});
