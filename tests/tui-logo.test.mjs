// Pruebas del logo de la TUI: el arte compacto debe caber por debajo de los
// umbrales del logo grande, que es cuando se usa (terminales pequeñas).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "tui-plugins", "gentle-logo.tsx"), "utf8");

function arrayLines(name) {
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\]`));
  assert.ok(m, `no se encontró el arreglo ${name} en tui-plugins/gentle-logo.tsx`);
  return [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
}

test("el logo define un arte compacto para terminales pequeñas", () => {
  const lines = arrayLines("compactArt");
  assert.ok(lines.length > 0, "compactArt está vacío");
});

test("el arte compacto cabe por debajo de los umbrales del logo grande", () => {
  const compact = arrayLines("compactArt");
  const full = arrayLines("archArt");
  const minWidth = Number(src.match(/const ARCH_MIN_WIDTH = (\d+)/)[1]);
  const minHeight = full.length + Number(src.match(/const ARCH_MIN_HEIGHT = archArt\.length \+ (\d+)/)[1]);

  const width = Math.max(...compact.map((l) => l.length));
  assert.ok(width < minWidth, `el arte compacto mide ${width} columnas; debe medir menos que ${minWidth}`);
  assert.ok(
    compact.length < minHeight,
    `el arte compacto tiene ${compact.length} filas; debe tener menos que ${minHeight}`,
  );
});

test("la rama compacta usa compactArt, definido antes de usarse", () => {
  const def = src.indexOf("const compactArt");
  const use = src.indexOf("compactArt.map");
  assert.ok(def !== -1, "compactArt no está definido");
  assert.ok(use !== -1, "la rama compacta no usa compactArt");
  assert.ok(def < use, "compactArt se usa antes de definirse");
  assert.match(src, /compactArt\.map\(\(line, index\) =>/, "la rama compacta debe colorear por índice");
});

test("el logo muestra un texto personal bajo el arco", () => {
  assert.match(src, /const LOGO_TEXT =/, "falta LOGO_TEXT");
  assert.match(src, /KAIROS_LOGO_TEXT/, "el texto debe poder cambiarse por variable");
  assert.match(src, /"kairos"/, "el texto por defecto es kairos");
  assert.match(src, /\{LOGO_TEXT\}/, "LOGO_TEXT debe renderizarse en la TUI");
});

test("el logo incluye los atajos principales bajo el arco", () => {
    assert.match(src, /Tab: perfiles/, "el logo debe recordar los atajos");
    assert.ok(!src.includes("home_footer"), "el pie separado no se usa (no renderiza en OpenCode 1.18)");
});

test("el logo lee los colores del tema activo y no tiene hex fijos", () => {
    assert.match(src, /api\.theme\.current/, "el logo debe leer api.theme.current");
    assert.ok(!/#[0-9a-fA-F]{3,8}/.test(src), "sin colores hexadecimales fijos en el logo");
    assert.match(src, /archLineColor = \(theme, index\)/, "el arco se colorea desde el tema");
    assert.match(src, /theme\.primary/, "el arco usa primary del tema");
    assert.match(src, /theme\.secondary/, "el arco usa secondary del tema");
});

test("el texto del logo y los separadores usan el acento del tema", () => {
    assert.match(src, /fg=\{theme\(\)\.accent\}>\{LOGO_TEXT\}/, "LOGO_TEXT se pinta con el acento del tema");
    assert.match(src, /const SHORTCUT_PARTS/, "los atajos se definen por partes para pintar los separadores");
    assert.match(src, /\{ text: " · ", accent: true \}/, "los separadores llevan el acento del tema");
});
