# Panel de gentle-shell a la izquierda (binario propio de OpenCode con parche)

> Documento ODD. Vive en el repositorio del proyecto, en `odd/tasks/left-panel.md`.
> Se espeja en memoria (tema `kairos/left-panel`) para poder retomar entre sesiones.

## Objetivo

Que kairos sea la combinación visual de los dos proyectos: **a la izquierda, lo que muestra
gentle-shell** (agentes vivos, todos y estado, como su TUI) y **a la derecha, OpenCode como
estaba** (conversación en el centro y su sidebar a la derecha). El pedido original («a la
izquierda quiero lo que muestra gentle-shell, la combinación no solo en herramientas también en
lo visual») corrigió una primera iteración que solo movía la sidebar de OpenCode.

## Problema

- OpenCode 1.x no permite columnas propias en la pantalla de sesión y los plugins solo pueden
  poner contenido **dentro** de la sidebar (`sidebar.content`), no moverla ni crear columnas.
- El PR upstream #18497 (mover la sidebar con `row-reverse`) fue cerrado para V1 («portadlo a
  V2»; issue #56330 abierta sin implementar). Eso dio una primera solución — sidebar de OpenCode
  a la izquierda — que el usuario corrigió: no quería mover la UI de OpenCode, quería **añadir**
  el panel de gentle-shell a la izquierda manteniendo OpenCode como estaba.
- Decisión de producto (usuario, 2026-10-18): fork parcheado solo para kairos, iterado a un
  **panel izquierdo propio** con el binario parcheado.

## Alcance

### Dentro

- **S1 — Binario propio de OpenCode 1.18.35 con parche mínimo** guardado en
  `patches/opencode-left-panel.patch` (4 hunks): `session_left_width` y `sidebar_position` en el
  schema de la TUI; slot `session_left` en el layout de la sesión; `row-reverse`/`flex-start`
  para la opción de posición (el port del PR #18497, **no activada**: la sidebar de OpenCode se
  queda a la derecha como estaba).
- **S2 — Script reproducible** `scripts/build-opencode-patched.sh`: descarga el tag, aplica el
  parche, `bun install`, compila (`--single --skip-embed-web-ui`, canal `kairos`) e instala en
  `~/.local/share/kairos/opencode-patched/`, con test de humo de versión.
- **S3 — Lanzador**: usa el binario propio si existe (`KAIROS_OPENCODE_BIN` cambia la ruta);
  `OPENCODE_BIN` explícito gana; con el binario propio exporta `OPENCODE_DISABLE_CHANNEL_DB=1`
  para compartir la base de sesiones normal (`opencode.db`).
- **S4 — Panel `tui-plugins/kairos-shell.tsx`** (slot `session_left`): sección **Agents**
  (subagentes vivos con glifo de estado, agente, tarea y tiempo), sección **Todos** (tarea ODD
  `n of m` y pendientes `○`, topes 6 y 4 con `… +N`) y línea de estado (modelo, tokens, coste).
  Ancho por `session_left_width` (40 en `tui.json`); no se pinta por debajo de ~140 columnas.
- **S5 — Datos compartidos**: extraer la lógica de subagentes de la vista a
  `tui-plugins/subagents.ts` (collectRuns/mergeRuns/glifos/formato/eventos); la vista
  `kairos-agents.tsx` y el panel la comparten, igual que `odd-tasks.ts` con el ODD.
- **S6 — Pruebas**: `tests/tui-shell.test.mjs` (panel, slot, presupuestos, sin hex, limpieza),
  `tests/tui-agents.test.mjs` y `tests/tui-odd-tasks.test.mjs` ajustados a los módulos
  compartidos, y `tests/launcher.test.mjs` (prioridad del binario, parche y script).
- **S7 — Verificación visual en pty** (152×44 y 130×40): panel con subagentes reales a la
  izquierda, chat y sidebar a la derecha; con el binario oficial, todo como antes.
- **S8 — Docs**: README («Panel de gentle-shell a la izquierda») y `docs/ARCHITECTURE.md`
  (sección del binario propio y mapa de la TUI).

### Fuera

- Portar el parche a V2 o contribuir upstream (siguiente paso natural si kairos migra a V2).
- Automatizar el rebuild en `install.sh` (opcional y pesado; script manual documentado).
- Cambiar el contenido nativo de la sidebar de OpenCode o tocar el monitor de terceros y el HUD.

## Restricciones

- El binario oficial del usuario (`~/.opencode/bin/opencode`) no se modifica ni se sustituye.
- Sin dependencias nuevas para la TUI; `bun` solo hace falta para construir el binario.
- El repositorio funciona igual con el binario oficial (el slot `session_left` no se pinta).
- Colores solo de `api.theme.current`; sin hex fijos. Sin rutas de la máquina en lo versionado.
- Sin commits salvo pedido explícito.

## Deuda deliberada

- `shortcut: el parche se reaplica a mano sobre cada versión nueva de OpenCode (script + revisión); no hay vigilancia automática de conflictos — revisar al subir de versión.`
- `shortcut: el script construye solo para la plataforma actual (--single) y sin la web embebida; si kairos quiere más, extender el script.`
- `shortcut: la barra de estado del host se aprieta en terminales justas (los chips del prompt se parten en dos líneas) porque el panel resta ancho; ajustar session_left_width o el ancho de la terminal si molesta — revisar si se adopta un mínimo mayor.`

## Checklist

- [x] S1 — Parche (panel izquierdo + opción de posición) · Prueba: test estático + builds reales
- [x] S2 — Script reproducible · Prueba: ejecución completa (descarga → parche → build → instalación)
- [x] S3 — Lanzador con prioridad y db compartida · Prueba: `tests/launcher.test.mjs`
- [x] S4 — Panel `kairos-shell.tsx` · Prueba: pty con subagentes reales
- [x] S5 — `subagents.ts` compartido · Prueba: `tests/tui-shell.test.mjs` + vista sin copias
- [x] S6 — Pruebas · Prueba: `pnpm test` (179 tests)
- [x] S7 — Verificación visual en pty · Prueba: capturas en `/tmp/opencode/panel*.raw` y `narrow.raw`
- [x] S8 — Docs · Prueba: revisión + `pnpm test` (privacidad)

## Evidencia de verificación

- Análisis upstream (2026-10-18): PR #18497 cerrado con «upgraded to V2; no PRs for V1; port it to
  V2» (thdxr, 10 oct); issue #56330 (17 oct) pide la posición para V2 y sigue abierta; bot de
  OpenCode: los plugins solo pueden poner contenido dentro de `sidebar.content`.
- S1–S3 (2026-10-18): primer build (solo posición) verificado en pty; corregido el alcance por el
  usuario; segundo parche (4 hunks) y rebuild `0.0.0-kairos-202610190400`. El primer intento de
  build falló por dos motivos resueltos: `/tmp` es tmpfs de 3,6 G (el script usa `~/.cache`) y el
  cálculo del canal exige git o `OPENCODE_CHANNEL` (el script lo define). El lanzador comparte
  `opencode.db` con el binario oficial vía `OPENCODE_DISABLE_CHANNEL_DB=1` (válvula de upstream en
  `packages/core/src/database/database.ts`); verificado por mtime de la db en los smokes.
- S4–S7 (2026-10-18): smokes en pty (`script -qec`, leídos con `/tmp/opencode/ansi-screen.mjs`):
  - 152×44 con una sesión con subagentes reales: panel izquierdo con `Agents · 0 activos · 1
    hechos` y las tres filas (`✗ gentle-ai-expl… Count entries … 27s`, `✓ … Count files in… 21s`),
    `Todos · 0 of 7` con `ux-parity` y pendientes `○ U1…U4` (`… +3`), y estado
    `deepseek-v4.1-flash · 465 tok · $0.00`; a la derecha, la conversación y la sidebar de OpenCode
    (Subagentes 1.3.0, ODD, Context, MCP, LSP) sin cambios.
  - 130×40: el panel no se pinta (`showLeftPanel` exige ancho ≥ panel + 100) y el layout queda
    exactamente como antes.
  - Binario oficial con el mismo `tui.json`: todo como antes (la clave y el slot se ignoran).
- S6 (2026-10-18): `pnpm test` → 179 tests, 174 pass, 5 skip, 0 fail (incluye privacidad).

## Progreso

- 2026-10-18 — Investigación upstream y decisión de producto (fork parcheado solo para kairos).
- 2026-10-18 — Primera iteración (sidebar de OpenCode a la izquierda) verificada; **corrección
  del usuario**: era añadir el panel de gentle-shell, no mover OpenCode.
- 2026-10-18 — Segunda iteración: slot `session_left`, plugin `kairos-shell.tsx`, módulo
  `subagents.ts`, rebuild y verificación en pty. S1–S8 completos.

## Siguiente paso

Revisar en la TUI real (abrir kairos en una sesión ancha). Si kairos migra algún día a OpenCode
2, portar el panel como vista/paneles de V2 y/o apoyar la issue #56330. Commits por unidad de
trabajo solo si el usuario los pide.
