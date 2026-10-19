// Pruebas de sonidos: los tonos portados de gentle-pi existen y el plugin TUI los registra
// como pack nativo de OpenCode ("kairos"); el plugin de servidor ya no reproduce por su cuenta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOUNDS = join(ROOT, "config", "assets", "sounds");
const tuiPlugin = readFileSync(join(ROOT, "config", "tui-plugins", "gentle-sounds.ts"), "utf8");
const serverPlugin = readFileSync(join(ROOT, "config", "plugins", "gentle-shell.ts"), "utf8");
const tuiConfig = JSON.parse(readFileSync(join(ROOT, "config", "tui.json"), "utf8"));

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

test("el pack nativo kairos mapea los eventos a los tonos y es opt-in", () => {
    assert.ok(tuiPlugin.includes("registerPack("), "falta registerPack");
    assert.ok(tuiPlugin.includes('id: "kairos"'), "el pack debe llamarse kairos");
    assert.ok(tuiPlugin.includes("done: `${dir}/success.wav`"), "done debe usar success.wav");
    assert.ok(tuiPlugin.includes("subagent_done: `${dir}/success.wav`"), "subagent_done debe usar success.wav");
    assert.ok(tuiPlugin.includes("error: `${dir}/error.wav`"), "error debe usar error.wav");
    assert.ok(tuiPlugin.includes("permission: `${dir}/attention.wav`"), "permission debe usar attention.wav");
    assert.ok(tuiPlugin.includes("question: `${dir}/attention.wav`"), "question debe usar attention.wav");
    assert.ok(tuiPlugin.includes("KAIROS_SOUNDS"), "falta el interruptor opt-in");
    assert.ok(tuiConfig.plugin.includes("./tui-plugins/gentle-sounds.ts"), "tui.json debe cargar el pack");
    assert.ok(!/paplay|pw-play|aplay|afplay/.test(serverPlugin), "el servidor ya no debe reproducir sonidos");
});
