# Vista de agentes y subagentes (paridad con el overlay `alt+a` de gentle-shell)

> Documento ODD. Vive en el repositorio del proyecto, en `odd/tasks/agents-view.md`.
> Se espeja en memoria (tema `kairos/agents-view`) para poder retomar entre sesiones.

## Objetivo

Vista a pantalla completa que muestre, **a la izquierda**, los subagentes vivos de la sesión y el catálogo de agentes configurados; y a la derecha, el hilo del subagente seleccionado o la ficha del agente. Se abre con atajo de teclado y desde la paleta/`/agents`, como el overlay `alt+a` de gentle-shell.

## Problema

Hoy kairos solo muestra subagentes en la **sidebar derecha** (monitor de terceros `opencode-subagent-statusline@1.3.0` en `sidebar_content`) y la tarea ODD en `tui-plugins/kairos-hud.tsx`. No existe:

- Un catálogo visible de **agentes** (10 subagentes en `agents/*.md` + `kairos-control`/`kairos-auto` en `opencode.json`).
- Una vista combinada agente/subagente con el hilo del subagente seleccionado (lo que gentle-shell ofrece con `alt+a`).

Límite del host (evidencia en runtime, V1): la sidebar de OpenCode 1.18.35 vive solo a la derecha (el binario solo expone `session.sidebar.toggle`; no hay `sidebar_position`; el PR upstream quedó cerrado para V1). Una columna fija izquierda **no es posible** con la API TUI instalada; sí una **vista de plugin a pantalla completa** (`api.route.register`/`navigate`; reservadas `home`/`session`), donde la lista queda a la izquierda.

Conflicto de atajo conocido: `alt+a` ya está tomado por el editor del prompt de OpenCode (`input_visual_line_home`). El atajo final lo decide V1 con evidencia; `/agents` queda como red de seguridad.

## Por qué

Pedido del usuario (2026-10-18): «como en gentle-shell se pueda ver los agentes y subagentes a lado izquierdo», maximizando lo que ofrecen OpenCode y gentle-shell. Decisión de producto tomada: vista a pantalla completa con lista a la izquierda (opción recomendada en el plan aprobado).

## Alcance

### Dentro

- Plugin TUI propio `tui-plugins/kairos-agents.tsx` (id `kairos-agents`, ruta `kairos-agents`).
- Apertura: atajo de teclado decidido en V1 + comando de paleta con `/agents`; desde el home avisa con un toast.
- Panel izquierdo: subagentes de la sesión (activos primero, glifo/estado/agente/título/tiempo) y catálogo de agentes (primarios → subagentes, con modo/modelo/descripción).
- Panel derecho: hilo del subagente seleccionado (prompt, texto, líneas de tools, scroll/follow) o ficha del agente.
- Modo estrecho (terminales chicas): una columna con la lista; `Enter` abre el detalle y `Esc` vuelve.
- Acciones: `Enter` abre la sesión hija, `Esc`/`q` vuelve a la sesión padre.
- Pruebas nuevas (`tests/tui-agents.test.mjs`) y docs (README y `docs/ARCHITECTURE.md`).

### Fuera

- Columna fija persistente a la izquierda (imposible en 1.18.35; futuro si OpenCode añade `sidebar_position` o el `session.panel` de V2).
- Vista “todas las sesiones”, historial persistente de tareas, ratón, animaciones.
- Tocar `opencode-subagent-statusline` o el HUD: conviven sin cambios.
- Detener subagentes queda como **opcional recortable** dentro de V5 (con confirmación).

## Restricciones

- Sin dependencias nuevas: solo `@opencode-ai/plugin/tui`, `solid-js` y `@opentui/solid` ya instalados.
- `tui-plugins/` y `tui.json` son manuales: la sincronización con gentle-shell no los toca.
- Colores solo de `api.theme.current`; sin hex fijos. Legible en 80×24 y en los 4 temas.
- Un fallo de fetch (p. ej. sin red/servidor) no puede romper la TUI: se muestra lo cacheado.
- `pnpm test` debe quedar verde, incluida la prueba de privacidad (sin rutas de la máquina en lo versionado).
- Código y comentarios en inglés; documentos del repo en español.

## Deuda deliberada

- `shortcut: hilo del subagente con ventana simple (últimas N líneas) y refresco al seleccionar/evento, sin scroll buffer completo — revisar si el hilo real pide navegación larga.`
- `shortcut: el catálogo de agentes se pide una vez al abrir la vista (con caché en memoria), sin refresco reactivo — revisar si los agentes cambian en caliente.`

## Checklist

Cada tarea tiene ID estable, criterio de aceptación observable y prueba.

- [x] V1 — Reconocimiento en runtime (pty): ruta de plugin a pantalla completa, `navigate`, conflicto del atajo (`alt+a` vs alternativas), formas de datos (`client.session.children/messages`, `client.app.agents`, `state.session.*`, `metadata.sessionId`) y resolución de imports de `@opentui/solid` desde `tui-plugins/` · Criterio: nota con evidencia observada en 130×44 y atajo final elegido; plugin de diagnóstico temporal retirado al terminar · Prueba: smoke `script -qec` + `grep` de la captura y del log de diagnóstico
- [x] V2 — Plugin base `tui-plugins/kairos-agents.tsx`: ruta `kairos-agents`, apertura/cierre (atajo + `/agentes` + paleta), cabecera y pie; desde home avisa con toast · Criterio: la ruta pinta a pantalla completa y `Esc` vuelve a la sesión · Prueba: captura pty
- [x] V3 — Panel izquierdo: subagentes vivos de la sesión (derivados de las partes de la tool `task` con `metadata.sessionId`) y catálogo de agentes (`client.app.agents()`), con selección j/k · Criterio: con 2 subagentes reales, la lista los muestra con estado y tiempo · Prueba: captura pty
- [x] V4 — Panel derecho: hilo del subagente (fetch + caché + refresco por evento) o ficha del agente; modo estrecho y scroll/follow · Criterio: el hilo del seleccionado se ve y se puede recorrer; en < 90 columnas una sola columna con detalle/volver · Prueba: captura pty
- [x] V5 — Acciones: `Enter` abre la sesión hija (`route.navigate("session", …)`), `Esc`/`q` vuelve; opcional `s` detiene con confirmación (`client.session.abort`) · Criterio: abrir/volver funcionan; si entra el stop, pide confirmación · Prueba: captura pty
- [x] V6 — Pruebas: `tests/tui-agents.test.mjs` (ruta, atajo, fuentes de datos, navegación, sin hex, limpieza, `tui.json`) + `pnpm test` verde + privacidad · Prueba: `pnpm test`
- [x] V7 — Docs al día: README (cómo abrir y apagar la vista) y `docs/ARCHITECTURE.md` (mapa de la TUI + mapeo gentle-shell) describen lo implementado; tarea cerrada · Prueba: revisión + `pnpm test`

## Evidencia de verificación

- Plan aprobado por el usuario (2026-10-18) con decisión de producto: vista completa con lista a la izquierda.
- Reconocimiento previo (2026-10-18, estático): `@opencode-ai/plugin@1.18.35` (`dist/tui.d.ts`): slots host, `api.route.register/navigate` (reservadas `home`/`session`), `api.keymap.registerLayer`, `api.command.register` (legacy con `slash`), `api.ui.dialog/toast`, `api.kv`, `api.lifecycle.onDispose`, `api.state.session.{get,messages,status,part}`, `api.state.config.agent`. SDK v2: `client.session.children/messages/abort`, `client.app.agents()` (`Agent{name,description,mode,model,steps,permission,hidden,native}`), `Session{parentID,cost,tokens,agent}`. `@opentui/solid@0.5.17`: `useKeyboard`, `useTerminalDimensions`, `useRenderer`; intrinsics `box,text,span,scrollbox,markdown`. Binario de OpenCode 1.18.35: solo `session.sidebar.toggle`; `alt+a` = `input_visual_line_home` (conflicto). `opencode-subagent-statusline` mapea hijos con `state.input.subagent_type/description` y `metadata.sessionId`.
- V1 (2026-10-18): smoke real en pty 130×44 (`( sleep 25; printf '\x1ba'; … ) | timeout -s TERM 70 script -qec "stty rows 44 cols 130; env -u OPENCODE_CONFIG_CONTENT KAIROS_NO_SYNC=1 KAIROS_NO_LOCAL=1 TERM=xterm ./bin/kairos" captura`), con plugin de diagnóstico temporal (`tui-plugins/kairos-diag.tsx`, retirado al terminar; `tui.json` restaurado byte a byte desde copia). Hallazgos observados:
  - Carga: un plugin de `tui-plugins/` puede importar `@opentui/solid` (`useKeyboard` y `useTerminalDimensions` resuelven y funcionan). `Object.keys(api)` = app, attention, command, keys, keymap, mode, route, ui, tuiConfig, kv, state, theme, client, event, renderer, slots, plugins, lifecycle. `state.session` = count, get, diff, todo, messages, status, permission, question.
  - Ruta: `api.route.register([{ name: "kairos-diag", render }])` + `api.route.navigate("kairos-diag", { src })` renderiza a pantalla completa (dims 130×44 leídas con `useTerminalDimensions`); `route.current` pasa a `{ name: "kairos-diag", params: { src } }`.
  - Teclado: `api.keymap.registerLayer({ commands, bindings })` funciona; `alt+g` dispara tanto en la ruta del plugin como en la ruta de sesión con el prompt enfocado (sesión busy). `slashName` del API moderno **no** aparece en el menú `/` de 1.18.35; la API legacy `api.command.register` con `slash: { name }` **sí** (captura: «/diag — diag slash»). `alt+a` por la vía legacy (`keybind`) dispara en home y en sesión, pero pisa `input_visual_line_home` del editor de prompt → descartado para no robar un atajo del host; atajo elegido: **`alt+g`** (libre en el binario; se puede cambiar con `KAIROS_AGENTS_KEY`, u omitir con `off`).
  - Datos: `client.session.create/children/messages/delete/status` funcionan con params planos (`{ sessionID }`; sin envoltorio `{ path }`). `children` de una sesión nueva = `[]`; `state.session.status(sid)` = `undefined` en reposo (`busy`/`idle`/`retry` cuando aplica). `client.app.agents()` = 17 agentes (incluye ocultos `compaction`/`summary`/`title`; excluye `build`/`plan` desactivados); `state.config.agent` = 14 claves (incluye `plan`/`build`); los 10 subagentes de kairos aparecen con `mode: "subagent"`.
  - Forma real de la tool `task` (consulta read-only a `opencode.db`, 34 partes `tool:"task"`): `state.input.{description,subagent_type,prompt}`, `state.metadata.{sessionId,parentSessionId,model,truncated}`, `state.time.{start,end}` y `state.status` (`completed`/`running`/`error`). La sesión hija lleva `agent` (p. ej. `gentle-ai-verify`) en `Session.agent` y su título termina en `(@gentle-ai-verify subagent)`; `Session` trae `cost`, `tokens` y `time`. `client.session.messages({ sessionID })` devuelve `[{ info, parts }]`: el hilo completo en una sola llamada.
  - Colores: `theme.current.accent`/`textMuted` legibles como RGBA y usables directamente en `fg`; el tema activo en el smoke fue `gentleman-kairos`.

- V2–V5 (2026-10-18): smokes reales en pty con `script -qec` y capturas leídas con un emulador ANSI mínimo (`/tmp/opencode/ansi-screen.mjs`, descartable). Observado:
  - Carga y atajo: un fallo inicial de sintaxis (`const marker` duplicado, invisible para `tsc` con `@ts-nocheck`) impedía cargar el plugin; detectado con el log temporal y corregido. Con el archivo válido, `alt+g` dispara en el home (toast «Abre una sesión…») y en la sesión con el prompt enfocado; `/agentes` aparece en el menú `/` con la descripción «Subagentes y agentes de la sesión» (el `/agents` nativo es «Switch agent», por eso el slash propio es `agentes`).
  - Vista con dos subagentes reales (`gentle-ai-explore` en paralelo): cabecera `❀ Agentes · <sesión> · 1 activos · 1 hechos`; izquierda con «Subagentes» (glifo de estado, agente, resumen y tiempo) y «Agentes» (perfiles primero; modo y modelo); derecha con el título del agente, `modelo · tokens · coste · tiempo` y el hilo (prompt `▸`, texto y líneas de tools). `j` cambia la selección y el hilo cambia con ella.
  - Una fila desbordaba el ancho de la lista y el host la partía en dos líneas; corregido restando el padding del panel (`listContent`). El hilo de un subagente en marcha se quedaba en «cargando hilo…» por un livelock de peticiones (cada tick cancelaba la anterior); corregido con una petición en vuelo por hijo. Tras el arreglo, el hilo en vivo muestra `◐ read — running`, `· glob`, etc.
  - Navegación: `enter` abre la sesión hija (la captura siguiente muestra su transcripción) y `alt+g` desde ella abre la vista de esa sesión hija («sin subagentes en esta sesión»); `q`/`esc` vuelven a la sesión.
  - Stop: `s` sobre un subagente en marcha abre el diálogo del host («Detener subagente · ¿Detener gentle-ai-explore (…)?»); `esc` lo cancela sin salir de la vista (guard `api.ui.dialog.open`); confirmar aborta la sesión hija (el transcript la marca detenida y el orquestador sigue).
  - Modo estrecho (90×30): la vista muestra solo la lista; `enter` abre el detalle (ficha de agente), `esc` vuelve a la lista y otro `esc` sale a la sesión.
- V6 (2026-10-18): `tests/tui-agents.test.mjs` (17 pruebas) + `pnpm test` → 151 tests, 146 pass, 5 skip, 0 fail; privacidad verde.
- V7 (2026-10-18): README («Vista de agentes (`alt+g`)», recuento de pruebas y árbol) y `docs/ARCHITECTURE.md` (mapeo, mapa de la TUI y sección «La vista de agentes») al día; sin rutas de la máquina.

## Revisión visual posterior (2026-10-18)

Revisión de UX/visual pedida por el usuario (colores, modos, choques). Método: inventario estático (temas, slots, atajos, órdenes), cuatro smokes pty con la TUI real (un tema por corrida, 130×44, en el repo para que el HUD tuviera tarea ODD activa) y extracción de colores SGR de las capturas; los frames se leyeron con un emulador ANSI propio (retirado). Hallazgos y arreglos:

- **Temas completos y coherentes**: los 4 temas definen las mismas 50 claves del bloque `theme`; el logo usa `primary`/`secondary` y su texto `accent`; el HUD usa `accent`/`success`/`warning`; la vista usa `accent`/`success`/`error`/`warning`/`textMuted`/`text`/`border`/`background`. Sin hex en plugins (lo cubre la suite).
- **Modos con colores**: `kairos-control` (warning) y `kairos-auto` (accent) se pintan con el color del tema activo junto al prompt y en el catálogo; verificado por SGR en los 4 temas (p. ej. `#dca561` y `#3b82f6` con `gentleman-kairos`).
- **Sin choques de atajos ni slots**: `alt+g` y `alt+b` libres (el binario solo usa `alt+a`/`alt+e` en el editor); la sidebar apila nativo + terceros (order 90) + HUD (order 95); el prompt lo envuelve el plugin de terceros y las filas propias van en `session_prompt_right`.
- **Defecto corregido (HUD)**: el nombre de la tarea ODD se partía y el contador `n/m` se perdía junto al prompt (slot de 26 columnas) y los pendientes se partían en la sidebar (33 reales, no 38). Presupuestos añadidos (`ROW_NAME_MAX=12`, `PANEL_NAME_MAX=21`, `PANEL_ITEM_MAX=30`) y verificados en pty: `◆ odd post-port-h… 19/24` en una línea y cada pendiente en una línea.
- **Defecto corregido (vista)**: filas de la lista que desbordaban el panel (padding no descontado) y livelock del hilo de un subagente en marcha (una petición en vuelo por hijo). Ambos verificados de nuevo en pty.
- **Mejora de coherencia**: cada fila del catálogo y la ficha del agente usan el color configurado del agente (`warning` para los perfiles de control, `accent` para los automáticos), el mismo que el host pinta en el prompt.

## Progreso

- 2026-10-18 — Plan creado y aprobado. Documento ODD creado.
- 2026-10-18 — V1 completo: spike en pty con plugin de diagnóstico (retirado); atajo elegido `alt+g`; formas de datos confirmadas; decisión de usar la API legacy solo para el slash (renombrado a `/agentes` tras chocar con el `/agents` nativo).
- 2026-10-18 — V2–V5 completos: `tui-plugins/kairos-agents.tsx` con ruta a pantalla completa, lista izquierda (subagentes + agentes), hilo/ficha a la derecha, modo estrecho, navegación a la sesión hija y stop con confirmación; defectos de ancho y de hilo en vivo corregidos y re-verificados en pty.
- 2026-10-18 — V6–V7 completos: 17 pruebas nuevas, suite completa verde y docs al día. Tarea cerrada.

## Siguiente paso

Revisar el cambio con el usuario y, si lo pide, preparar los commits por unidad de trabajo. Queda como deuda deliberada el hilo con ventana simple y el catálogo de agentes cacheado al abrir.
