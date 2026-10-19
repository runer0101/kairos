// Pruebas de rutas sensibles: el plugin bloquea claves y credenciales en lectura/escritura
// para todos los agentes (también kairos-auto, que se salta las preguntas), y la
// configuración las deniega o pregunta en el perfil normal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(ROOT, "config", "opencode.json"), "utf8"));
const { GentleShellPlugin } = await import(join(ROOT, "config", "plugins", "gentle-shell.ts"));

const hooks = await GentleShellPlugin({ $: () => {} });
const before = hooks["tool.execute.before"];

test("la configuración deniega las credenciales y pregunta por archivos .env", () => {
    assert.equal(cfg.permission.read["*"], "allow");
    for (const pattern of ["**/.ssh/**", "$HOME/.ssh/**", "**/.gnupg/**", "**/.aws/**", "**/.netrc", "**/.git-credentials"]) {
        assert.equal(cfg.permission.read[pattern], "deny", `falta deny para ${pattern}`);
    }
    assert.equal(cfg.permission.read["**/.env"], "ask");
    assert.equal(cfg.permission.read["**/.env.example"], "allow");
});

test("el plugin bloquea claves y credenciales en lectura y escritura", async () => {
    for (const tool of ["read", "edit", "write"]) {
        await assert.rejects(
            () => before({ tool }, { args: { filePath: "/proyecto/.ssh/id_rsa" } }),
            /ruta sensible bloqueada/,
            `${tool} debería bloquear ~/.ssh`,
        );
        await assert.rejects(
            () => before({ tool }, { args: { filePath: "/proyecto/.aws/credentials" } }),
            /ruta sensible bloqueada/,
            `${tool} debería bloquear ~/.aws`,
        );
    }
    await assert.rejects(
        () => before({ tool: "edit" }, { args: { filePath: "/repo/.ssh/authorized_keys" } }),
        /ruta sensible bloqueada/,
        "escribir authorized_keys debe bloquearse",
    );
    await assert.rejects(
        () => before({ tool: "grep" }, { args: { path: "/proyecto/.gnupg" } }),
        /ruta sensible bloqueada/,
        "buscar dentro de .gnupg debe bloquearse",
    );
    await assert.rejects(
        () => before({ tool: "read" }, { args: { filePath: "/backup/id_ed25519" } }),
        /ruta sensible bloqueada/,
        "claves fuera de .ssh también se bloquean",
    );
});

test("el plugin no bloquea archivos normales ni claves públicas", async () => {
    await before({ tool: "read" }, { args: { filePath: "/repo/src/index.ts" } });
    await before({ tool: "read" }, { args: { filePath: "/repo/deploy/id_rsa.pub" } });
    await before({ tool: "read" }, { args: { filePath: "/repo/README.md" } });
});

test("el plugin bloquea comandos bash que referencian rutas sensibles", async () => {
    await assert.rejects(
        () => before({ tool: "bash" }, { args: { command: "cat /proyecto/.ssh/id_rsa" } }),
        /ruta sensible/,
        "cat de una clave SSH debe bloquearse",
    );
    await assert.rejects(
        () => before({ tool: "bash" }, { args: { command: "ssh-add ~/.ssh/id_ed25519" } }),
        /ruta sensible/,
        "referenciar ~/.ssh debe bloquearse",
    );
    await before({ tool: "bash" }, { args: { command: "git status" } });
    await before({ tool: "bash" }, { args: { command: "ls -la src" } });
});
