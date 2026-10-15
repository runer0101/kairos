#!/usr/bin/env node
// Sincroniza opencode-venjix con la versión instalada de gentle-shell (gentle-pi).
//
// Regenera SOLO lo derivado de gentle-shell:
//   agents/            orchestrator + subagentes (los generados; se borran los que ya no existan upstream)
//   gentle-assets/     referencias perezosas del orchestrator (orchestrator*.md, chains/)
//   lib/destructive-command-guard.ts
//   LICENSE-gentle-shell
//   skills/gentle-ai, skills/rdd-defect-workflow (skills que vienen de gentle-shell)
//
// NO toca: themes/, tui-plugins/, tui.json, opencode.json, resto de skills/, plugins/,
//          commands/, node_modules/, package*.json, LEEME.md.
//
// Uso:
//   node scripts/sync-gentle-shell.mjs              sincroniza solo si cambió la versión
//   node scripts/sync-gentle-shell.mjs --force      sincroniza siempre
//   node scripts/sync-gentle-shell.mjs --if-changed silencioso si ya está al día (lo usa el launcher)
//
// Es transaccional: todo se genera en un directorio temporal y se valida antes de tocar
// opencode-venjix. Si algo no cuadra (p. ej. gentle-shell cambió una API que usamos), no escribe nada.

import {
  readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, existsSync, rmSync,
  mkdtempSync, realpathSync,
} from "node:fs";
import { join, basename, dirname } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";

const HOME = homedir();
// Raíz del proyecto = carpeta padre de scripts/ (funciona aunque se invoque por symlink).
const VENJIX = dirname(dirname(fileURLToPath(import.meta.url)));
const MARKER = join(VENJIX, ".gentle-shell-sync.json");
const GS_CURRENT = join(HOME, ".gentle-shell", "current");
const GS_PKG = join(GS_CURRENT, "node_modules", "gentle-pi");
const ASSETS_OUT = join(VENJIX, "gentle-assets");
const MANAGED_SKILLS = ["gentle-ai", "rdd-defect-workflow"];
const BG_POLICY = "Ejecuta tareas en primer plano salvo que el usuario pida lo contrario.";

const argv = new Set(process.argv.slice(2));
const FORCE = argv.has("--force");
const IF_CHANGED = argv.has("--if-changed");

const fail = (msg) => {
  console.error(`sync-gentle-shell: ${msg}`);
  process.exit(1);
};

if (!existsSync(join(GS_PKG, "package.json"))) {
  fail(`no encuentro gentle-shell en ${GS_CURRENT}. ¿Está instalado?`);
}

const pkg = JSON.parse(readFileSync(join(GS_PKG, "package.json"), "utf8"));
const shellVersion = basename(realpathSync(GS_CURRENT)); // p. ej. 4.2.0-1.2.0
const version = `${pkg.version}|${shellVersion}`;

const prev = existsSync(MARKER) ? JSON.parse(readFileSync(MARKER, "utf8")) : null;
if (!FORCE && prev && prev.version === version) {
  if (!IF_CHANGED) console.log(`ya sincronizado: gentle-shell ${shellVersion} (gentle-pi ${pkg.version})`);
  process.exit(0);
}

// ---------------------------------------------------------------- generación en staging
const STAGE = mkdtempSync(join(tmpdir(), "ovj-sync-"));
const stageAgents = join(STAGE, "agents");
const stageAssets = join(STAGE, "gentle-assets");
const stageSkills = join(STAGE, "skills");
const stagePrompts = join(STAGE, "prompts");
mkdirSync(stageAgents);
mkdirSync(stageAssets);
mkdirSync(stageSkills);
mkdirSync(stagePrompts);

const templ = (text) =>
  text
    .replaceAll("{{GENTLE_PI_ASSETS_ROOT}}", ASSETS_OUT)
    .replaceAll("{{GENTLE_PI_BACKGROUND_POLICY}}", BG_POLICY);

// Este portado corre sobre OpenCode, no sobre Pi. Las instrucciones originales nombran
// herramientas de Pi; esta nota fija las equivalencias para que el agente use las reales.
const RUNTIME_NOTE = [
  "> **Runtime: OpenCode (opencode-venjix).** Este prompt viene de gentle-shell (Pi). Equivalencias:",
  "> - `subagent_run` / `Agent` / delegación -> herramienta `task` con el `subagent_type` del agente.",
  "> - `ask_user_choice` / preguntas al usuario -> herramienta `question`.",
  "> - `find` -> `glob`; `grep` -> `grep`; `read` -> `read`; `edit` / `write` -> `edit` / `write`; `bash` -> `bash`.",
  "> - `mem_save` / memoria persistente -> herramientas `mem_*` del MCP `engram` (si están disponibles).",
  "> - `codegraph`, `gentle_review`, `web_*`, `source_check`, `fetch_content`: úsalos solo si aparecen en tu lista de herramientas; si no, repórtalo como capacidad no disponible.",
  `> - Política de ejecución en segundo plano: ${BG_POLICY}`,
  "",
].join("\n");

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  let key = null;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      meta[key] = kv[2].trim() === "" ? [] : kv[2].trim();
    } else if (key && /^\s+-\s+/.test(line)) {
      if (!Array.isArray(meta[key])) meta[key] = [];
      meta[key].push(line.replace(/^\s+-\s+/, "").trim());
    }
  }
  return { meta, body: m[2] };
}

const yamlStr = (s) => JSON.stringify(String(s));
const generatedAgents = [];
const generatedPrompts = [];

// 1) Referencias perezosas del orchestrator
const ASSETS_SRC = join(GS_PKG, "assets");
for (const f of readdirSync(ASSETS_SRC)) {
  if (/^orchestrator.*\.md$/.test(f)) {
    writeFileSync(join(stageAssets, f), templ(readFileSync(join(ASSETS_SRC, f), "utf8")));
  }
}
if (existsSync(join(ASSETS_SRC, "chains"))) {
  cpSync(join(ASSETS_SRC, "chains"), join(stageAssets, "chains"), { recursive: true });
}

// 2) Prompt del orchestrator. No es un agente por sí mismo: opencode.json define los perfiles
//    (venjix, venjix-deep, venjix-yolo) y todos reutilizan este prompt con {file:./prompts/orchestrator.md}.
{
  const body = templ(readFileSync(join(ASSETS_SRC, "orchestrator.md"), "utf8"));
  writeFileSync(join(stagePrompts, "orchestrator.md"), RUNTIME_NOTE + body);
  generatedPrompts.push("orchestrator.md");
}

// 3) Subagentes: permisos derivados de la lista "tools" original de Pi
const agentsSrc = join(ASSETS_SRC, "agents");
const sourceAgents = readdirSync(agentsSrc).filter((x) => x.endsWith(".md"));
for (const f of sourceAgents) {
  const { meta, body } = parseFrontmatter(readFileSync(join(agentsSrc, f), "utf8"));
  const name = meta.name || basename(f, ".md");
  const tools = Array.isArray(meta.tools) ? meta.tools : [];
  const canWrite = tools.some((t) => t === "write" || t === "edit");
  const canBash = tools.includes("bash");
  const canWeb = tools.some((t) => /^(web_|source_check|fetch_content|get_search_content)/.test(t));
  const out = [
    "---",
    `description: ${yamlStr(meta.description || name)}`,
    "mode: subagent",
    "permission:",
    `  edit: ${canWrite ? "allow" : "deny"}`,
    `  bash: ${canBash ? "allow" : "deny"}`,
    `  webfetch: ${canWeb ? "allow" : "deny"}`,
    "---",
    "",
    RUNTIME_NOTE + body.trim(),
    "",
  ].join("\n");
  writeFileSync(join(stageAgents, `${name}.md`), out);
  generatedAgents.push(`${name}.md`);
}

// 4) Guarda de comandos destructivos (la usa plugins/gentle-shell.ts)
const guardSrc = join(GS_PKG, "lib", "destructive-command-guard.ts");
const guardText = readFileSync(guardSrc, "utf8");
writeFileSync(
  join(STAGE, "destructive-command-guard.ts"),
  "// Copiado de gentle-pi (gentle-shell), licencia MIT. Ver ../LICENSE-gentle-shell.\n" + guardText,
);

// 5) Skills de gentle-shell que se refrescan
for (const s of MANAGED_SKILLS) {
  const src = join(GS_PKG, "skills", s);
  if (!existsSync(src)) fail(`gentle-shell ya no trae la skill "${s}"; revisar antes de sincronizar`);
  cpSync(src, join(stageSkills, s), { recursive: true });
}

// ---------------------------------------------------------------- validación (antes de tocar nada)
const problems = [];
if (!/export function recognizeDestructiveCommands\(/.test(guardText)) {
  problems.push("la guarda ya no exporta recognizeDestructiveCommands (plugins/gentle-shell.ts dejaría de compilar)");
}
if (generatedAgents.length !== sourceAgents.length) {
  problems.push(`número de agentes inesperado (${generatedAgents.length})`);
}
for (const dir of [stageAgents, stagePrompts, stageAssets]) {
  for (const f of readdirSync(dir, { recursive: true })) {
    const p = join(dir, String(f));
    if (!p.endsWith(".md")) continue;
    if (readFileSync(p, "utf8").includes("{{")) problems.push(`placeholder sin resolver en ${p}`);
  }
}
if (!readFileSync(join(stagePrompts, "orchestrator.md"), "utf8").includes("Runtime: OpenCode")) {
  problems.push("el orchestrator no lleva la nota de runtime");
}
if (problems.length) {
  rmSync(STAGE, { recursive: true, force: true });
  fail(`no se sincronizó, nada se modificó:\n  - ${problems.join("\n  - ")}`);
}

// ---------------------------------------------------------------- aplicar
// Agentes: borrar solo los que generamos antes (no tocar agentes propios del usuario).
for (const f of prev?.generatedAgents ?? []) {
  rmSync(join(VENJIX, "agents", f), { force: true });
}
mkdirSync(join(VENJIX, "agents"), { recursive: true });
for (const f of generatedAgents) {
  cpSync(join(stageAgents, f), join(VENJIX, "agents", f));
}

// Prompts de perfiles: se borran los generados antes y se escriben los nuevos.
for (const f of prev?.generatedPrompts ?? []) {
  rmSync(join(VENJIX, "prompts", f), { force: true });
}
mkdirSync(join(VENJIX, "prompts"), { recursive: true });
for (const f of generatedPrompts) {
  cpSync(join(stagePrompts, f), join(VENJIX, "prompts", f));
}

rmSync(ASSETS_OUT, { recursive: true, force: true });
cpSync(stageAssets, ASSETS_OUT, { recursive: true });

mkdirSync(join(VENJIX, "lib"), { recursive: true });
cpSync(join(STAGE, "destructive-command-guard.ts"), join(VENJIX, "lib", "destructive-command-guard.ts"));
cpSync(join(GS_PKG, "LICENSE"), join(VENJIX, "LICENSE-gentle-shell"));

for (const s of MANAGED_SKILLS) {
  rmSync(join(VENJIX, "skills", s), { recursive: true, force: true });
  cpSync(join(stageSkills, s), join(VENJIX, "skills", s), { recursive: true });
}

writeFileSync(
  MARKER,
  JSON.stringify(
    {
      version,
      gentlePi: pkg.version,
      gentleShell: shellVersion,
      syncedAt: new Date().toISOString(),
      generatedAgents,
      generatedPrompts,
    },
    null,
    2,
  ) + "\n",
);

rmSync(STAGE, { recursive: true, force: true });

const from = prev ? `${prev.gentleShell} (gentle-pi ${prev.gentlePi})` : "primera sincronización";
console.log(
  `gentle-shell sincronizado: ${from} -> ${shellVersion} (gentle-pi ${pkg.version}); ` +
    `agentes: ${generatedAgents.length}, skills: ${MANAGED_SKILLS.length}`,
);
