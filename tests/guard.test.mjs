// Pruebas de la guarda de comandos destructivos (copia de gentle-pi).
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { recognizeDestructiveCommands } = await import(join(ROOT, "config", "lib", "destructive-command-guard.ts"));

const blocked = (cmd) => recognizeDestructiveCommands(cmd).length > 0;

test("bloquea borrado recursivo de la raíz", () => {
    assert.ok(blocked("rm -rf /"));
});

test("bloquea force-push", () => {
    assert.ok(blocked("git push --force origin main"));
});

test("bloquea sentencias SQL destructivas", () => {
    assert.ok(blocked('psql -c "DROP TABLE users;"'));
});

test("deja pasar comandos de lectura habituales", () => {
    assert.equal(blocked("ls -la"), false);
    assert.equal(blocked("git status"), false);
});

test("no confunde texto citado con un comando", () => {
    assert.equal(blocked("echo 'DROP TABLE users' > notas.txt"), false);
});
