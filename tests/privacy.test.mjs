// Prueba de privacidad: los archivos versionados no deben contener datos de esta máquina
// (rutas /home/<usuario> o /Users/<usuario>, correos personales). El repositorio se
// publica tal cual, así que cualquier dato real que se cuele debe fallar aquí.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Los patrones se construyen por partes para que este archivo no se marque a sí mismo.
const RULES = [
    { name: "ruta de hogar", re: new RegExp("/(?:home|Users)/[A-Za-z0-9._-]+/") },
    {
        name: "correo personal",
        re: new RegExp("[A-Za-z0-9._%+-]+@" + "(?:gmail|hotmail|outlook|yahoo|proton)\\.[A-Za-z]{2,}", "i"),
    },
    { name: "identificador personal", re: new RegExp("ccam" + "achod", "i") },
];

function trackedFiles() {
    try {
        return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
            .split("\0")
            .filter(Boolean);
    } catch {
        return null;
    }
}

const FILES = trackedFiles();

test("los archivos versionados no contienen datos personales", { skip: FILES === null && "git no está disponible" }, () => {
    const findings = [];
    for (const rel of FILES) {
        const buf = readFileSync(join(ROOT, rel));
        if (buf.subarray(0, 8192).includes(0)) continue; // binario
        const lines = buf.toString("utf8").split("\n");
        for (const [i, line] of lines.entries()) {
            for (const rule of RULES) {
                if (rule.re.test(line)) {
                    findings.push(`${rel}:${i + 1}: ${rule.name}: ${line.trim().slice(0, 120)}`);
                }
            }
        }
    }
    assert.deepEqual(findings, [], `datos personales en archivos versionados:\n${findings.join("\n")}`);
});
