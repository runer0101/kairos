#!/usr/bin/env bash
# install.sh — instala kairos y sus dependencias en cualquier Linux glibc
# (x86_64 o arm64), sin depender de apt, dnf, pacman ni zypper.
#
# Instala solo lo que falta:
#   - Node.js 24.21.0   tarball oficial de nodejs.org, verificado con SHA-256, sin root
#   - OpenCode          script oficial: https://opencode.ai/install
#   - engram 3.4.0      binario oficial de GitHub, verificado con SHA-256 (memoria MCP)
#
# No instala Ollama ni descarga modelos. Ollama es opcional: si lo tienes activo,
# kairos detecta sus modelos al abrir (ver scripts/detect-local-models.mjs).
#
# Es idempotente: puedes ejecutarlo varias veces. Nunca borra nada tuyo; si reemplaza
# un archivo real, lo respalda con sufijo .bak-<fecha>.
#
# Uso:
#   ./install.sh [--help]
#   curl -fsSL https://raw.githubusercontent.com/runer0101/kairos/main/install.sh | bash

# Si lo ejecutan con sh/dash, relanzar con bash (el script usa sintaxis de bash).
if [ -z "${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi
set -euo pipefail

# ---------------------------------------------------------------- versiones fijadas
NODE_VERSION="24.21.0"
NODE_SHA256_x64="6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff"
NODE_SHA256_arm64="724282c3b43aec998aa9527380465b45d229e021b58035f5f4f63095eabfe5d5"
ENGRAM_VERSION="3.4.0"
ENGRAM_SHA256_x64="715fda625556e46d65ddb4526bb7f88a3fee5339ca3c44ce44cc652f17fa57f1"
ENGRAM_SHA256_arm64="3309e9c0bbb539d183fd5aa9f9a13cd7aa0e81ec2512b5bedefb8b2bdd35b3e5"
# pnpm: binario standalone oficial (release de GitHub). Verificado con SHA-256 y con la
# atestación de procedencia de GitHub (gh attestation verify ... -R pnpm/pnpm).
PNPM_VERSION="11.22.0"
PNPM_SHA256_x64="4c592fa410eb23b69691a9efb9bf21c87c15b3e9d88c6ec8acdd354a0eb8de71"
PNPM_SHA256_arm64="f1426231f365bdfd46c15fa3d1211c3936ee2c4e557afd304f6c66dbf1b2a8bf"

# ---------------------------------------------------------------- rutas
# Raíz del repo si el script corre desde un checkout; vacío si llega por tubería (curl | bash).
SELF="${BASH_SOURCE[0]:-}"
if [[ -n "$SELF" && -f "$SELF" ]]; then
    REPO="$(cd -P "$(dirname "$SELF")" && pwd)"
else
    REPO=""
fi
CANON="$HOME/.config/kairos"
BIN_DIR="$HOME/.local/bin"
SHARE_DIR="$HOME/.local/share/kairos"
OC_THEMES="$HOME/.config/opencode/themes"
OPENCODE_BIN="${OPENCODE_BIN:-$HOME/.opencode/bin/opencode}"
GS_PKG="$HOME/.gentle-shell/current/node_modules/gentle-pi"
STAMP="$(date +%Y%m%d-%H%M%S)"

ARCH=""
ENGRAM_PATH=""

# ---------------------------------------------------------------- salida
say()  { printf '\033[36m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
    cat <<'TXT'
install.sh — instala kairos en Linux (x86_64 o arm64).

Uso:
  ./install.sh [--help]

También puedes instalarlo sin clonar antes (el instalador clona el repo solo):
  curl -fsSL https://raw.githubusercontent.com/runer0101/kairos/main/install.sh | bash

Instala Node.js, OpenCode y engram si faltan, y configura el repositorio.
No instala Ollama ni modelos: si tienes Ollama activo, se detecta al abrir.
TXT
}

have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------- utilidades
fetch() { # fetch URL DESTINO
    if have curl; then
        curl -fL --retry 3 --connect-timeout 20 -o "$2" "$1"
    else
        wget -q -O "$2" "$1"
    fi
}

verify_sha256() { # verify_sha256 ARCHIVO HASH_ESPERADO
    printf '%s  %s\n' "$2" "$1" | sha256sum -c --status \
        || die "el SHA-256 de $(basename "$1") no coincide: descarga abortada por seguridad"
}

# Enlace simbólico; si el destino es un archivo real, se respalda antes.
link() { # link ORIGEN DESTINO
    local src="$1" dst="$2"
    mkdir -p "$(dirname "$dst")"
    if [[ -e "$dst" && ! -L "$dst" ]]; then
        mv "$dst" "$dst.bak-$STAMP"
        warn "respaldado $dst -> $dst.bak-$STAMP"
    fi
    ln -sfn "$src" "$dst"
}

# Bootstrap para `curl ... | bash`: si no hay checkout, clona el repo en la ubicación
# canónica y continúa la instalación desde ahí (re-ejecuta este mismo script).
ensure_checkout() {
    if [[ -n "$REPO" && -f "$REPO/package.json" && -f "$REPO/opencode.json" ]]; then
        return
    fi
    say "instalador fuera de un checkout: preparando $CANON"
    have git || die "git es necesario para clonar el repositorio (instálalo con el gestor de tu distribución)"
    if [[ -e "$CANON" && ! -d "$CANON/.git" ]]; then
        die "$CANON ya existe y no es un repositorio git; muévelo o bórralo y reintenta"
    fi
    if [[ ! -d "$CANON/.git" ]]; then
        say "clonando https://github.com/runer0101/kairos.git"
        git clone --depth 1 https://github.com/runer0101/kairos.git "$CANON" \
            || die "no se pudo clonar el repositorio"
    else
        ok "ya hay un checkout en $CANON"
        git -C "$CANON" pull --ff-only >/dev/null 2>&1 || warn "no se pudo actualizar el checkout; continúo con la versión instalada"
    fi
    exec "$CANON/install.sh" "$@"
}

# ---------------------------------------------------------------- 1. requisitos
preflight() {
    say "comprobando el sistema"
    [[ "$(uname -s)" == "Linux" ]] || die "este instalador es para Linux (detectado: $(uname -s))"

    case "$(uname -m)" in
        x86_64|amd64)  ARCH="x64" ;;
        aarch64|arm64) ARCH="arm64" ;;
        *)             ARCH="" ;;
    esac

    if ldd --version 2>&1 | grep -qi musl; then
        die "sistema musl (p. ej. Alpine) no soportado: Node.js, OpenCode y engram requieren glibc"
    fi

    local missing=()
    for tool in tar gzip sha256sum grep; do
        have "$tool" || missing+=("$tool")
    done
    have curl || have wget || missing+=("curl (o wget)")
    if ((${#missing[@]})); then
        die "faltan herramientas básicas: ${missing[*]}. Instálalas con el gestor de paquetes de tu distro, p. ej.: sudo apt install curl tar gzip  |  sudo dnf install curl tar gzip  |  sudo pacman -S curl tar gzip"
    fi

    if ! have git; then
        warn "git no está instalado: no hace falta para instalar, pero sí para clonar y actualizar el repo"
    fi
    ok "sistema: Linux $(uname -m)"
}

# ---------------------------------------------------------------- 2. Node.js
ensure_node() {
    if have node && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
        ok "Node.js $(node -v) ya instalado"
        return
    fi
    [[ -n "$ARCH" ]] || die "no hay Node.js oficial para esta arquitectura ($(uname -m)); instala Node.js 20 o superior y vuelve a ejecutar"

    local name="node-v$NODE_VERSION-linux-$ARCH"
    local dir="$SHARE_DIR/$name"
    local sha_var="NODE_SHA256_$ARCH"
    if [[ ! -x "$dir/bin/node" ]]; then
        local tmp
        tmp="$(mktemp -d)"
        say "descargando Node.js $NODE_VERSION ($ARCH) desde nodejs.org"
        fetch "https://nodejs.org/dist/v$NODE_VERSION/$name.tar.gz" "$tmp/node.tar.gz"
        verify_sha256 "$tmp/node.tar.gz" "${!sha_var}"
        mkdir -p "$SHARE_DIR"
        tar -xzf "$tmp/node.tar.gz" -C "$SHARE_DIR"
        rm -rf "$tmp"
    fi
    export PATH="$dir/bin:$PATH"
    link "$dir/bin/node" "$BIN_DIR/node"
    link "$dir/bin/npm"  "$BIN_DIR/npm"
    link "$dir/bin/npx"  "$BIN_DIR/npx"
    ok "Node.js $NODE_VERSION instalado en $dir"
}

# ---------------------------------------------------------------- 2b. pnpm
# Usa el pnpm del sistema solo si es exactamente la versión fijada (package.json declara
# packageManager; otra versión intenta autoinstalarse y puede fallar). Si no, instala la
# fijada en su propia carpeta, sin tocar el pnpm global del usuario.
ensure_pnpm() {
    local v=""
    if have pnpm; then v="$(pnpm --version 2>/dev/null || true)"; fi
    if [[ "$v" == "$PNPM_VERSION" ]]; then
        PNPM_BIN="$(command -v pnpm)"
        ok "pnpm $v ya instalado"
        return
    fi
    [[ -n "$ARCH" ]] || die "no hay pnpm oficial para esta arquitectura ($(uname -m))"

    local name="pnpm-linux-$ARCH"
    local dir="$SHARE_DIR/pnpm-$PNPM_VERSION-$name"
    local sha_var="PNPM_SHA256_$ARCH"
    if [[ ! -x "$dir/pnpm" ]]; then
        local tmp
        tmp="$(mktemp -d)"
        say "descargando pnpm $PNPM_VERSION ($ARCH) desde GitHub"
        fetch "https://github.com/pnpm/pnpm/releases/download/v$PNPM_VERSION/$name.tar.gz" "$tmp/pnpm.tar.gz"
        verify_sha256 "$tmp/pnpm.tar.gz" "${!sha_var}"
        mkdir -p "$dir"
        tar -xzf "$tmp/pnpm.tar.gz" -C "$dir"
        rm -rf "$tmp"
    fi
    PNPM_BIN="$dir/pnpm"
    ok "pnpm $PNPM_VERSION instalado en $dir"
}

# ---------------------------------------------------------------- 3. OpenCode
ensure_opencode() {
    if [[ -x "$OPENCODE_BIN" ]]; then
        ok "OpenCode: $("$OPENCODE_BIN" --version 2>/dev/null | tail -1)"
        return
    fi
    if have opencode; then
        OPENCODE_BIN="$(command -v opencode)"
        ok "OpenCode encontrado en PATH: $OPENCODE_BIN"
        return
    fi

    say "instalando OpenCode (script oficial de opencode.ai)"
    if have curl; then
        curl -fsSL https://opencode.ai/install | bash
    else
        wget -qO- https://opencode.ai/install | bash
    fi

    if [[ ! -x "$OPENCODE_BIN" ]] && have opencode; then
        OPENCODE_BIN="$(command -v opencode)"
    fi
    [[ -x "$OPENCODE_BIN" ]] || die "OpenCode no quedó instalado en $OPENCODE_BIN"
    ok "OpenCode instalado: $("$OPENCODE_BIN" --version 2>/dev/null | tail -1)"
}

# ---------------------------------------------------------------- 4. engram
ensure_engram() {
    local matches=()
    shopt -s nullglob
    matches=("$HOME"/.gentle-shell/runtime/engram-*/engram)
    shopt -u nullglob
    if ((${#matches[@]})); then
        ENGRAM_PATH="$(printf '%s\n' "${matches[@]}" | sort -V | tail -1)"
    elif have engram; then
        ENGRAM_PATH="$(command -v engram)"
    fi

    if [[ -z "$ENGRAM_PATH" ]]; then
        if [[ -z "$ARCH" ]]; then
            warn "engram no tiene binario para esta arquitectura: la memoria (MCP) quedará desactivada"
            return
        fi
        local suffix sha_var="ENGRAM_SHA256_$ARCH"
        if [[ "$ARCH" == "x64" ]]; then suffix="linux_amd64"; else suffix="linux_arm64"; fi
        local tmp
        tmp="$(mktemp -d)"
        say "descargando engram $ENGRAM_VERSION ($ARCH) desde GitHub"
        fetch "https://github.com/Gentleman-Programming/engram/releases/download/v$ENGRAM_VERSION/engram_${ENGRAM_VERSION}_${suffix}.tar.gz" "$tmp/engram.tar.gz"
        verify_sha256 "$tmp/engram.tar.gz" "${!sha_var}"
        tar -xzf "$tmp/engram.tar.gz" -C "$tmp" engram
        mkdir -p "$BIN_DIR"
        cp "$tmp/engram" "$BIN_DIR/engram"
        chmod 0755 "$BIN_DIR/engram"
        rm -rf "$tmp"
        ENGRAM_PATH="$BIN_DIR/engram"
    fi
    ok "engram: $ENGRAM_PATH"
}

# ---------------------------------------------------------------- 5. ubicación
canonical_location() {
    if [[ "$REPO" == "$CANON" ]]; then
        ok "repo en la ubicación canónica $CANON"
        return
    fi
    if [[ -e "$CANON" && ! -L "$CANON" ]]; then
        die "$CANON ya existe y no es un enlace. Clona el repo ahí o muévelo antes de instalar."
    fi
    mkdir -p "$(dirname "$CANON")"
    ln -sfn "$REPO" "$CANON"
    warn "el repo está en $REPO; se creó el enlace $CANON (lo recomendado es clonar directamente en $CANON)"
}

# ---------------------------------------------------------------- 6. repo
setup_repo() {
    say "instalando dependencias con pnpm (lockfile congelado)"
    (cd "$REPO" && "$PNPM_BIN" install --frozen-lockfile --config.confirmModulesPurge=false)

    chmod +x "$REPO/bin/kairos" "$REPO/scripts/sync-gentle-shell.mjs" "$REPO/scripts/detect-local-models.mjs" "$REPO/hooks/commit-msg"
    link "$REPO/bin/kairos" "$BIN_DIR/kairos"
    link "$REPO/bin/kairos" "$BIN_DIR/kai"
    link "$REPO/bin/kairos" "$BIN_DIR/ks"
    # El hook commit-msg rechaza los commits con co-autor: la historia publicada no los lleva.
    if [[ -d "$REPO/.git" ]]; then
        link "$REPO/hooks/commit-msg" "$REPO/.git/hooks/commit-msg"
    fi
    # Retira enlaces rotos que apuntaban a temas de este repo y ya no existen (p. ej. tras un renombrado).
    for stale in "$OC_THEMES"/*.json; do
        [[ -L "$stale" && ! -e "$stale" ]] || continue
        case "$(readlink "$stale")" in
            "$REPO"/themes/*) rm -f "$stale" ;;
        esac
    done
    for theme_file in "$REPO"/themes/*.json; do
        link "$theme_file" "$OC_THEMES/$(basename "$theme_file")"
    done

    say "ajustando rutas locales de esta máquina (solo si hace falta)"
    OVJ_REPO="$REPO" OVJ_HOME="$HOME" OVJ_ENGRAM="$ENGRAM_PATH" node --input-type=commonjs - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const repo = process.env.OVJ_REPO;
const home = process.env.OVJ_HOME;
const engram = process.env.OVJ_ENGRAM;

function editJson(file, mutate) {
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

// Las rutas dentro de $HOME se escriben como {env:HOME}/...: el runtime las expande y el
// repo queda sin datos de esta máquina (lo vigila tests/privacy.test.mjs).
const portable = (p) => (p.startsWith(home + "/") ? "{env:HOME}" + p.slice(home.length) : p);

if (engram) {
    editJson("opencode.json", (o) => {
        const cmd = o.mcp && o.mcp.engram && o.mcp.engram.command;
        if (!Array.isArray(cmd)) return;
        if (cmd[0] === portable(engram)) return;
        cmd[0] = portable(engram);
        if (!cmd[0].startsWith("{env:HOME}")) {
            console.log("  aviso: engram está fuera de $HOME; esa ruta no debería commitearse");
        }
    });
}
NODE

    ok "launcher: $BIN_DIR/kairos (alias cortos: kai, ks)"
    ok "temas: $OC_THEMES"
    ok "hook commit-msg: rechaza co-autores"
    case ":$PATH:" in
        *":$BIN_DIR:"*) ;;
        *) warn "$BIN_DIR no está en tu PATH: añade 'export PATH=\"\$HOME/.local/bin:\$PATH\"' a tu shell" ;;
    esac
}

# ---------------------------------------------------------------- 7. gentle-shell (opcional)
sync_gentle_shell() {
    if [[ -d "$GS_PKG" ]]; then
        say "sincronizando agentes con gentle-shell instalado"
        node "$REPO/scripts/sync-gentle-shell.mjs" --force
    else
        ok "gentle-shell no está instalado: se usan los agentes incluidos en el repo"
    fi
}

# ---------------------------------------------------------------- 8. verificación
verify() {
    say "verificando que OpenCode carga la configuración"
    # La salida se escribe a un archivo, no a una tubería: con una tubería, OpenCode puede
    # cerrarse antes de vaciar stdout y la lista llega truncada (falsos negativos).
    local listing perfil
    listing="$(mktemp)"
    KAIROS_NO_SYNC=1 OPENCODE_BIN="$OPENCODE_BIN" "$REPO/bin/kairos" agent list >"$listing" 2>&1 || true
    for perfil in kairos-control kairos-auto; do
        if ! grep -q "^$perfil (primary)" "$listing"; then
            tail -20 "$listing" >&2
            rm -f "$listing"
            die "OpenCode no carga el perfil $perfil (últimas líneas arriba)"
        fi
    done
    rm -f "$listing"
    ok "configuración válida: agentes, comandos, plugin y tema"
}

# ---------------------------------------------------------------- main
main() {
    case "${1:-}" in
        "") ;;
        --help|-h) usage; exit 0 ;;
        *) die "opción desconocida: $1 (usa --help)" ;;
    esac

    ensure_checkout "$@"
    preflight
    ensure_node
    ensure_pnpm
    ensure_opencode
    ensure_engram
    canonical_location
    setup_repo
    sync_gentle_shell
    verify

    echo
    ok "instalación completa"
    echo "  Abre OpenCode con:    kairos"
    echo "  Diagnóstico dentro:   /gentle-doctor"
    echo "  Modelos locales:      opcional; instala Ollama y descarga modelos, kairos los detecta"
    echo
    warn "no uses gentle-sync sobre $CANON: reemplazaría esta instalación"
}

main "$@"
