// Pruebas del lector ODD compartido (tui-plugins/odd-tasks.ts): la fuente de la
// tarea activa que usan el HUD y la vista de agentes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const helperSrc = readFileSync(join(ROOT, "tui-plugins", "odd-tasks.ts"), "utf8");
const hudSrc = readFileSync(join(ROOT, "tui-plugins", "kairos-hud.tsx"), "utf8");
const viewSrc = readFileSync(join(ROOT, "tui-plugins", "kairos-agents.tsx"), "utf8");

const { readOddTasks } = await import(join(ROOT, "tui-plugins", "odd-tasks.ts"));

const worktreeWith = (files) => {
  const dir = mkdtempSync(join(tmpdir(), "kairos-odd-"));
  mkdirSync(join(dir, "odd", "tasks"), { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, "odd", "tasks", name), content);
  return dir;
};

test("cuenta checkboxes y extrae los pendientes", () => {
  const dir = worktreeWith({
    "task-a.md": "# A\n- [x] hecho\n- [ ] pendiente uno\n* [X] otro hecho\n- [ ] pendiente dos\n",
  });
  try {
    const tasks = readOddTasks(dir);
    assert.equal(tasks.length, 1, "una tarea con checkboxes");
    assert.equal(tasks[0].name, "task-a", "nombre sin extensión");
    assert.equal(tasks[0].total, 4, "todos los checkboxes cuentan");
    assert.equal(tasks[0].done, 2, "marcados con x o X");
    assert.deepEqual(tasks[0].pending, ["pendiente uno", "pendiente dos"], "pendientes sin marcar, en orden");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ignora la plantilla, los archivos que no son .md y las tareas sin checkboxes", () => {
  const dir = worktreeWith({
    "TEMPLATE.md": "- [ ] no es una tarea\n",
    "notas.txt": "- [ ] tampoco\n",
    "sin-cajas.md": "texto sin checklist\n",
  });
  try {
    assert.deepEqual(readOddTasks(dir), [], "nada de eso es una tarea");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ordena por fecha de modificación: la tarea más reciente primero", () => {
  const dir = worktreeWith({ "vieja.md": "- [ ] a\n", "nueva.md": "- [ ] b\n" });
  try {
    utimesSync(join(dir, "odd", "tasks", "vieja.md"), new Date(1000), new Date(1000));
    utimesSync(join(dir, "odd", "tasks", "nueva.md"), new Date(2000), new Date(2000));
    assert.deepEqual(
      readOddTasks(dir).map((task) => task.name),
      ["nueva", "vieja"],
      "la más reciente encabeza",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("un cambio real en el archivo se refleja en la siguiente lectura", () => {
  const dir = worktreeWith({ "task.md": "- [ ] uno\n" });
  try {
    assert.equal(readOddTasks(dir)[0].total, 1, "lectura inicial");
    writeFileSync(join(dir, "odd", "tasks", "task.md"), "- [ ] uno\n- [x] dos\n");
    const updated = readOddTasks(dir)[0];
    assert.equal(updated.total, 2, "el tamaño cambió: se relee");
    assert.equal(updated.done, 1, "marcado actualizado");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sin odd/tasks devuelve lista vacía", () => {
  const dir = mkdtempSync(join(tmpdir(), "kairos-odd-"));
  try {
    assert.deepEqual(readOddTasks(dir), [], "tolerante a proyectos sin ODD");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("el lector vive en su módulo y lee odd/tasks del worktree", () => {
  assert.match(helperSrc, /export const readOddTasks/, "exporta el lector");
  assert.match(helperSrc, /join\(worktree, "odd", "tasks"\)/, "lee odd/tasks del worktree");
  assert.match(helperSrc, /name !== "TEMPLATE\.md"/, "TEMPLATE.md no es una tarea");
  assert.match(helperSrc, /\.endsWith\("\.md"\)/, "solo mira archivos .md");
  assert.match(helperSrc, /\\\[\( \|x\|X\)\\\]/, "reconoce checkboxes marcados y sin marcar");
  assert.match(helperSrc, /\.map\(\(box\) => box\[2\]\.trim\(\)\)/, "guarda el texto del pendiente");
  assert.match(helperSrc, /stat\.mtimeMs \+ stat\.size/, "caché por mtime+tamaño");
  assert.match(helperSrc, /catch \{\s*return \[\]/, "sin odd/tasks devuelve lista vacía");
});

test("el HUD y la vista usan el lector compartido, sin copias locales", () => {
  assert.match(hudSrc, /import \{ readOddTasks \} from "\.\/odd-tasks"/, "el HUD lo importa");
  assert.match(viewSrc, /import \{ readOddTasks \} from "\.\/odd-tasks"/, "la vista lo importa");
  assert.ok(!/const readOddTasks = /.test(hudSrc), "el HUD no tiene copia local");
  assert.ok(!/const readOddTasks = /.test(viewSrc), "la vista no tiene copia local");
});

test("sin rutas de la máquina en los archivos versionados", () => {
  for (const source of [helperSrc, hudSrc, viewSrc]) {
    assert.ok(!/\/(?:home|Users)\/[A-Za-z0-9._-]+\//.test(source), "sin rutas absolutas del usuario");
  }
});
