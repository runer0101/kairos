// Pruebas del sincronizador: --check informa del estado sin escribir nada
// (ni archivos gestionados ni el marcador .gentle-shell-sync.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, cpSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "sync-gentle-shell.mjs");
const GS_PKG = join(homedir(), ".gentle-shell", "current", "node_modules", "gentle-pi");
const skip = existsSync(join(GS_PKG, "package.json")) ? false : "gentle-shell no está instalado en esta máquina";

async function runCheck(cwd) {
    try {
        const { stdout } = await execFileAsync(
            process.execPath,
            [join(cwd, "scripts", "sync-gentle-shell.mjs"), "--check"],
            { cwd, encoding: "utf8", timeout: 60000 },
        );
        return { code: 0, stdout };
    } catch (err) {
        return { code: err.code ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
    }
}

// Huella (ruta + hash) de todo lo que gestiona el sync, para detectar cualquier escritura.
function snapshot() {
    const out = {};
    const walk = (p, rel) => {
        if (!existsSync(p)) {
            out[rel] = null;
            return;
        }
        if (statSync(p).isFile()) {
            out[rel] = createHash("sha256").update(readFileSync(p)).digest("hex");
            return;
        }
        for (const e of readdirSync(p, { withFileTypes: true })) walk(join(p, e.name), `${rel}/${e.name}`);
    };
    const roots = [
        "config/agents",
        "config/prompts",
        "config/gentle-assets",
        "config/lib/destructive-command-guard.ts",
        "licenses/LICENSE-gentle-shell",
        "config/skills/gentle-ai",
        "config/skills/rdd-defect-workflow",
        ".gentle-shell-sync.json",
    ];
    for (const r of roots) walk(join(ROOT, r), r);
    return out;
}

test("--check en un repo sin sincronizar informa pendientes y no escribe", { skip }, async () => {
    const tmp = mkdtempSync(join(tmpdir(), "ovj-check-"));
    mkdirSync(join(tmp, "scripts"));
    cpSync(SCRIPT, join(tmp, "scripts", "sync-gentle-shell.mjs"));
    const before = readdirSync(tmp, { recursive: true }).sort();

    const { code, stdout } = await runCheck(tmp);

    assert.equal(code, 1, "un repo desincronizado debe salir con 1");
    assert.match(stdout, /cambios pendientes/);
    assert.equal(existsSync(join(tmp, ".gentle-shell-sync.json")), false, "no debe crear el marcador");
    assert.deepEqual(readdirSync(tmp, { recursive: true }).sort(), before, "no debe escribir archivos");
});

test("--check en el repo real está al día y no toca marcador ni archivos", { skip }, async () => {
    const marker = join(ROOT, ".gentle-shell-sync.json");
    const markerBefore = readFileSync(marker, "utf8");
    const snapshotBefore = snapshot();

    const { code, stdout } = await runCheck(ROOT);

    assert.equal(readFileSync(marker, "utf8"), markerBefore, "el marcador no debe cambiar");
    assert.deepEqual(snapshot(), snapshotBefore, "los archivos gestionados no deben cambiar");
    assert.equal(code, 0, `se esperaba al día; salida: ${stdout}`);
    assert.match(stdout, /al día/);
});
