// Pruebas de extremo a extremo con OpenCode real. Se activan con KAIROS_E2E=1
// porque llaman al binario y a un modelo (el gratuito de OpenCode requiere red).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LAUNCHER = join(ROOT, "bin", "kairos");
const OPENCODE = process.env.OPENCODE_BIN || join(homedir(), ".opencode", "bin", "opencode");
const enabled = process.env.KAIROS_E2E === "1";
const CFG = JSON.parse(readFileSync(join(ROOT, "opencode.json"), "utf8"));

const env = {
    ...process.env,
    KAIROS_NO_SYNC: "1",
    OPENCODE_CONFIG: join(ROOT, "opencode.json"),
    OPENCODE_CONFIG_DIR: ROOT,
    OPENCODE_TUI_CONFIG: join(ROOT, "tui.json"),
};

test("el binario de OpenCode existe", { skip: !enabled && "usa KAIROS_E2E=1" }, () => {
    assert.ok(existsSync(OPENCODE), `no encuentro ${OPENCODE}`);
});

test("la lista de agentes incluye los perfiles", { skip: !enabled && "usa KAIROS_E2E=1" }, () => {
    // Salida a archivo (no a tubería): con tubería OpenCode puede truncar stdout al cerrar.
    const listing = join(tmpdir(), `ovj-agents-${process.pid}.txt`);
    execFileSync("/bin/sh", ["-c", `"$0" agent list > "$1" 2>&1`, OPENCODE, listing], { env, timeout: 120000 });
    const out = readFileSync(listing, "utf8");
    rmSync(listing, { force: true });
    for (const name of ["kairos (primary)", "kairos-auto (primary)"]) {
        assert.ok(out.includes(name), `falta ${name}`);
    }
});

test("el lanzador resuelve la configuración del repositorio", { skip: !enabled && "usa KAIROS_E2E=1" }, () => {
    const where = execFileSync(LAUNCHER, ["--where"], { encoding: "utf8" }).trim();
    assert.equal(where, ROOT);
});

test("el modelo por defecto responde", { skip: !enabled && "usa KAIROS_E2E=1", timeout: 300000 }, () => {
    const out = execFileSync(LAUNCHER, ["run", "-m", CFG.model, "responde solo la palabra: ok"], {
        env,
        encoding: "utf8",
        timeout: 280000,
    });
    assert.match(out.replace(/\x1b\[[0-9;]*m/g, ""), /\bok\b/i);
});
