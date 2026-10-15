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
// Paleta todo azul: degradado desde cian eléctrico hasta azul profundo
const ARCH_BLUE_TOP = "#00d2ff"   // Cian brillante - pico superior
const ARCH_BLUE_MID = "#1793d1"   // Azul oficial de Arch - cuerpo central
const ARCH_BLUE_BOT = "#0369a1"   // Azul oscuro/marino - base y patas

// Colorea las líneas del logo (por índice de fila, 19 líneas en total):
// - Punta superior en ARCH_BLUE_TOP para mayor brillo y volumen
// - Cuerpo principal en ARCH_BLUE_MID manteniendo el color icónico
// - Base final en ARCH_BLUE_BOT para dar peso visual y profundidad
const archLineColor = (index: number) => {
  if (index <= 5) return ARCH_BLUE_TOP // Punta superior
  if (index <= 12) return ARCH_BLUE_MID // Cuerpo principal
  return ARCH_BLUE_BOT // Base y patas oscurecidas
}

// Gradiente equivalente para el arte compacto (5 filas).
const compactLineColor = (index: number) => {
  if (index <= 1) return ARCH_BLUE_TOP
  if (index <= 3) return ARCH_BLUE_MID
  return ARCH_BLUE_BOT
}

// El logo necesita un mínimo de tamaño para verse completo
const ARCH_MIN_HEIGHT = archArt.length + 8
const ARCH_MIN_WIDTH = 45

const Logo = () => {
  const dim = useTerminalDimensions()
  const lines = createMemo(() => {
    const term = dim()
    const fits = term.height >= ARCH_MIN_HEIGHT && term.width >= ARCH_MIN_WIDTH
    return fits
      ? archArt.map((line, index) => ({ line, color: archLineColor(index) }))
      : compactArt.map((line, index) => ({ line, color: compactLineColor(index) }))
  })

  return (
    <box flexDirection="column" alignItems="center">
      {lines().map(({ line, color }) => (
        <text fg={color}>{line}</text>
      ))}
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    id,
    order: 100,
    slots: {
      home_logo() {
        return <Logo/>
      },
    },
  })
}

const plugin = { id: "gentle-logo", tui }
export default plugin