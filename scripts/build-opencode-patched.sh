#!/usr/bin/env bash
# Construye el binario de OpenCode con el panel izquierdo de kairos (parche
# propio, ver docs/ARCHITECTURE.md) y lo instala fuera del repositorio.
#
# Uso:
#   scripts/build-opencode-patched.sh [version] [destino]
#
#   version  tag de OpenCode a construir (por defecto v1.18.35, la del stack)
#   destino  carpeta de instalación (por defecto ~/.local/share/kairos/opencode-patched)
#
# Requiere: curl, tar, patch y bun (https://bun.sh). El destino por defecto es
# el que usa bin/kairos si no se define OPENCODE_BIN.
#
# Variables:
#   BUN                     ruta a bun (si no está en PATH ni en ~/.bun/bin)
#   KAIROS_BUILD_DIR        carpeta para el árbol temporal (por defecto ~/.cache)
#   KAIROS_KEEP_BUILD=1     conserva el árbol temporal al terminar (diagnóstico)
set -euo pipefail

VERSION="${1:-v1.18.35}"
DEST="${2:-$HOME/.local/share/kairos/opencode-patched}"
ROOT="$(cd -P "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
PATCH_FILE="$ROOT/scripts/patches/opencode-left-panel.patch"

for tool in curl tar patch; do
    command -v "$tool" >/dev/null 2>&1 || { echo "kairos: falta $tool" >&2; exit 1; }
done
if [[ ! -f "$PATCH_FILE" ]]; then
    echo "kairos: falta $PATCH_FILE (repositorio incompleto)" >&2
    exit 1
fi

BUN="${BUN:-}"
if [[ -z "$BUN" ]]; then
    if command -v bun >/dev/null 2>&1; then
        BUN="$(command -v bun)"
    elif [[ -x "$HOME/.bun/bin/bun" ]]; then
        BUN="$HOME/.bun/bin/bun"
    elif [[ -n "${BUN_INSTALL:-}" && -x "$BUN_INSTALL/bin/bun" ]]; then
        BUN="$BUN_INSTALL/bin/bun"
    fi
fi
if [[ -z "$BUN" ]]; then
    echo "kairos: falta bun (instálalo con: curl -fsSL https://bun.sh/install | bash)" >&2
    exit 1
fi

BUILD_BASE="${KAIROS_BUILD_DIR:-$HOME/.cache}"
mkdir -p "$BUILD_BASE"
WORK="$(mktemp -d "$BUILD_BASE/kairos-opencode-build.XXXXXX")"
cleanup() {
    if [[ "${KAIROS_KEEP_BUILD:-}" == "1" ]]; then
        echo "kairos: árbol temporal conservado en $WORK (KAIROS_KEEP_BUILD=1)"
    else
        rm -rf "$WORK"
    fi
}
trap cleanup EXIT

echo "kairos: construyendo OpenCode $VERSION (esto tarda varios minutos)"
curl -fsSL "https://codeload.github.com/anomalyco/opencode/tar.gz/refs/tags/$VERSION" -o "$WORK/opencode.tar.gz"
mkdir -p "$WORK/src"
tar xzf "$WORK/opencode.tar.gz" -C "$WORK/src" --strip-components=1

cd "$WORK/src"
echo "kairos: aplicando $PATCH_FILE"
patch -p1 --forward < "$PATCH_FILE"

export PATH="$(dirname "$BUN"):$PATH"
bun install
OPENCODE_CHANNEL=kairos bun run --cwd packages/opencode script/build.ts --single --skip-embed-web-ui

BIN_SRC="$(find "$WORK/src/packages/opencode/dist" -type f -name opencode 2>/dev/null | head -n 1)"
if [[ -z "$BIN_SRC" ]]; then
    echo "kairos: el build no produjo ningún binario en dist/" >&2
    exit 1
fi

mkdir -p "$DEST/bin"
install -m 755 "$BIN_SRC" "$DEST/bin/opencode"
echo "kairos: binario instalado en $DEST/bin/opencode"
"$DEST/bin/opencode" --version
echo "kairos: listo — abre kairos: panel de gentle-shell a la izquierda (tui.json: session_left_width)"
