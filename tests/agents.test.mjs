// Pruebas de agentes, prompts y comandos: frontmatter válido, permisos y portabilidad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function frontmatter(path) {
    const text = readFileSync(path, "utf8");
    const m = text.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(m, `sin frontmatter: ${path}`);
    return { raw: m[1], body: text.slice(m[0].length) };
}

const agentFiles = readdirSync(join(ROOT, "config", "agents")).filter((f) => f.endsWith(".md"));

test("hay subagentes generados desde gentle-shell", () => {
    assert.ok(agentFiles.length >= 10, `solo ${agentFiles.length} agentes`);
});

test("cada subagente declara descripción y modo subagent", () => {
    for (const f of agentFiles) {
        const { raw } = frontmatter(join(ROOT, "config", "agents", f));
        assert.match(raw, /^description:/m, `${f} sin description`);
        assert.match(raw, /^mode: subagent$/m, `${f} debe ser subagent`);
    }
});

test("los revisores y el explorador no pueden editar archivos", () => {
    for (const f of agentFiles.filter((x) => /^(review-|gentle-ai-explore)/.test(x))) {
        const { raw } = frontmatter(join(ROOT, "config", "agents", f));
        assert.match(raw, /edit: deny/, `${f} debe denegar edit`);
    }
});

test("solo el ejecutor de correcciones puede editar (jd-fix-agent)", () => {
    const { raw } = frontmatter(join(ROOT, "config", "agents", "jd-fix-agent.md"));
    assert.match(raw, /edit: allow/);
});

test("ningún prompt conserva placeholders sin resolver", () => {
    for (const dir of ["config/agents", "config/prompts", "config/gentle-assets"]) {
        for (const f of readdirSync(join(ROOT, dir), { recursive: true })) {
            if (!String(f).endsWith(".md")) continue;
            const text = readFileSync(join(ROOT, dir, String(f)), "utf8");
            assert.ok(!text.includes("{{"), `placeholder en ${dir}/${f}`);
        }
    }
});

test("el prompt del orquestador lleva la nota de equivalencias de runtime", () => {
    const text = readFileSync(join(ROOT, "config", "prompts", "orchestrator.md"), "utf8");
    assert.match(text, /Runtime: OpenCode/);
    assert.match(text, /`task`/);
});

const commandFiles = readdirSync(join(ROOT, "config", "commands")).filter((f) => f.endsWith(".md"));

test("cada comando tiene descripción", () => {
    for (const f of commandFiles) {
        const { raw } = frontmatter(join(ROOT, "config", "commands", f));
        assert.match(raw, /^description: .+/m, `${f} sin description`);
    }
});

test("los comandos no contienen rutas personales (usan $OPENCODE_CONFIG_DIR)", () => {
    for (const f of commandFiles) {
        const text = readFileSync(join(ROOT, "config", "commands", f), "utf8");
        assert.ok(!/\/home\/[a-z0-9_-]+\//i.test(text), `ruta personal en commands/${f}`);
    }
});

test("el comando de ODD apunta a una plantilla que existe", () => {
    assert.ok(readFileSync(join(ROOT, "config", "commands", "odd-task.md"), "utf8").includes("odd/TEMPLATE.md"));
    readFileSync(join(ROOT, "config", "odd", "TEMPLATE.md"), "utf8");
});

test("/judge respeta las reglas de la skill judgment-day", () => {
    const text = readFileSync(join(ROOT, "config", "commands", "judge.md"), "utf8");
    assert.match(text, /ciegos/);
    assert.match(text, /BLOCKER o CRITICAL/);
    assert.match(text, /Como máximo dos rondas/);
});
