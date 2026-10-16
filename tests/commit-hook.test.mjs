// Pruebas del hook commit-msg: los commits publicados no llevan co-autor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = join(ROOT, "hooks", "commit-msg");

// Ejecuta el hook como lo haría git: el archivo del mensaje llega como primer argumento.
function runHook(message) {
    const dir = mkdtempSync(join(tmpdir(), "kairos-commit-msg-"));
    const file = join(dir, "COMMIT_EDITMSG");
    writeFileSync(file, message);
    try {
        execFileSync("sh", [HOOK, file], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        return { code: 0, stderr: "" };
    } catch (error) {
        return { code: error.status ?? 1, stderr: String(error.stderr ?? "") };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test("el hook rechaza mensajes con Co-authored-by en cualquier variante", () => {
    const variants = [
        "feat: algo\n\nCo-authored-by: persona <persona@example.com>\n",
        "fix: otra cosa\n\nco-authored-by: persona <persona@example.com>\n",
        "docs: algo\n\nCo-Authored-By: persona <persona@example.com>\n",
        "chore: algo\n\n  CO-AUTHORED-BY : persona <persona@example.com>\n",
    ];
    for (const variant of variants) {
        const result = runHook(variant);
        assert.notEqual(result.code, 0, `debería rechazar: ${JSON.stringify(variant)}`);
        assert.match(result.stderr, /co-authored-by|co-autor/i, "el error debe explicar el motivo");
    }
});

test("el hook deja pasar mensajes sin co-autor", () => {
    const result = runHook("feat: add something\n\nCuerpo normal del commit.\n");
    assert.equal(result.code, 0, `no debería rechazar: ${result.stderr}`);
});

test("hooks/commit-msg es ejecutable e install.sh lo activa en el checkout", () => {
    assert.ok(statSync(HOOK).mode & 0o111, "hooks/commit-msg debe ser ejecutable");
    const install = readFileSync(join(ROOT, "install.sh"), "utf8");
    assert.match(install, /link "\$REPO\/hooks\/commit-msg" "\$REPO\/\.git\/hooks\/commit-msg"/, "falta activar el hook en install.sh");
});
