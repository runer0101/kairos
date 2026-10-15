// Pruebas de sonidos: los tonos portados de gentle-pi existen y el plugin los conecta
// de forma opcional (OPENCODE_VENJIX_SOUNDS=1; apagados por defecto).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOUNDS = join(ROOT, "assets", "sounds");
const pluginSrc = readFileSync(join(ROOT, "plugins", "gentle-shell.ts"), "utf8");

test("los tres tonos portados existen y son WAV válidos", () => {
    for (const name of ["success", "error", "attention"]) {
        const file = join(SOUNDS, `${name}.wav`);
        assert.ok(existsSync(file), `falta ${name}.wav`);
        const head = readFileSync(file).subarray(0, 12);
        assert.equal(head.toString("ascii", 0, 4), "RIFF", `${name}.wav no es RIFF`);
        assert.equal(head.toString("ascii", 8, 12), "WAVE", `${name}.wav no es WAVE`);
    }
    assert.ok(existsSync(join(SOUNDS, "LICENSE.md")), "falta la atribución de los tonos");
});

test("el plugin reproduce sonidos solo con el interruptor y mapea los tres eventos", () => {
    assert.match(pluginSrc, /OPENCODE_VENJIX_SOUNDS/, "falta el interruptor opt-in");
    assert.match(pluginSrc, /if \(!SOUNDS_ENABLED\) return/, "sin interruptor no debe sonar nada");
    assert.match(pluginSrc, /"session\.idle"\) playSound\("success"\)/, "falta fin de tarea -> success");
    assert.match(pluginSrc, /"session\.error"\) playSound\("error"\)/, "falta error -> error");
    assert.match(pluginSrc, /"permission\.asked"/, "falta el evento de permiso");
    assert.match(pluginSrc, /"question\.asked"\) playSound\("attention"\)/, "falta pregunta -> attention");
});
