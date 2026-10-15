// Pruebas del lanzador: el interruptor de IA local es por máquina y no toca el repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LAUNCHER = join(ROOT, "bin", "opencode-venjix");

// Traza la ejecución del lanzador sin abrir OpenCode (OPENCODE_BIN apunta a /bin/true).
async function traceLauncher(env) {
    const { stderr } = await execFileAsync("bash", ["-x", LAUNCHER], {
        env: { ...process.env, OPENCODE_BIN: "/bin/true", OPENCODE_VENJIX_NO_SYNC: "1", ...env },
        timeout: 15000,
        encoding: "utf8",
    });
    return stderr;
}

// La invocación real al detector aparece en la traza como "node ...detect-local-models.mjs";
// la mera asignación de DETECT_SCRIPT=... no cuenta.
function detectorInvoked(stderr) {
    return stderr
        .split("\n")
        .some((line) => /\bnode\b.*detect-local-models\.mjs/.test(line) && !line.includes("DETECT_SCRIPT="));
}

test("OPENCODE_VENJIX_NO_LOCAL=1 no invoca al detector de IA local", async () => {
    const stderr = await traceLauncher({ OPENCODE_VENJIX_NO_LOCAL: "1" });
    assert.ok(!detectorInvoked(stderr), "el detector no debería ejecutarse con el interruptor activo");
});

test("sin interruptor, el detector se invoca salvo que exista .no-local-ai", async () => {
    const marker = join(ROOT, ".no-local-ai");
    const stderr = await traceLauncher({ OPENCODE_VENJIX_NO_LOCAL: "" });
    if (existsSync(marker)) {
        assert.ok(!detectorInvoked(stderr), ".no-local-ai existe: el detector no debería ejecutarse");
    } else {
        assert.ok(detectorInvoked(stderr), "sin marcador, el detector debería ejecutarse");
    }
});

test("install.sh crea el alias corto ov y el lanzador lo documenta", () => {
    const install = readFileSync(join(ROOT, "install.sh"), "utf8");
    assert.match(install, /link "\$REPO\/bin\/opencode-venjix" "\$BIN_DIR\/ov"/, "falta el enlace ov en install.sh");
    const launcher = readFileSync(LAUNCHER, "utf8");
    assert.match(launcher, /alias corto/, "el lanzador debe documentar el alias");
});

test("install.sh soporta la instalación en un comando (curl | bash)", () => {
    const install = readFileSync(join(ROOT, "install.sh"), "utf8");
    assert.match(install, /ensure_checkout/, "falta el bootstrap para curl | bash");
    assert.match(
        install,
        /raw\.githubusercontent\.com\/runer0101\/opencode-venjix\/main\/install\.sh/,
        "falta la URL del instalador de un comando",
    );
});
