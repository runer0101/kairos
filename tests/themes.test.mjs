// Pruebas de temas: cada archivo de themes/ debe ser un tema válido de OpenCode
// (esquema, defs y todas las claves resolubles a un color).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const THEMES_DIR = join(ROOT, "themes");

// Resuelve un valor de tema: "#rrggbb", clave de defs, o {dark, light} de ambos.
function resolves(defs, value) {
    if (typeof value === "string") {
        return value.startsWith("#") ? /^#[0-9A-Fa-f]{3,8}$/.test(value) : Boolean(defs[value]);
    }
    if (value && typeof value === "object") {
        return resolves(defs, value.dark) && resolves(defs, value.light);
    }
    return false;
}

const REQUIRED = ["primary", "accent", "error", "warning", "success", "text", "background", "border"];

for (const file of readdirSync(THEMES_DIR).filter((f) => f.endsWith(".json"))) {
    test(`tema válido: ${file}`, () => {
        const theme = JSON.parse(readFileSync(join(THEMES_DIR, file), "utf8"));
        assert.equal(theme.$schema, "https://opencode.ai/theme.json", `${file}: esquema inesperado`);
        assert.ok(theme.defs && typeof theme.defs === "object", `${file}: falta defs`);
        assert.ok(theme.theme && typeof theme.theme === "object", `${file}: falta theme`);
        for (const key of REQUIRED) {
            assert.ok(theme.theme[key] !== undefined, `${file}: falta la clave ${key}`);
        }
        for (const [key, value] of Object.entries(theme.theme)) {
            assert.ok(resolves(theme.defs, value), `${file}: ${key} no resuelve a un color (#hex o clave de defs)`);
        }
    });
}
