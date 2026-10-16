// Pruebas del plugin de auto-aprobación: camino ask (permiso respondido con
// `once` por evento) y camino veto (bloqueo en tool.execute.before), dedupe por
// callID, interruptores, fail-safe y regresión del mecanismo verificado en T1.
// El e2e con pty se activa con KAIROS_E2E=1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { AutoApprovalPlugin } = await import(join(ROOT, "plugins", "auto-approval.ts"));

const E2E = process.env.KAIROS_E2E === "1";
const OPENCODE = process.env.OPENCODE_BIN || join(homedir(), ".opencode", "bin", "opencode");
const E2E_MARKER_DIR = join(tmpdir(), "opencode", "auto-approval-e2e");
const E2E_MARKER = join(E2E_MARKER_DIR, "marker.txt");

// Reglas tal como las devuelve /agent en el runtime 1.18.35 (gana la última
// coincidencia): kairos-auto termina en allow global; kairos-control pregunta.
const KAIROS_AUTO_RULES = [
    { permission: "edit", pattern: "*", action: "ask" },
    { permission: "bash", pattern: "*", action: "ask" },
    { permission: "external_directory", pattern: "*", action: "ask" },
    { permission: "*", pattern: "*", action: "allow" },
];
const KAIROS_CONTROL_RULES = [
    { permission: "edit", pattern: "*", action: "ask" },
    { permission: "bash", pattern: "*", action: "ask" },
    { permission: "bash", pattern: "git status*", action: "allow" },
    { permission: "external_directory", pattern: "*", action: "ask" },
];

function fakeClient(options = {}) {
    const posts = [];
    const prompts = [];
    const created = [];
    const deleted = [];
    const calls = { messages: 0, agents: 0 };
    const messages = options.messages ?? [
        { info: { role: "user", agent: "kairos-auto" }, parts: [{ type: "text", text: "petición viva: ejecuta el comando pedido" }] },
    ];
    const agents = options.agents ?? [
        { name: "kairos-auto", permission: KAIROS_AUTO_RULES },
        { name: "kairos-control", permission: KAIROS_CONTROL_RULES },
    ];
    const client = {
        _client: {
            async post(entry) {
                if (options.postThrows) throw new Error("post roto en la prueba");
                posts.push(entry);
                return { data: true };
            },
        },
        session: {
            async create() {
                if (options.sessionThrows) throw new Error("create roto en la prueba");
                created.push(`clasificador-interno-${created.length + 1}`);
                return { data: { id: created[created.length - 1] } };
            },
            async delete(entry) {
                if (options.sessionThrows) throw new Error("delete roto en la prueba");
                deleted.push(entry.path.id);
                return { data: true };
            },
            async messages() {
                calls.messages += 1;
                if (options.sessionThrows) throw new Error("messages roto en la prueba");
                return { data: messages };
            },
            async prompt(entry) {
                if (options.sessionThrows) throw new Error("prompt roto en la prueba");
                prompts.push(entry);
                return {
                    data: {
                        info: {},
                        parts: [{ type: "text", text: options.assistantText ?? '{"decision":"allow","reason":"respuesta de la prueba"}' }],
                    },
                };
            },
        },
        app: {
            async agents() {
                calls.agents += 1;
                if (options.sessionThrows) throw new Error("agents roto en la prueba");
                return { data: agents };
            },
        },
    };
    return { client, posts, prompts, created, deleted, calls };
}

function askEvent(properties = {}) {
    return {
        event: {
            type: "permission.asked",
            properties: {
                id: "req-1",
                sessionID: "ses-1",
                permission: "bash",
                patterns: ["pnpm test"],
                metadata: { command: "pnpm test" },
                always: ["pnpm *"],
                tool: { messageID: "msg-1", callID: "call-1" },
                ...properties,
            },
        },
    };
}

const MANAGED_ENV = ["KAIROS_NO_CLASSIFIER", "KAIROS_CLASSIFIER_STUB", "KAIROS_CLASSIFIER_MODEL"];

// El plugin lee las variables al construirse; se restauran en cuanto termina.
async function makeHooks(client, env = {}) {
    const saved = new Map(MANAGED_ENV.map((name) => [name, process.env[name]]));
    for (const name of MANAGED_ENV) {
        const value = env[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
    try {
        return await AutoApprovalPlugin({ client });
    } finally {
        for (const [name, value] of saved) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    }
}

async function veto(hooks, tool, callID, args) {
    return hooks["tool.execute.before"]({ tool, sessionID: "ses-1", callID }, { args });
}

// --- camino ask (permiso → respuesta) ---

test("ask + stub allow responde una vez con /permission/{id}/reply y cachea el callID", async () => {
    const fake = fakeClient();
    const hooks = await makeHooks(fake.client, { KAIROS_CLASSIFIER_STUB: "allow" });
    await hooks.event(askEvent());
    assert.equal(fake.posts.length, 1);
    assert.equal(fake.posts[0].url, "/permission/{requestID}/reply");
    assert.deepEqual(fake.posts[0].path, { requestID: "req-1" });
    assert.deepEqual(fake.posts[0].body, { reply: "once" });
    await hooks.event(askEvent());
    assert.equal(fake.posts.length, 1, "el mismo callID no se responde dos veces");
});

test("ask + stub deny deja el pedido al humano", async () => {
    const fake = fakeClient();
    const hooks = await makeHooks(fake.client, { KAIROS_CLASSIFIER_STUB: "deny" });
    await hooks.event(askEvent());
    assert.equal(fake.posts.length, 0);
});

test("ask + stub timeout deja el pedido al humano", async () => {
    const fake = fakeClient();
    const hooks = await makeHooks(fake.client, { KAIROS_CLASSIFIER_STUB: "timeout" });
    await hooks.event(askEvent());
    assert.equal(fake.posts.length, 0);
});

test("otros tipos de permiso no se clasifican ni se responden", async () => {
    const fake = fakeClient();
    const hooks = await makeHooks(fake.client, { KAIROS_CLASSIFIER_STUB: "allow" });
    await hooks.event(askEvent({ permission: "webfetch" }));
    await hooks.event(askEvent({ permission: "external_directory", patterns: ["/tmp/*"], metadata: {} }));
    assert.equal(fake.posts.length, 0);
    assert.equal(fake.calls.messages, 0);
});

test("KAIROS_NO_CLASSIFIER=1 vuelve el plugin inerte", async () => {
    const fake = fakeClient();
    const hooks = await makeHooks(fake.client, { KAIROS_NO_CLASSIFIER: "1", KAIROS_CLASSIFIER_STUB: "deny" });
    await hooks.event(askEvent());
    await veto(hooks, "bash", "call-kill", { command: "rm -rf /tmp/datos" });
    assert.equal(fake.posts.length, 0);
    assert.equal(fake.calls.messages, 0);
    assert.equal(fake.calls.agents, 0);
    assert.equal(fake.prompts.length, 0);
});

// --- camino veto (allow → throw) ---

test("veto: sesión allow + stub deny bloquea bash", async () => {
    const fake = fakeClient();
    const hooks = await makeHooks(fake.client, { KAIROS_CLASSIFIER_STUB: "deny" });
    await assert.rejects(() => veto(hooks, "bash", "call-veto", { command: "rm -rf /tmp/datos" }), {
        message: /^auto-approval: bloqueado por el clasificador — stub$/,
    });
    assert.equal(fake.posts.length, 0, "el veto jamás responde un consentimiento");
});

test("veto: stub allow y stub timeout no bloquean", async () => {
    const allowFake = fakeClient();
    const allowHooks = await makeHooks(allowFake.client, { KAIROS_CLASSIFIER_STUB: "allow" });
    await veto(allowHooks, "bash", "call-a", { command: "ls" });
    const timeoutFake = fakeClient();
    const timeoutHooks = await makeHooks(timeoutFake.client, { KAIROS_CLASSIFIER_STUB: "timeout" });
    await veto(timeoutHooks, "bash", "call-t", { command: "ls" });
    assert.equal(allowFake.posts.length, 0);
    assert.equal(timeoutFake.posts.length, 0);
});

test("veto: write y edit se clasifican igual que bash", async () => {
    const fake = fakeClient();
    const hooks = await makeHooks(fake.client, { KAIROS_CLASSIFIER_STUB: "deny" });
    await assert.rejects(() => veto(hooks, "write", "call-w", { filePath: "src/a.ts", content: "contenido" }), /bloqueado/);
    await assert.rejects(() => veto(hooks, "edit", "call-e", { filePath: "src/b.ts", oldString: "a", newString: "b" }), /bloqueado/);
});

test("veto: una sesión ask nunca se bloquea", async () => {
    const fake = fakeClient({
        messages: [{ info: { role: "user", agent: "kairos-control" }, parts: [{ type: "text", text: "petición viva" }] }],
    });
    const hooks = await makeHooks(fake.client, { KAIROS_CLASSIFIER_STUB: "deny" });
    await veto(hooks, "bash", "call-c1", { command: "pnpm test" });
    await veto(hooks, "edit", "call-c2", { filePath: "src/a.ts", oldString: "a", newString: "b" });
    assert.equal(fake.prompts.length, 0, "una sesión ask no gasta clasificación");
});

test("veto: acepta la forma de objeto de la SDK para los permisos", async () => {
    const fake = fakeClient({
        agents: [{ name: "kairos-auto", permission: { edit: "allow", bash: { "*": "allow" }, external_directory: "allow" } }],
    });
    const hooks = await makeHooks(fake.client, { KAIROS_CLASSIFIER_STUB: "deny" });
    await assert.rejects(() => veto(hooks, "bash", "call-obj", { command: "rm -rf /tmp/y" }), /bloqueado/);
});

test("veto: con estado del agente desconocido no se bloquea (fail-safe)", async () => {
    const fake = fakeClient({
        messages: [{ info: { role: "user", agent: "agente-desconocido" }, parts: [{ type: "text", text: "petición viva" }] }],
    });
    const hooks = await makeHooks(fake.client, { KAIROS_CLASSIFIER_STUB: "deny" });
    await veto(hooks, "bash", "call-unknown", { command: "rm -rf /tmp/datos" });
    assert.equal(fake.prompts.length, 0, "sin allow confirmado no se clasifica ni se bloquea");
});

// --- dedupe y caché ---

test("dedupe: un callID ya visto por el evento no se bloquea en el veto", async () => {
    const fake = fakeClient();
    const hooks = await makeHooks(fake.client, { KAIROS_CLASSIFIER_STUB: "deny" });
    await hooks.event(askEvent({ tool: { messageID: "msg-1", callID: "call-dedupe" } }));
    assert.equal(fake.posts.length, 0, "deny no responde el ask");
    const messagesBefore = fake.calls.messages;
    const agentsBefore = fake.calls.agents;
    await veto(hooks, "bash", "call-dedupe", { command: "rm -rf /tmp/datos" });
    assert.equal(fake.calls.messages, messagesBefore, "no se vuelve a clasificar");
    assert.equal(fake.calls.agents, agentsBefore);
});

test("dedupe: el veto no re-consulta al modelo para un callID cacheado", async () => {
    const fake = fakeClient();
    const hooks = await makeHooks(fake.client);
    await hooks.event(askEvent({ tool: { messageID: "msg-1", callID: "call-real" } }));
    assert.equal(fake.prompts.length, 1);
    assert.equal(fake.posts.length, 1, "el veredicto allow del modelo responde once");
    assert.deepEqual(fake.deleted, [fake.created[0]], "la sesión interna se borra");
    await veto(hooks, "bash", "call-real", { command: "pnpm test" });
    assert.equal(fake.prompts.length, 1, "el veto usa la caché");
    assert.equal(fake.calls.messages, 1);
});

test("la caché de veredictos está acotada (LRU)", async () => {
    const fake = fakeClient();
    const hooks = await makeHooks(fake.client);
    for (let index = 0; index < 65; index++) {
        await hooks.event(askEvent({ id: `req-${index}`, tool: { messageID: `msg-${index}`, callID: `call-${index}` } }));
    }
    assert.equal(fake.prompts.length, 65);
    await hooks.event(askEvent({ id: "req-again", tool: { messageID: "msg-again", callID: "call-0" } }));
    assert.equal(fake.prompts.length, 66, "el más antiguo se descartó");
});

// --- sesión interna y modelo ---

test("los eventos de la sesión interna del clasificador se ignoran", async () => {
    const fake = fakeClient();
    const hooks = await makeHooks(fake.client);
    await hooks.event(askEvent({ tool: { messageID: "msg-1", callID: "call-in" } }));
    assert.equal(fake.posts.length, 1);
    const internal = fake.created[0];
    await hooks.event(askEvent({ id: "req-int", sessionID: internal, tool: { messageID: "msg-int", callID: "call-int" } }));
    assert.equal(fake.posts.length, 1, "la sesión interna nunca se clasifica");
});

test("KAIROS_CLASSIFIER_MODEL llega a la petición del modelo", async () => {
    const fake = fakeClient();
    const hooks = await makeHooks(fake.client, { KAIROS_CLASSIFIER_MODEL: "opencode-go/modelo-de-prueba" });
    await hooks.event(askEvent());
    assert.equal(fake.prompts.length, 1);
    const entry = fake.prompts[0];
    assert.deepEqual(entry.path, { id: fake.created[0] });
    assert.deepEqual(entry.body.model, { providerID: "opencode-go", modelID: "modelo-de-prueba" });
    assert.deepEqual(entry.body.tools, {}, "la sesión interna no habilita herramientas");
    assert.equal(entry.body.parts[0].type, "text");
    assert.match(entry.body.parts[0].text, /Reply with only one JSON object/);
    assert.ok(typeof entry.body.system === "string" && entry.body.system.includes("live human request"));
    const defaultFake = fakeClient();
    const defaultHooks = await makeHooks(defaultFake.client);
    await defaultHooks.event(askEvent({ tool: { messageID: "m", callID: "c-default" } }));
    assert.deepEqual(defaultFake.prompts[0].body.model, { providerID: "opencode-go", modelID: "deepseek-v4.1-flash" });
});

// --- fail-safe y robustez ---

test("fail-safe: un post roto no escapa del hook", async () => {
    const fake = fakeClient({ postThrows: true });
    const hooks = await makeHooks(fake.client, { KAIROS_CLASSIFIER_STUB: "allow" });
    await hooks.event(askEvent());
    assert.equal(fake.posts.length, 0);
});

test("fail-safe: APIs de sesión caídas dejan la decisión como está", async () => {
    const fake = fakeClient({ sessionThrows: true });
    const hooks = await makeHooks(fake.client);
    await hooks.event(askEvent());
    assert.equal(fake.posts.length, 0, "sin contexto no hay veredicto ni respuesta");
    await veto(hooks, "bash", "call-fail", { command: "rm -rf /tmp/x" });
});

test("robustez: un cliente sin APIs del clasificador queda inerte", async () => {
    const hooks = await makeHooks({}, { KAIROS_CLASSIFIER_STUB: "allow" });
    await hooks.event(askEvent());
    await veto(hooks, "bash", "call-bare", { command: "ls" });
});

// --- e2e opt-in (pty con TUI real y stub determinista) ---

test(
    "e2e: el stub auto-aprueba el ask y el comando deja el marcador (pty)",
    { skip: !E2E && "usa KAIROS_E2E=1", timeout: 120000 },
    () => {
        rmSync(E2E_MARKER, { force: true });
        mkdirSync(E2E_MARKER_DIR, { recursive: true });
        // El marcador vive dentro del worktree de la sesión: una ruta absoluta
        // fuera del proyecto añadiría un ask de external_directory que el
        // clasificador no debe responder (es consentimiento humano). Así el
        // único ask es el de bash, que es el camino bajo prueba.
        const prompt = "Ejecuta exactamente: echo e2e-ok > marker.txt";
        const inner = `stty rows 44 cols 130; exec '${OPENCODE}' --model opencode-go/deepseek-v4.1-flash --prompt '${prompt}'`;
        const env = {
            ...process.env,
            KAIROS_NO_SYNC: "1",
            KAIROS_CLASSIFIER_STUB: "allow",
            OPENCODE_CONFIG: join(ROOT, "opencode.json"),
            OPENCODE_CONFIG_DIR: ROOT,
            OPENCODE_TUI_CONFIG: join(ROOT, "tui.json"),
            TERM: "xterm",
        };
        try {
            execFileSync("/usr/bin/timeout", ["-s", "TERM", "40", "/usr/bin/script", "-qec", inner, "/dev/null"], {
                env,
                cwd: E2E_MARKER_DIR,
                stdio: "ignore",
                timeout: 90000,
            });
        } catch {
            // La TUI queda abierta y el timeout la cierra; el marcador es la prueba.
        }
        assert.ok(existsSync(E2E_MARKER), "el comando auto-aprobado debe dejar el marcador");
        assert.match(readFileSync(E2E_MARKER, "utf8"), /e2e-ok/);
    },
);
