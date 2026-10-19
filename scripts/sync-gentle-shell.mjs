#!/usr/bin/env node
// Sincroniza kairos con la versión instalada de gentle-shell (gentle-pi).
//
// Regenera SOLO lo derivado de gentle-shell, más la capa propia de kairos-auto:
//   config/agents/            subagentes (los generados; se borran los que ya no existan upstream)
//   config/prompts/           orchestrator.md (común + Ponytail)
//   config/gentle-assets/     referencias perezosas del orchestrator (orchestrator*.md, chains/)
//   config/lib/destructive-command-guard.ts
//   licenses/LICENSE-gentle-shell
//   config/skills/gentle-ai, config/skills/rdd-defect-workflow (skills que vienen de gentle-shell)
//
// NO toca: config/themes/, config/tui-plugins/, config/tui.json, config/opencode.json,
//          resto de config/skills/, config/plugins/, config/commands/, node_modules/,
//          package*.json, LEEME.md.
//
// Los archivos generados no llevan rutas de esta máquina: el repo se publica tal cual
// (ver tests/privacy.test.mjs). La raíz de configuración se referencia con
// $OPENCODE_CONFIG_DIR (config/, la exporta el lanzador) en tiempo de ejecución.
//
// Uso:
//   node scripts/sync-gentle-shell.mjs              sincroniza solo si cambió la versión
//   node scripts/sync-gentle-shell.mjs --force      sincroniza siempre
//   node scripts/sync-gentle-shell.mjs --if-changed silencioso si ya está al día (lo usa el launcher)
//   node scripts/sync-gentle-shell.mjs --check      informa si hay cambios pendientes sin escribir nada
//                                                   (0 = al día, 1 = pendiente; el marcador no cambia)
//
// Es transaccional: todo se genera en un directorio temporal y se valida antes de tocar
// kairos. Si algo no cuadra (p. ej. gentle-shell cambió una API que usamos), no escribe nada.

import {
  readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, existsSync, rmSync,
  mkdtempSync, realpathSync,
} from "node:fs";
import { join, basename, dirname, relative } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";

const HOME = homedir();
// Raíz del proyecto = carpeta padre de scripts/ (funciona aunque se invoque por symlink).
const KAIROS = dirname(dirname(fileURLToPath(import.meta.url)));
const MARKER = join(KAIROS, ".gentle-shell-sync.json");
const GS_CURRENT = join(HOME, ".gentle-shell", "current");
const GS_PKG = join(GS_CURRENT, "node_modules", "gentle-pi");
const ASSETS_OUT = join(KAIROS, "config", "gentle-assets");
const MANAGED_SKILLS = ["gentle-ai", "rdd-defect-workflow"];
const BG_POLICY = "Ejecuta tareas en primer plano salvo que el usuario pida lo contrario.";

const argv = new Set(process.argv.slice(2));
const FORCE = argv.has("--force");
const IF_CHANGED = argv.has("--if-changed");
const CHECK = argv.has("--check");

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
if (!FORCE && !CHECK && prev && prev.version === version) {
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
    .replaceAll("{{GENTLE_PI_ASSETS_ROOT}}", "$OPENCODE_CONFIG_DIR/gentle-assets")
    .replaceAll("{{GENTLE_PI_BACKGROUND_POLICY}}", BG_POLICY);

// Este portado corre sobre OpenCode, no sobre Pi. Las instrucciones originales nombran
// herramientas de Pi; esta nota fija las equivalencias para que el agente use las reales.
const RUNTIME_NOTE = [
  "> **Runtime: OpenCode (kairos).** Este prompt viene de gentle-shell (Pi). Equivalencias:",
  "> - **Sección de identidad/harness** (las instrucciones de abajo se refieren a ella y a su línea `Current persona mode:`; en kairos vive aquí, no en un bloque inyectado aparte): `Current persona mode:` = español, variante neutra y profesional con trato directo, según `prompts/reply-language.md`; el perfil activo (`kairos-control` o `kairos-auto`) no cambia el idioma.",
  "> - `subagent_run` / `Agent` / delegación -> herramienta `task` con el `subagent_type` del agente.",
  "> - `ask_user_choice` / preguntas al usuario -> herramienta `question`.",
  "> - `find` -> `glob` (en kairos sí existe); `grep` -> `grep`; `read` -> `read`; `edit` / `write` -> `edit` / `write`; `bash` -> `bash`; `bash_background` -> `bash` en primer plano.",
  "> - `mem_save` / memoria persistente -> herramientas `mem_*` del MCP `engram` (si están disponibles).",
  "> - `codegraph`, `gentle_review`, `web_*`, `source_check`, `fetch_content`: úsalos solo si aparecen en tu lista de herramientas; si no, repórtalo como capacidad no disponible. No hay `gentle_review` ni assess: decide la verificación independiente por la lista de alto riesgo de Task Size.",
  "> - `orchestrator_session_id`, `orchestrator_list`, `subagent_status` y `subagent_result` no existen en OpenCode: usa el título de la sesión, `todo` y `task`; el progreso del todo no se actualiza solo, usa `todowrite`.",
  "> - Las reglas que Pi aplica en runtime (admisión de writers y verifier, `Allowed edit surfaces`, context backstop, señal de commit-slice) no las impone OpenCode: el prompt es la única guía, así que respétalas explícitamente. Aplica el context backstop al pasar el menor de ~150k tokens o el 15% de la ventana del modelo (indicador de contexto de OpenCode).",
  "> - `$OPENCODE_CONFIG_DIR` es la raíz de configuración de kairos (config/, la exporta el lanzador); las rutas de gentle-assets se resuelven como `$OPENCODE_CONFIG_DIR/gentle-assets` (para la ruta absoluta: `echo \"$OPENCODE_CONFIG_DIR\"`).",
  `> - Política de ejecución en segundo plano: ${BG_POLICY}`,
  "",
].join("\n");

// Capa propia de kairos (no viene de gentle-shell): se añade al prompt común de los dos
// perfiles. La disciplina de implementación de Ponytail (MIT) va integrada en el prompt;
// las skills y comandos siguen on-demand para revisión y deuda. La capa no sustituye el
// proceso de kairos: si hay conflicto, mandan ODD, riesgo, revisión y verificación.
const PONYTAIL_LAYER = [
  "",
  "## Implementation Economy (Ponytail, fused)",
  "",
  "Default level: full. If the user explicitly asks for `lite`, `ultra`, or `off` (or says \"normal mode\"), follow that request for the rest of the conversation.",
  "",
  "This layer applies Ponytail's implementation discipline to every code change. It governs how much code you write; it does not replace kairos' process, scope, risk, review, or verification rules. If they conflict, kairos wins.",
  "",
  "Before you write, read the code the change touches and list every place it must reach: callers, tests, fixtures, config, exports. Fix bugs at the root cause in shared code, after checking every caller.",
  "",
  "Take the first option that fully solves the task:",
  "",
  "1. Does it need to exist? Skip features, options, and flexibility nobody asked for.",
  "2. Already in this codebase? Reuse the existing helper, component, service, or pattern the way the surrounding code does.",
  "3. Standard library or platform feature? Use it, unless the project has its own.",
  "4. An installed dependency? Use it; never add a dependency for a few lines.",
  "5. Can it be one line a reader understands at a glance? One line.",
  "6. Otherwise, the minimum code that works.",
  "",
  "No unrequested abstraction, wrapper, option, config, boilerplate, or \"for later\" code. Deletion beats addition. Keep the repository's existing layers, interfaces, and conventions. The shortest working diff wins once you know everything it must touch; a one-liner that needs decoding is not short. Comment only the why the code cannot show, in one line.",
  "",
  "Lazy code without its check is unfinished: new non-trivial logic (a branch, a loop, a parser, money, security, or a whole new script or app) leaves one small test or assert-based self-check. Trivial changes need none. A deliberate shortcut with a known ceiling gets `shortcut: <the ceiling>, <when to upgrade>`; `/ponytail-debt` collects them.",
  "",
  "Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs, or anything the user asked for.",
  "",
  "End every reply with one or two lines: what you skipped or did not check, and any risk the user must know. This is a report, not permission to underbuild.",
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
//    y ambos usan el prompt común con la capa de Ponytail integrada.
{
  const body = templ(readFileSync(join(ASSETS_SRC, "orchestrator.md"), "utf8"));
  writeFileSync(join(stagePrompts, "orchestrator.md"), RUNTIME_NOTE + body + PONYTAIL_LAYER);
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
  "// Copiado de gentle-pi (gentle-shell), licencia MIT. Ver ../../licenses/LICENSE-gentle-shell.\n" + guardText,
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
if (!readFileSync(join(stagePrompts, "orchestrator.md"), "utf8").includes("Implementation Economy (Ponytail, fused)")) {
  problems.push("el prompt común no lleva la capa de Ponytail");
}
if (problems.length) {
  rmSync(STAGE, { recursive: true, force: true });
  fail(`no se sincronizó, nada se modificó:\n  - ${problems.join("\n  - ")}`);
}

// ---------------------------------------------------------------- modo --check (no escribe)
// Informa si un sync real cambiaría algo: compara el staging contra el repo y el marcador
// contra la versión instalada. No escribe ningún archivo ni el marcador.
if (CHECK) {
  const differences = [];
  if (!prev) {
    differences.push("sin marcador de sincronización (.gentle-shell-sync.json)");
  } else if (prev.version !== version) {
    differences.push(
      `versión: ${prev.gentleShell} (gentle-pi ${prev.gentlePi}) -> ${shellVersion} (gentle-pi ${pkg.version})`,
    );
  }

  const walk = (dir) => {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(p));
      else if (entry.isFile()) out.push(p);
    }
    return out;
  };
  // Compara un árbol generado contra su destino. wholesale=true: el sync reemplaza el
  // directorio completo, así que los archivos de más también serían diferencias.
  const compareDir = (stagedDir, targetDir, label, wholesale = false) => {
    const seen = new Set();
    for (const p of walk(stagedDir)) {
      const rel = relative(stagedDir, p);
      seen.add(rel);
      const target = join(targetDir, rel);
      if (!existsSync(target)) differences.push(`${label}/${rel}: falta`);
      else if (!readFileSync(target).equals(readFileSync(p))) differences.push(`${label}/${rel}: difiere`);
    }
    if (wholesale) {
      for (const p of walk(targetDir)) {
        const rel = relative(targetDir, p);
        if (!seen.has(rel)) differences.push(`${label}/${rel}: sobrante (un sync lo borraría)`);
      }
    }
  };
  const compareFile = (stagedFile, targetFile, label) => {
    if (!existsSync(targetFile)) differences.push(`${label}: falta`);
    else if (!readFileSync(targetFile).equals(readFileSync(stagedFile))) differences.push(`${label}: difiere`);
  };

  compareDir(stageAgents, join(KAIROS, "config", "agents"), "config/agents");
  compareDir(stagePrompts, join(KAIROS, "config", "prompts"), "config/prompts");
  compareDir(stageAssets, ASSETS_OUT, "config/gentle-assets", true);
  for (const s of MANAGED_SKILLS) {
    compareDir(join(stageSkills, s), join(KAIROS, "config", "skills", s), `config/skills/${s}`, true);
  }
  compareFile(
    join(STAGE, "destructive-command-guard.ts"),
    join(KAIROS, "config", "lib", "destructive-command-guard.ts"),
    "config/lib/destructive-command-guard.ts",
  );
  compareFile(join(GS_PKG, "LICENSE"), join(KAIROS, "licenses", "LICENSE-gentle-shell"), "licenses/LICENSE-gentle-shell");
  for (const f of prev?.generatedAgents ?? []) {
    if (!generatedAgents.includes(f)) differences.push(`agents/${f}: sobrante (un sync lo borraría)`);
  }
  for (const f of prev?.generatedPrompts ?? []) {
    if (!generatedPrompts.includes(f)) differences.push(`prompts/${f}: sobrante (un sync lo borraría)`);
  }

  rmSync(STAGE, { recursive: true, force: true });
  if (differences.length) {
    console.log(`sync --check: hay cambios pendientes (gentle-shell ${shellVersion}, gentle-pi ${pkg.version}):`);
    for (const d of differences) console.log(`  - ${d}`);
    process.exit(1);
  }
  console.log(`sync --check: al día (gentle-shell ${shellVersion}, gentle-pi ${pkg.version})`);
  process.exit(0);
}

// ---------------------------------------------------------------- aplicar
// Agentes: borrar solo los que generamos antes (no tocar agentes propios del usuario).
for (const f of prev?.generatedAgents ?? []) {
  rmSync(join(KAIROS, "config", "agents", f), { force: true });
}
mkdirSync(join(KAIROS, "config", "agents"), { recursive: true });
for (const f of generatedAgents) {
  cpSync(join(stageAgents, f), join(KAIROS, "config", "agents", f));
}

// Prompts de perfiles: se borran los generados antes y se escriben los nuevos.
for (const f of prev?.generatedPrompts ?? []) {
  rmSync(join(KAIROS, "config", "prompts", f), { force: true });
}
mkdirSync(join(KAIROS, "config", "prompts"), { recursive: true });
for (const f of generatedPrompts) {
  cpSync(join(stagePrompts, f), join(KAIROS, "config", "prompts", f));
}

rmSync(ASSETS_OUT, { recursive: true, force: true });
cpSync(stageAssets, ASSETS_OUT, { recursive: true });

mkdirSync(join(KAIROS, "config", "lib"), { recursive: true });
mkdirSync(join(KAIROS, "licenses"), { recursive: true });
cpSync(join(STAGE, "destructive-command-guard.ts"), join(KAIROS, "config", "lib", "destructive-command-guard.ts"));
cpSync(join(GS_PKG, "LICENSE"), join(KAIROS, "licenses", "LICENSE-gentle-shell"));

for (const s of MANAGED_SKILLS) {
  rmSync(join(KAIROS, "config", "skills", s), { recursive: true, force: true });
  cpSync(join(stageSkills, s), join(KAIROS, "config", "skills", s), { recursive: true });
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
