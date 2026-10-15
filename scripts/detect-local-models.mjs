#!/usr/bin/env node
// Detecta runtimes de IA local que expongan una API compatible con OpenAI y
// imprime un bloque de configuración de OpenCode (se pasa en OPENCODE_CONFIG_CONTENT).
//
// Runtimes buscados en su puerto por defecto:
//   Ollama (11434), LM Studio (1234), llama.cpp llama-server (8080), vLLM (8000).
// Endpoints propios: <raíz>/local-providers.json, lista de { "id", "name", "baseURL" }.
//   El id debe empezar por "local-" (así no se mezcla con proveedores de la configuración global).
//
// Reglas:
//  - No instala nada y no descarga modelos.
//  - Un runtime que no responde se ignora sin error.
//  - No cambia el modelo por defecto: solo añade proveedores (lo fija opencode.json).
//  - Siempre imprime un JSON válido; sin runtimes imprime {}.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TIMEOUT_MS = 800;
// OpenAI-compatible no informa límites: se usan valores conservadores.
const DEFAULT_LIMIT = { context: 32768, output: 4096 };

const DEFAULT_RUNTIMES = [
    { id: "local-ollama", name: "Ollama (local)", baseURL: "http://127.0.0.1:11434/v1" },
    { id: "local-lmstudio", name: "LM Studio (local)", baseURL: "http://127.0.0.1:1234/v1" },
    { id: "local-llamacpp", name: "llama.cpp (local)", baseURL: "http://127.0.0.1:8080/v1" },
    { id: "local-vllm", name: "vLLM (local)", baseURL: "http://127.0.0.1:8000/v1" },
];

function loadCustomRuntimes() {
    // OPENCODE_VENJIX_LOCAL_PROVIDERS permite usar otro archivo (pruebas o varias configuraciones).
    const file = process.env.OPENCODE_VENJIX_LOCAL_PROVIDERS || join(ROOT, "local-providers.json");
    if (!existsSync(file)) return [];
    try {
        const list = JSON.parse(readFileSync(file, "utf8"));
        if (!Array.isArray(list)) return [];
        return list.filter(
            (p) =>
                p &&
                typeof p.id === "string" &&
                /^local-[a-z0-9-]+$/.test(p.id) &&
                typeof p.name === "string" &&
                typeof p.baseURL === "string" &&
                /^https?:\/\//.test(p.baseURL),
        );
    } catch {
        return [];
    }
}

async function listModelIds(baseURL) {
    const res = await fetch(`${baseURL.replace(/\/+$/, "")}/models`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = await res.json();
    const data = Array.isArray(body.data) ? body.data : [];
    return data
        .map((m) => (m && typeof m.id === "string" ? m.id : null))
        .filter((id) => id && !/embed/i.test(id));
}

async function main() {
    const runtimes = [...DEFAULT_RUNTIMES, ...loadCustomRuntimes()];
    const found = await Promise.all(
        runtimes.map(async (r) => {
            try {
                const ids = await listModelIds(r.baseURL);
                return ids.length ? { ...r, ids } : null;
            } catch {
                return null;
            }
        }),
    );

    const provider = {};
    for (const r of found) {
        if (!r) continue;
        const models = {};
        for (const id of r.ids) {
            models[id] = { name: id, tool_call: true, limit: DEFAULT_LIMIT };
        }
        provider[r.id] = {
            npm: "@ai-sdk/openai-compatible",
            name: r.name,
            options: { baseURL: r.baseURL },
            models,
        };
    }
    process.stdout.write(JSON.stringify(Object.keys(provider).length ? { provider } : {}));
}

main().catch(() => process.stdout.write("{}"));
