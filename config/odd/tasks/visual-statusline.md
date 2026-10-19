# Statusline y sidebar enriquecidos (fusión visual OpenCode + gentle-shell)

> Documento ODD. Vive en el repositorio del proyecto, en `odd/tasks/visual-statusline.md`.
> Se espeja en memoria (tema `odd/visual-statusline/tasks`) para poder retomar entre sesiones.

## Objetivo

Aprovechar la API TUI de OpenCode 1.18.35 para poblar la sesión con información viva (modelo/perfil, branch, contexto, ODD, LSP/MCP) junto al prompt y en la sidebar, con una identidad visual de fusión Kairos (azul Arch + rosa gentleman) que siga el tema activo.

## Problema

Hoy lo visual se limita al logo (`home_logo`), el tema, los sonidos y la sidebar de subagentes de `opencode-subagent-statusline`. La API TUI instalada (`@opencode-ai/plugin` 1.18.35, `dist/tui.d.ts`) ofrece slots y datos sin usar:

- Slots con datos por sesión: `session_prompt` / `session_prompt_right` (en uso por el plugin de subagentes), `sidebar_content` (en uso), `home_bottom` (en uso), `app_bottom`, `sidebar_title`, `sidebar_footer` (libres).
- Estado disponible sin usar: `state.vcs.branch`, `state.session.todo/diff/status/messages`, `state.mcp()`, `state.lsp()`, `state.config`, `api.theme.current` (colores en vivo), `api.kv` (persistencia).
- El logo fija sus colores a mano (`ARCH_BLUE_*` en `tui-plugins/gentle-logo.tsx:44-46`) y no sigue el tema activo.

En gentle-shell (Pi) la barra y los paneles de uso no se portaron porque dependían de su API; en OpenCode se pueden reconstruir con los slots nativos.

## Por qué

Pedido del usuario (2026-10-15): «comencemos con lo visual, unir bien ambos mundos aprovechando al máximo todas sus herramientas para hacer el mejor entorno de desarrollo». Decisión de producto tomada: primera tanda = statusline + sidebar enriquecidos; identidad = fusión Kairos (azul Arch + rosa gentleman).

## Alcance

### Dentro

- Plugin TUI propio `tui-plugins/kairos-hud.tsx`: statusline de sesión y sección de sidebar enriquecida.
- Datos vivos: modelo y perfil activos, branch git, tokens/contexto de la sesión, tarea ODD (todos), salud LSP/MCP, archivos cambiados.
- Identidad: colores tomados de `api.theme.current`; acento rosa gentleman en texto del logo y separadores, conviviendo con el azul Arch del arco.
- Tests nuevos (`tests/tui-hud.test.mjs`), ampliación de `tests/tui-logo.test.mjs` y smoke real en pty.
- Docs: README (sección de interfaz) y `docs/ARCHITECTURE.md` (mapa de la TUI).

### Fuera

- Banner de arranque estilo gentle-shell (rosa animada) — tanda posterior.
- Toasts y notificaciones visuales propias — tanda posterior.
- Dashboard de inicio (`home_bottom` propio) — el plugin de subagentes ya usa ese slot; se evalúa en otra tanda.
- Paneles de uso/tokens agregados al estilo Pi (`gentle-stats`) — otra tanda.
- Tocar `opencode-subagent-statusline` (paquete de terceros) o su config.

## Restricciones

- No romper `pnpm test` (58 pruebas hoy) ni el smoke de la TUI con HOME temporal.
- `tui-plugins/` es manual (no lo toca el sync; ver `docs/ARCHITECTURE.md`, ciclo de vida).
- Sin datos personales ni rutas de la máquina en archivos versionados (`tests/privacy.test.mjs`).
- Código y comentarios en inglés; documentos del repo en español.
- Los widgets deben convivir con el plugin de subagentes en los mismos slots, sin pisarlo; legibles en terminales de 80×24 y en los 4 temas.
- Sin dependencias nuevas: usar solo la API de `@opencode-ai/plugin/tui` y `@opentui/*` ya instalados.

## Checklist

Cada tarea tiene ID estable, criterio de aceptación observable y prueba.

- [x] V1 — Reconocimiento en runtime de la API TUI · Criterio: nota con evidencia de qué datos expone `state` en 1.18.35 (branch, todo, diff, modelo del mensaje, mcp, lsp) y de qué slots aceptan varios plugins a la vez (captura pty con un plugin de diagnóstico temporal) · Prueba: smoke `script -qec` 120×40 + `grep` de la captura; plugin temporal retirado al terminar
- [x] V2 — `tui-plugins/kairos-hud.tsx`: fila de sesión con lo que el host **no** pinta — ODD activa (n/m) y aviso de sync pendiente — sin duplicar modelo/contexto/MCP/LSP (ya nativos; decisión tras el baseline de sesión de V2) · Criterio: la fila se pinta junto al prompt con datos reales y se refresca cada 4 s · Prueba: smoke pty con sesión real + `tests/tui-hud.test.mjs`
- [x] V3 — Sección de sidebar propia: tarea ODD activa con sus pendientes (sin duplicar todos/MCP/LSP del host, ni archivos: no había sección nativa de archivos en el baseline) · Criterio: el bloque de kairos y el de subagentes conviven visibles en la sidebar · Prueba: captura pty
- [x] V4 — Identidad fusión: HUD y logo leen `api.theme.current`; acento rosa gentleman en texto del logo y separadores · Criterio: captura con `gentleman-kairos`, `gentle`, `gentleman-cute` y `gentleman-sexy` sin colores rotos; sin hex fijos en el HUD · Prueba: smoke pty con los 4 temas + `tests/tui-logo.test.mjs`
- [x] V5 — Suite verde · Criterio: `pnpm test` pasa con los tests nuevos y el de privacidad sigue verde · Prueba: `pnpm test`
- [x] V6 — Docs al día · Criterio: README (sección de interfaz: qué se ve y cómo se apaga) y ARCHITECTURE (mapa de la TUI) describen lo implementado · Prueba: revisión + `pnpm test`

## Evidencia de verificación

- Reconocimiento previo (2026-10-15): lectura de `dist/tui.d.ts` (slots y estado), del plugin de subagentes (usa `session_prompt`, `session_prompt_right`, `sidebar_content`, `home_bottom`, `api.event`, `api.kv`, `state.session.messages/status`) y del logo actual.
- V1 (2026-10-15): smoke real en pty 130×44 (`timeout -s TERM 16 script -qec "stty rows 44 cols 130; env -u OPENCODE_CONFIG_CONTENT KAIROS_NO_SYNC=1 KAIROS_NO_LOCAL=1 TERM=xterm ./bin/kairos" <captura>`), con un plugin de diagnóstico temporal (`tui-plugins/kairos-diag.tsx`, retirado al terminar; `tui.json` restaurado byte a byte). Hallazgos observados:
  - Datos en runtime: `app=1.18.35`, `route.current.name=home`, `mode.current()=base`, `theme.selected=gentleman-kairos` (`theme.has()`/`theme.ready` true), `vcs.branch=main`, `session.count()=10`, `provider.length=3`, `plugins.list().length=16`, `attention={"enabled":false,"sound_pack":"opencode.default"}` (coherente con `KAIROS_SOUNDS` sin definir), `path.worktree` correcto y `path.config` apunta al config global de OpenCode (`~/.config/opencode`), no al del proyecto.
  - **`mcp()` llega asíncrono**: primer frame `[]`, segundo frame `[{context7,connected},{engram,connected}]`. Los widgets deben ser reactivos (señales/efectos ligados a `api.event`), no leer una sola vez al montar.
  - `lsp()` vacío en el home (se reevalúa en sesión, V2).
  - `theme.current.primary`/`accent` legibles como RGBA (`rgba(0.23,0.51,0.96,1.00)`): los widgets pueden seguir el tema activo sin hex fijos.
  - Slots: `home_logo` **apila** varios plugins (logo order 100 + diag order 300, ambos visibles); `home_footer` **no renderiza** (confirma el descarte de T22); `home_bottom` renderiza pero **colisiona con el tip nativo** de OpenCode (texto intercalado); **`app_bottom` renderiza limpio** y queda libre; `session_prompt_right`/`sidebar_content` (ocupados por el plugin de subagentes) quedan por verificar en sesión en V2/V3.
  - La statusline nativa ya pinta `cwd:branch`, versión y `⊙ 2 MCP`: el HUD debe **sumar** sin duplicar.
  - Método reutilizable para smokes: con `TERM` heredado la TUI queda esperando respuestas de capabilities y no pinta; `TERM=xterm` + `script -qec` pinta completo en pty.
- V2 (2026-10-15): baseline de sesión real (smoke pty con prompt por stdin: `( sleep 9; printf '…\r'; sleep 10 ) | timeout -s TERM 24 script -qec "…" <captura>`) para inventariar lo que ya pinta el host. Observado: sidebar con `Context` (16,239 tokens · 2% used · $0.00 spent), `MCP` (context7/engram Connected), `LSP` y el panel `Subagentes 1.3.0`; prompt y mensaje con `Kairos · DeepSeek V4.1 Flash`. Decisión: el HUD **no duplica**; aporta ODD + sync. Implementado `tui-plugins/kairos-hud.tsx` (slot `session_prompt_right`, order 95; snapshot cada 4 s vía `createMemo`/`setInterval` + `onDispose`; caché por mtime+tamaño; solo `api.theme.current`, sin hex). Resultado observado en el smoke: fila `◆ odd visual-statusline 1/6` junto al prompt; `sync pendiente` oculto (sync al día); sin errores de plugin en el log. `pnpm test` → 66 tests, 62 pass, 4 skipped, 0 fail (8 nuevos en `tests/tui-hud.test.mjs`).
- V3 (2026-10-15): baseline de sesión en un proyecto de prueba fuera del repo (`/tmp/opencode/scratch`, `git init`) pidiendo al agente `todowrite` (3 tareas, 1 completada) + escribir un archivo: el host ya pinta `▼ Todo` con checkboxes (en la sidebar y en el mensaje), `Context`, `MCP`, `LSP` y el panel de subagentes; no apareció sección de archivos. Decisión: la sección de kairos muestra la **tarea ODD activa con sus pendientes** (único dato que nadie pinta). Implementado en `tui-plugins/kairos-hud.tsx` (`sidebar_content`, order 95; extrae el texto de los checkboxes sin marcar, lista hasta 3 con `… +N`, aviso `⚠ sync gentle-shell`). Resultado observado en el smoke (con `odd/tasks/demo.md` 1/3): sidebar `◆ ODD demo 1/3` + `· D2 — …` + `· D3 — …` conviviendo con `▼ Subagentes 1.3.0`, y fila `◆ odd demo 1/3` junto al prompt. `pnpm test` → 69 tests, 65 pass, 4 skipped, 0 fail (3 nuevos).
- V4 (2026-10-16): logo reescrito para leer `api.theme.current` — arco en `primary`/`secondary`, texto y separadores en `accent`, atajos en `textMuted`; sin hex fijos. Pruebas nuevas en `tests/tui-logo.test.mjs` (rojo antes, verde después). Smokes pty con los 4 temas: logo presente y 0 errores en las 4 capturas; el `accent` de cada tema aparece exactamente 3 veces (texto + 2 separadores) con su RGB exacto y su `primary` en el arco.
- V5 (2026-10-16): `pnpm test` → 75 tests, 71 pass, 4 skip, 0 fail (privacidad verde).
- V6 (2026-10-16): README (logo sigue al tema; sección «Statusline y sidebar (ODD)» con qué se ve y cómo se apaga; árbol y recuento de pruebas) y ARCHITECTURE (sección «La TUI (mapa)»; mapeo, pruebas y limitaciones al día).

## Progreso

- 2026-10-15 — Plan creado a pedido del usuario. Decisiones: primera tanda = statusline + sidebar; identidad = fusión azul Arch + rosa gentleman; banner/toasts/dashboard quedan para tandas posteriores.
- 2026-10-15 — V1 completo: reconocimiento en runtime con plugin temporal y smoke en pty; hallazgos y decisiones de slot registrados arriba.
- 2026-10-15 — V2 completo: HUD de sesión (ODD + sync) en `session_prompt_right`, tests estáticos y smoke real con sesión; decisión anti-duplicación registrada (el host ya pinta contexto/MCP/LSP/modelo).
- 2026-10-15 — V3 completo: sección ODD en `sidebar_content` (tarea activa + pendientes, tope 3 + `… +N`); convivencia con el panel de subagentes verificada en smoke real.
- 2026-10-16 — V4–V6 completos: identidad fusión del logo (colores del tema activo), docs de interfaz al día y tarea cerrada.

## Siguiente paso

Tanda visual cerrada. Quedan como tandas futuras (sin fecha): banner de arranque, toasts, dashboard de inicio y paneles de uso tipo Pi.
