// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin } from "@opencode-ai/plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo } from "solid-js"

const id = "gentle-logo"

// Logo clásico de Arch Linux: el símbolo real (pico + dos "patas" separadas
// por una muesca central), dibujado con caracteres estándar ASCII 
// (estilo neofetch). Esto asegura que las proporciones queden simétricas
// y el logo se lea perfectamente sin depender de la fuente de la terminal.
const archArt = [
  "                   -`                   ",
  "                  .o+`                  ",
  "                 `ooo/                  ",
  "                `+oooo:                 ",
  "               `+oooooo:                ",
  "               -+oooooo+:               ",
  "             `/:-:++oooo+:              ",
  "            `/++++/+++++++:             ",
  "           `/++++++++++++++:            ",
  "          `/+++ooooooooooooo/`          ",
  "         ./ooosssso++osssssso+`         ",
  "        .oossssso-````/ossssss+`        ",
  "       -osssssso.      :ssssssso.       ",
  "      :osssssss/        osssso+++.      ",
  "     /ossssssss/        +ssssooo/-      ",
  "   `/ossssso+/:-        -:/+osssso+-    ",
  "  `+sso+:-`                 `.-/+oso:   ",
  " `++:.                           `-/+/  ",
  " .`                                 `/  "
]
// Arte compacto para terminales pequeñas (por debajo de ARCH_MIN_WIDTH ×
// ARCH_MIN_HEIGHT): un arco mínimo que cabe en lienzos reducidos.
const compactArt = [
  "      /\\",
  "     /  \\",
  "    / /\\ \\",
  "   / /  \\ \\",
  "  /_/    \\_\\",
]
// Atajos bajo el arco; los separadores («·») se pintan con el acento del tema.
const SHORTCUT_PARTS = [
  { text: "Tab: perfiles" },
  { text: " · ", accent: true },
  { text: "ctrl+p: comandos" },
  { text: " · ", accent: true },
  { text: "/gentle-doctor: diagnóstico" },
]

// Texto personal bajo el arco. Cámbialo aquí o define KAIROS_LOGO_TEXT
// al lanzar: KAIROS_LOGO_TEXT=otro-texto kairos
const LOGO_TEXT =
  (typeof process !== "undefined" && process.env?.KAIROS_LOGO_TEXT) || "kairos"

// Colorea las líneas del logo con el tema activo (por índice de fila): la
// punta en primary y el cuerpo/base en secondary. Con el tema kairos el arco
// queda en azul Arch; con los temas gentleman, en su paleta. Sin hex fijos.
const archLineColor = (theme, index) => {
  if (index <= 5) return theme.primary // Punta superior
  return theme.secondary // Cuerpo principal y base
}

// Gradiente equivalente para el arte compacto (5 filas).
const compactLineColor = (theme, index) => (index <= 1 ? theme.primary : theme.secondary)

// El logo necesita un mínimo de tamaño para verse completo
const ARCH_MIN_HEIGHT = archArt.length + 8
const ARCH_MIN_WIDTH = 45

const Logo = ({ theme }) => {
  const dim = useTerminalDimensions()
  const lines = createMemo(() => {
    const t = theme()
    const term = dim()
    const fits = term.height >= ARCH_MIN_HEIGHT && term.width >= ARCH_MIN_WIDTH
    return fits
      ? archArt.map((line, index) => ({ line, color: archLineColor(t, index) }))
      : compactArt.map((line, index) => ({ line, color: compactLineColor(t, index) }))
  })

  return (
    <box flexDirection="column" alignItems="center">
      {lines().map(({ line, color }) => (
        <text fg={color}>{line}</text>
      ))}
      <text fg={theme().accent}>{LOGO_TEXT}</text>
      <text> </text>
      <box flexDirection="row">
        {SHORTCUT_PARTS.map((part) => (
          <text fg={part.accent ? theme().accent : theme().textMuted}>{part.text}</text>
        ))}
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    id,
    order: 100,
    slots: {
      home_logo() {
        return <Logo theme={() => api.theme.current} />
      },
    },
  })
}

const plugin = { id: "gentle-logo", tui }
export default plugin