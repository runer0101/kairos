// Pruebas de la integración de Ponytail: skills y comandos vendorizados, sin plugin.
// La fuente es DietrichGebert/ponytail 5.3.2 (MIT); ver LICENSE-ponytail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = ["ponytail", "ponytail-review", "ponytail-debt"];
const COMMANDS = ["ponytail", "ponytail-review", "ponytail-debt"];

function frontmatter(path) {
    const text = readFileSync(path, "utf8");
    const m = text.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(m, `sin frontmatter: ${path}`);
    return { raw: m[1], body: text.slice(m[0].length) };
}

test("las tres skills de Ponytail existen con frontmatter válido", () => {
    for (const name of SKILLS) {
        const path = join(ROOT, "skills", name, "SKILL.md");
        assert.ok(existsSync(path), `falta skills/${name}/SKILL.md`);
        const { raw, body } = frontmatter(path);
        assert.match(raw, new RegExp(`^name: ${name}$`, "m"), `${name}: name no coincide con el directorio`);
        assert.match(raw, /^description: [>|]?/m, `${name}: falta description`);
        assert.match(raw, /^license: MIT$/m, `${name}: debe declarar license: MIT`);
        assert.ok(body.trim().length > 200, `${name}: cuerpo vacío o demasiado corto`);
    }
});

test("los tres comandos de Ponytail existen y describen su uso", () => {
    for (const name of COMMANDS) {
        const path = join(ROOT, "commands", `${name}.md`);
        assert.ok(existsSync(path), `falta commands/${name}.md`);
        const { raw, body } = frontmatter(path);
        assert.match(raw, /^description: .+/m, `${name}: falta description`);
        assert.ok(body.trim().length > 40, `${name}: plantilla vacía`);
    }
});

test("los comandos de Ponytail no colisionan con los existentes", () => {
    const all = readdirSync(join(ROOT, "commands"))
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.slice(0, -3));
    assert.equal(new Set(all).size, all.length, "hay nombres de comando duplicados");
});

test("/ponytail cubre los niveles y /ponytail-review exige veredicto", () => {
    const level = readFileSync(join(ROOT, "commands", "ponytail.md"), "utf8");
    assert.match(level, /lite/);
    assert.match(level, /full/);
    assert.match(level, /ultra/);
    const review = readFileSync(join(ROOT, "commands", "ponytail-review.md"), "utf8");
    assert.match(review, /Verdict/i);
    assert.match(review, /Must fix/);
    const debt = readFileSync(join(ROOT, "commands", "ponytail-debt.md"), "utf8");
    assert.match(debt, /shortcut:/);
});

test("la licencia MIT de Ponytail se conserva y se atribuye", () => {
    const license = readFileSync(join(ROOT, "LICENSE-ponytail"), "utf8");
    assert.match(license, /MIT License/);
    assert.match(license, /DietrichGebert/);
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    assert.match(readme, /Ponytail/);
    assert.match(readme, /LICENSE-ponytail/);
});

test("los dos perfiles integran Ponytail en el prompt común", () => {
    const cfg = JSON.parse(readFileSync(join(ROOT, "opencode.json"), "utf8"));
    for (const name of ["kairos-control", "kairos-auto"]) {
        assert.equal(cfg.agent[name].prompt, "{file:./prompts/orchestrator.md}", `${name} debe usar el prompt común`);
    }
    assert.equal(existsSync(join(ROOT, "prompts", "orchestrator-auto.md")), false, "el prompt auto ya no debe existir");
    const prompt = readFileSync(join(ROOT, "prompts", "orchestrator.md"), "utf8");
    assert.match(prompt, /Runtime: OpenCode/);
    assert.match(prompt, /Implementation Economy \(Ponytail, fused\)/);
    assert.match(prompt, /kairos wins/);
    assert.match(prompt, /shortcut:/);
    assert.match(prompt, /Never cut:/);
});

test("el sincronizador integra la capa de Ponytail en el prompt común", () => {
    const sync = readFileSync(join(ROOT, "scripts", "sync-gentle-shell.mjs"), "utf8");
    assert.match(sync, /PONYTAIL_LAYER/);
    assert.ok(!sync.includes("orchestrator-auto.md"), "el prompt auto ya no debe generarse");
});

test("/review incorpora la lente lean de Ponytail", () => {
    const review = readFileSync(join(ROOT, "commands", "review.md"), "utf8");
    assert.match(review, /ponytail-review/);
    assert.match(review, /lean/i);
});

test("la plantilla ODD registra la deuda deliberada", () => {
    const template = readFileSync(join(ROOT, "odd", "TEMPLATE.md"), "utf8");
    assert.match(template, /Deuda deliberada/);
    assert.match(template, /shortcut:/);
});
