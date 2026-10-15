#!/usr/bin/env bash
# install.sh — instala o repara opencode-venjix en esta máquina.
#
# Es idempotente: puede ejecutarse varias veces. Nunca borra configuración del
# usuario; si reemplaza un archivo real, lo respalda con sufijo .bak-<fecha>.
#
# Uso:
#   ./install.sh
#
# Variables opcionales:
#   OPENCODE_BIN   ruta al binario de OpenCode (por defecto ~/.opencode/bin/opencode)

set -euo pipefail

REPO="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANON="$HOME/.config/opencode-venjix"
BIN_DIR="$HOME/.local/bin"
OC_THEMES="$HOME/.config/opencode/themes"
OPENCODE_BIN="${OPENCODE_BIN:-$HOME/.opencode/bin/opencode}"
GS_PKG="$HOME/.gentle-shell/current/node_modules/gentle-pi"
STAMP="$(date +%Y%m%d-%H%M%S)"

say()  { printf '\033[36m▸\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# Crea o actualiza un enlace simbólico. Si el destino es un archivo real, lo respalda.
link() {
    local src="$1" dst="$2"
    mkdir -p "$(dirname "$dst")"
    if [[ -e "$dst" && ! -L "$dst" ]]; then
        mv "$dst" "$dst.bak-$STAMP"
        warn "respaldado $dst -> $dst.bak-$STAMP"
    fi
    ln -sfn "$src" "$dst"
    say "enlace $dst -> $src"
}

# 1. Requisitos ---------------------------------------------------------------
command -v node >/dev/null 2>&1 || die "falta Node.js (probado con v26)"
command -v npm  >/dev/null 2>&1 || die "falta npm"
[[ -x "$OPENCODE_BIN" ]] || die "no encuentro OpenCode en $OPENCODE_BIN (instálalo o define OPENCODE_BIN)"
command -v ollama >/dev/null 2>&1 || warn "ollama no está en el PATH: los modelos locales no funcionarán"
[[ -d "$GS_PKG" ]] || warn "gentle-shell no está en ~/.gentle-shell: se omite la sincronización"

# 2. Ubicación canónica -------------------------------------------------------
if [[ "$REPO" != "$CANON" ]]; then
    if [[ -e "$CANON" && ! -L "$CANON" ]]; then
        die "$CANON ya existe y no es un enlace. Clona el repo ahí o muévelo antes de instalar."
    fi
    mkdir -p "$(dirname "$CANON")"
    ln -sfn "$REPO" "$CANON"
    warn "el repo está en $REPO; se creó el enlace $CANON. Lo recomendado es clonar directamente en $CANON."
fi

# 3. Dependencias de plugins (node_modules no se versiona) --------------------
say "instalando dependencias (npm install)"
(cd "$REPO" && npm install --no-audit --no-fund --loglevel=error)

# 4. Lanzador, scripts y tema -------------------------------------------------
chmod +x "$REPO/bin/opencode-venjix" "$REPO/scripts/sync-gentle-shell.mjs"
link "$REPO/bin/opencode-venjix" "$BIN_DIR/opencode-venjix"
link "$REPO/themes/gentleman.json" "$OC_THEMES/gentleman.json"
case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) warn "$BIN_DIR no está en el PATH; añádelo en tu shell para usar 'opencode-venjix'" ;;
esac

# 5. Rutas específicas de esta máquina ----------------------------------------
say "ajustando rutas locales"
REPO_DIR="$REPO" node --input-type=commonjs - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const repo = process.env.REPO_DIR;

function edit(file, mutate) {
    const p = path.join(repo, file);
    const before = fs.readFileSync(p, "utf8");
    const obj = JSON.parse(before);
    mutate(obj);
    const after = JSON.stringify(obj, null, 2) + "\n";
    if (after !== before) {
        fs.writeFileSync(p, after);
        console.log(`  actualizado: ${file}`);
    }
}

edit("tui.json", (o) => {
    o.plugin = (o.plugin || []).map((p) =>
        p.endsWith("tui-plugins/gentle-logo.tsx") ? path.join(repo, "tui-plugins/gentle-logo.tsx") : p,
    );
});
NODE

ENGRAM="$(ls -d "$HOME"/.gentle-shell/runtime/engram-*/engram 2>/dev/null | sort -V | tail -1 || true)"
if [[ -n "$ENGRAM" && -x "$ENGRAM" ]]; then
    ENGRAM_BIN="$ENGRAM" REPO_DIR="$REPO" node --input-type=commonjs - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const file = path.join(process.env.REPO_DIR, "opencode.json");
const before = fs.readFileSync(file, "utf8");
const obj = JSON.parse(before);
const engram = obj.mcp && obj.mcp.engram;
if (engram && Array.isArray(engram.command)) {
    engram.command[0] = process.env.ENGRAM_BIN;
}
const after = JSON.stringify(obj, null, 2) + "\n";
if (after !== before) {
    fs.writeFileSync(file, after);
    console.log("  actualizado: opencode.json (ruta de engram)");
}
NODE
else
    warn "no encuentro engram en ~/.gentle-shell/runtime: la memoria (MCP) no funcionará hasta instalar gentle-shell"
fi

# 6. Sincronización con gentle-shell ------------------------------------------
if [[ -d "$GS_PKG" ]]; then
    say "sincronizando agentes y guardas con gentle-shell"
    node "$REPO/scripts/sync-gentle-shell.mjs" --force
fi

# 7. Verificación -------------------------------------------------------------
say "verificando que OpenCode carga la configuración"
OUT="$(OPENCODE_VENJIX_NO_SYNC=1 "$REPO/bin/opencode-venjix" agent list 2>&1 || true)"
grep -q '^gentle-orchestrator ' <<<"$OUT" || die "OpenCode no carga el agente gentle-orchestrator. Salida:
$OUT"

echo
say "instalación correcta"
echo "  Abre OpenCode con:   opencode-venjix"
echo "  Diagnóstico dentro:  /gentle-doctor"
echo
warn "no uses gentle-sync sobre $CANON: reemplazaría esta instalación."
