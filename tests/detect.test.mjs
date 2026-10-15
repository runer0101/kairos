// Pruebas del detector de IA local: endpoints propios, filtros y tolerancia a errores.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import { createServer } from "node:http";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DETECT = join(ROOT, "scripts", "detect-local-models.mjs");

// Asíncrono a propósito: el servidor de prueba vive en este mismo proceso y no podría responder
// si el detector se ejecutara con execFileSync (bloquea el event loop).
async function runDetect(file) {
    const { stdout } = await execFileAsync(process.execPath, [DETECT], {
        env: { ...process.env, OPENCODE_VENJIX_LOCAL_PROVIDERS: file },
        timeout: 15000,
        encoding: "utf8",
    });
    return JSON.parse(stdout); // siempre debe ser JSON válido
}

function serveModels(ids) {
    return new Promise((resolve) => {
        const server = createServer((req, res) => {
            res.setHeader("content-type", "application/json");
            if (req.url.endsWith("/models")) {
                res.end(JSON.stringify({ object: "list", data: ids.map((id) => ({ id })) }));
            } else {
                res.statusCode = 404;
                res.end("{}");
            }
        });
        server.listen(0, "127.0.0.1", () => resolve(server));
    });
}

test("detecta un endpoint propio, filtra embeddings y mantiene el nombre", async () => {
    const server = await serveModels(["mi-modelo", "nomic-embed-text"]);
    const dir = mkdtempSync(join(tmpdir(), "ovj-detect-"));
    try {
        const port = server.address().port;
        const file = join(dir, "providers.json");
        writeFileSync(file, JSON.stringify([{ id: "local-prueba", name: "Prueba (local)", baseURL: `http://127.0.0.1:${port}/v1` }]));
        const cfg = await runDetect(file);
        const p = cfg.provider["local-prueba"];
        assert.ok(p, "no detectó el endpoint propio");
        assert.equal(p.name, "Prueba (local)");
        assert.equal(p.npm, "@ai-sdk/openai-compatible");
        assert.ok(p.models["mi-modelo"], "falta el modelo");
        assert.equal(p.models["nomic-embed-text"], undefined, "los embeddings deben omitirse");
        assert.equal(cfg.model, undefined, "el detector nunca cambia el modelo por defecto");
    } finally {
        server.close();
        rmSync(dir, { recursive: true, force: true });
    }
});

test("ignora endpoints cuyo id no empieza por local- (no se mezclan con la config global)", async () => {
    const server = await serveModels(["x"]);
    const dir = mkdtempSync(join(tmpdir(), "ovj-detect-"));
    try {
        const port = server.address().port;
        const file = join(dir, "providers.json");
        writeFileSync(file, JSON.stringify([{ id: "ollama", name: "Malo", baseURL: `http://127.0.0.1:${port}/v1` }]));
        const cfg = await runDetect(file);
        assert.equal(cfg.provider?.ollama?.name, undefined, "un id 'ollama' no debe aceptarse desde el archivo propio");
    } finally {
        server.close();
        rmSync(dir, { recursive: true, force: true });
    }
});

test("un archivo corrupto no rompe el lanzador: se obtiene JSON válido", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ovj-detect-"));
    try {
        const file = join(dir, "providers.json");
        writeFileSync(file, "{ no es json");
        const cfg = await runDetect(file);
        assert.equal(typeof cfg, "object");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("un endpoint que no responde se ignora sin error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ovj-detect-"));
    try {
        const file = join(dir, "providers.json");
        writeFileSync(file, JSON.stringify([{ id: "local-muerto", name: "Muerto", baseURL: "http://127.0.0.1:9/v1" }]));
        const cfg = await runDetect(file);
        assert.equal(cfg.provider?.["local-muerto"], undefined);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
