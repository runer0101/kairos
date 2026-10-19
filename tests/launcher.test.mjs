// Pruebas del lanzador: el interruptor de IA local es por máquina y no toca el repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LAUNCHER = join(ROOT, "bin", "kairos");

// Traza la ejecución del lanzador sin abrir OpenCode (OPENCODE_BIN apunta a /bin/true).
async function traceLauncher(env) {
    const { stderr } = await execFileAsync("bash", ["-x", LAUNCHER], {
        env: { ...process.env, OPENCODE_BIN: "/bin/true", KAIROS_NO_SYNC: "1", ...env },
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

test("KAIROS_NO_LOCAL=1 no invoca al detector de IA local", async () => {
    const stderr = await traceLauncher({ KAIROS_NO_LOCAL: "1" });
    assert.ok(!detectorInvoked(stderr), "el detector no debería ejecutarse con el interruptor activo");
});

test("sin interruptor, el detector se invoca salvo que exista .no-local-ai", async () => {
    const marker = join(ROOT, ".no-local-ai");
    const stderr = await traceLauncher({ KAIROS_NO_LOCAL: "" });
    if (existsSync(marker)) {
        assert.ok(!detectorInvoked(stderr), ".no-local-ai existe: el detector no debería ejecutarse");
    } else {
        assert.ok(detectorInvoked(stderr), "sin marcador, el detector debería ejecutarse");
    }
});

test("install.sh crea los alias cortos kai y ks y el lanzador los documenta", () => {
    const install = readFileSync(join(ROOT, "install.sh"), "utf8");
    assert.match(install, /link "\$REPO\/bin\/kairos" "\$BIN_DIR\/kai"/, "falta el enlace kai en install.sh");
    assert.match(install, /link "\$REPO\/bin\/kairos" "\$BIN_DIR\/ks"/, "falta el enlace ks en install.sh");
    const launcher = readFileSync(LAUNCHER, "utf8");
    assert.match(launcher, /alias cortos/, "el lanzador debe documentar los alias");
    assert.match(launcher, /\bkai, ks\b/, "el lanzador debe documentar el alias ks junto a kai");
});

test("install.sh soporta la instalación en un comando (curl | bash)", () => {
    const install = readFileSync(join(ROOT, "install.sh"), "utf8");
    assert.match(install, /ensure_checkout/, "falta el bootstrap para curl | bash");
    assert.match(
        install,
        /raw\.githubusercontent\.com\/runer0101\/kairos\/main\/install\.sh/,
        "falta la URL del instalador de un comando",
    );
});

// --- Binario propio con la sidebar a la izquierda -------------------------

// HOME de mentira con binarios de mentira: el lanzador debe elegir entre el
// oficial y el parcheado sin tocar la instalación real.
function fakeHome({ patched = false, official = false } = {}) {
    const home = mkdtempSync(join(tmpdir(), "kairos-home-"));
    const writeBin = (path, label) => {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `#!/bin/sh\necho ${label} db=\${OPENCODE_DISABLE_CHANNEL_DB:-unset}\n`);
        chmodSync(path, 0o755);
    };
    if (patched) writeBin(join(home, ".local/share/kairos/opencode-patched/bin/opencode"), "patched");
    if (official) writeBin(join(home, ".opencode/bin/opencode"), "official");
    return home;
}

async function runLauncher(env) {
    const base = { ...process.env, KAIROS_NO_SYNC: "1", KAIROS_NO_LOCAL: "1", ...env };
    delete base.OPENCODE_BIN;
    delete base.KAIROS_OPENCODE_BIN;
    if (env.OPENCODE_BIN) base.OPENCODE_BIN = env.OPENCODE_BIN;
    const { stdout } = await execFileAsync("bash", [LAUNCHER], { env: base, timeout: 15000, encoding: "utf8" });
    return stdout.trim();
}

test("el lanzador usa el binario parcheado si está instalado, con la db normal", async () => {
    const home = fakeHome({ patched: true, official: true });
    try {
        assert.equal(
            await runLauncher({ HOME: home }),
            "patched db=1",
            "el parcheado tiene prioridad y comparte la base de sesiones (OPENCODE_DISABLE_CHANNEL_DB=1)",
        );
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
});

test("sin binario parcheado, el lanzador usa el oficial sin tocar el entorno", async () => {
    const home = fakeHome({ official: true });
    try {
        assert.equal(await runLauncher({ HOME: home }), "official db=unset", "cae al instalado por OpenCode");
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
});

test("OPENCODE_BIN explícito gana al binario parcheado", async () => {
    const home = fakeHome({ patched: true, official: true });
    const explicit = mkdtempSync(join(tmpdir(), "kairos-explicit-"));
    const explicitBin = join(explicit, "opencode");
    writeFileSync(explicitBin, "#!/bin/sh\necho explicit db=${OPENCODE_DISABLE_CHANNEL_DB:-unset}\n");
    chmodSync(explicitBin, 0o755);
    try {
        assert.equal(await runLauncher({ HOME: home, OPENCODE_BIN: explicitBin }), "explicit db=unset", "la variable manda");
    } finally {
        rmSync(home, { recursive: true, force: true });
        rmSync(explicit, { recursive: true, force: true });
    }
});

test("el parche del binario propio toca lo esperado", () => {
    const patch = readFileSync(join(ROOT, "patches", "opencode-left-panel.patch"), "utf8");
    assert.match(patch, /packages\/tui\/src\/config\/index\.tsx/, "schema de la TUI");
    assert.match(patch, /packages\/tui\/src\/routes\/session\/index\.tsx/, "layout de la sesión");
    assert.match(patch, /session_left_width/, "ancho del panel izquierdo");
    assert.match(patch, /name="session_left"/, "slot del panel izquierdo en el layout");
    assert.match(patch, /sidebar_position/, "opción de posición de la sidebar (desactivada por defecto)");
    assert.match(patch, /row-reverse/, "row-reverse disponible para la sidebar a la izquierda");
});

test("el script de build construye e instala el binario donde el lanzador lo busca", () => {
    const scriptPath = join(ROOT, "scripts", "build-opencode-patched.sh");
    const script = readFileSync(scriptPath, "utf8");
    assert.ok(script.startsWith("#!/usr/bin/env bash"), "script de bash");
    assert.ok((statSync(scriptPath).mode & 0o111) !== 0, "debe ser ejecutable");
    assert.match(script, /patches\/opencode-left-panel\.patch/, "usa el parche del repositorio");
    assert.match(script, /v1\.18\.35/, "versión por defecto del stack");
    assert.match(script, /OPENCODE_CHANNEL=kairos/, "canal propio: no toca las sesiones normales");
    assert.match(script, /opencode-patched/, "instala en la ruta que usa el lanzador");
});
