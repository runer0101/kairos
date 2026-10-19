# Modo unificado de la vista: gentle-shell a la izquierda, sesión de OpenCode a la derecha

> Documento ODD. Vive en el repositorio del proyecto, en `odd/tasks/visual-union.md`.
> Se espeja en memoria (tema `kairos/visual-union`) para poder retomar entre sesiones.

## Objetivo

Que la vista `alt+g` sea la unión visual de los dos proyectos: **a la izquierda lo que muestra
gentle-shell** (sesión, subagentes, agentes y la tarea ODD con sus pendientes) y **a la derecha lo
que muestra OpenCode** (el hilo de la conversación de la sesión activa, en vivo). Se elige como
camino la extensión de la vista existente (decisión del usuario, 2026-10-18), porque la columna
fija izquierda no existe en OpenCode 1.18.35 (`sidebar_position` no está en el host; ver
`agents-view.md`).

## Problema

- La vista actual (`tui-plugins/kairos-agents.tsx`) replica el overlay `alt+a` de gentle-shell:
  lista izquierda con subagentes + catálogo, hilo del subagente a la derecha. Pero **no muestra
  la conversación de la sesión activa** ni la **tarea ODD**, que es lo que el usuario espera ver
  como «lo que muestra OpenCode» y «lo que muestra gentle-shell».
- La tarea ODD ya se lee en `kairos-hud.tsx` con una copia local de la lectura de `odd/tasks/`;
  duplicarla otra vez en la vista sería una tercera copia del mismo lector.

## Por qué

Pedido del usuario (2026-10-18): «mejorar lo visual: a la derecha lo que muestra OpenCode y a la
izquierda lo que muestra gentle-shell, uniendo ambos proyectos, primero de manera local». Camino
elegido en la pregunta de producto: extender la vista `alt+g` (no app web aparte, no tmux).

## Alcance

### Dentro

- **W1 — Lector ODD compartido**: extraer `readOddTasks` (y `countCheckboxes` + caché por
  mtime+tamaño) de `kairos-hud.tsx` a `tui-plugins/odd-tasks.ts`; el HUD lo importa y conserva su
  comportamiento (recortes de ancho siguen siendo del consumidor). Criterio: HUD y vista leen ODD
  de la misma fuente; `tests/tui-hud.test.mjs` y el nuevo test del helper en verde.
- **W2 — Vista unificada** (`tui-plugins/kairos-agents.tsx`):
  - Fila **Sesión** al inicio de la lista, seleccionada por defecto: título, estado (activa/reposo),
    modelo, tokens y coste.
  - Sección **ODD** al final de la lista: tarea activa `n/m` y sus pendientes (tope 3, `… +N`),
    solo lectura, no seleccionable.
  - Panel derecho con la fila Sesión: **el hilo de la sesión activa en vivo** (prompt `▸`, texto,
    líneas de tools), con `f`/`pgup`/`pgdn` como el hilo de subagente; se refresca mientras la
    sesión está ocupada y se cachea en reposo.
  - Subagentes y agentes conservan su comportamiento (hilo del hijo, ficha, `enter`, `s`, `esc`).
  - Criterio: con una sesión real, la izquierda muestra Sesión+Subagentes+Agentes+ODD y la derecha
    el hilo de la conversación al abrir la vista.
- **W3 — Pruebas**: nuevo `tests/tui-odd-tasks.test.mjs` (módulo, extracción y tolerancia a
  fallos); `tests/tui-hud.test.mjs` ajustado al helper; `tests/tui-agents.test.mjs` ampliado
  (fila Sesión, sección ODD, hilo de la sesión, import del helper). Criterio: `pnpm test` verde
  (incluida privacidad).
- **W4 — Docs**: README («Vista de agentes» describe el modo unificado) y `docs/ARCHITECTURE.md`
  (tabla de la TUI + «La vista de agentes»). Criterio: documentos al día, sin rutas de la máquina.
- **W5 — Verificación visual (pty)**: smoke real en 130×44 y 90×30 con una sesión; capturas
  revisadas (secciones a la izquierda, hilo a la derecha, modo estrecho intacto). Criterio: captura
  legible + nota de evidencia; el import relativo del helper carga sin romper la TUI.

### Fuera

- Columna izquierda fija en la sesión nativa (imposible en 1.18.35; ver `agents-view.md`).
- Enviar prompts o aprobar permisos desde la vista: el input sigue en la sesión nativa; la vista
  es de lectura.
- App web local de dos paneles y layout tmux (caminos descartados en la pregunta de producto).
- Cambios en `ux-parity.md` (sigue su curso; este modo no toca atajos ni modelos).

## Restricciones

- Sin dependencias nuevas (solo `@opencode-ai/plugin/tui`, `solid-js`, `@opentui/solid` ya
  instalados) y sin tocar `opencode.json` ni los slots del host.
- Colores solo de `api.theme.current`; sin hex fijos. Legible en 80×24 y en los 4 temas.
- Un fallo de lectura (ODD, red, servidor) no puede romper la TUI: se muestra lo cacheado.
- `tui-plugins/` y `tui.json` son manuales: la sincronización no los toca.
- Código y comentarios en inglés; documentos del repo en español.
- Sin commits salvo pedido explícito (el trabajo previo de la vista sigue sin commitear).

## Deuda deliberada

- `shortcut: el hilo de la sesión usa la misma ventana simple con follow que el de subagentes; sin scrollback completo — revisar si la conversación larga pide navegación por saltos.`
- `shortcut: la sección ODD muestra solo la tarea activa (la más reciente con pendientes); sin lista de todas las tareas — revisar si conviven varias tareas.`

## Checklist

- [x] W1 — Lector ODD compartido (`tui-plugins/odd-tasks.ts`) + HUD migrado · Prueba: test del helper + `tests/tui-hud.test.mjs`
- [x] W2 — Vista unificada: fila Sesión, sección ODD y hilo de la sesión en vivo · Prueba: `tests/tui-agents.test.mjs` + captura pty
- [x] W3 — Suite verde · Prueba: `pnpm test`
- [x] W4 — Docs (README, ARCHITECTURE) · Prueba: revisión + `pnpm test`
- [x] W5 — Smoke pty 130×44 y 90×30 · Prueba: capturas + nota de evidencia en este documento

## Evidencia de verificación

- Decisión de producto (2026-10-18): extender la vista `alt+g` como modo unificado (opción
  recomendada elegida por el usuario).
- W1 (2026-10-18): `readOddTasks` vive en `tui-plugins/odd-tasks.ts` (nombre completo; el recorte
  de ancho es de cada consumidor); el HUD lo importa y conserva su comportamiento. `tests/tui-odd-tasks.test.mjs` corre el módulo de verdad sobre directorios temporales (checkboxes, TEMPLATE,
  orden por mtime, refresco por tamaño, sin `odd/tasks`) + asserts estáticos de la extracción.
- W2/W3 (2026-10-18): `kairos-agents.tsx` con la fila Sesión (título, estado, modelo, tokens y
  coste) seleccionada por defecto, sección ODD (tarea activa `n/m`, pendientes con tope 3 y
  `… +N`) y panel derecho con el hilo de la sesión en vivo (mismo camino de fetch/caché que los
  subagentes, con `endedAt` = `time.updated` para no perder el último tramo). `pnpm test` → 164
  tests, 159 pass, 5 skip, 0 fail (incluida privacidad).
- W5 (2026-10-18): smokes reales en pty con `script -qec` sobre una sesión existente del repo
  (`./bin/kairos -c`, `KAIROS_NO_SYNC=1 KAIROS_NO_LOCAL=1`), leídos con el emulador ANSI
  `/tmp/opencode/ansi-screen.mjs` (descartable). Observado:
  - 130×44: cabecera `❀ Agentes · Instrucción: responder solo ok · 0 activos · 0 hechos`; lista
    izquierda con `▸○ Instrucción: responde…  deepseek-v4…`, `Subagentes` (vacío en esa sesión),
    `Agentes` (perfiles primero) y `ODD visual-union · 0/5` con W1/W2/W3 y `… +2`; panel derecho
    con `Instrucción: responder solo ok`, `deepseek-v4.1-flash · 152 tok · $0.00` y el hilo
    (`▸ responde solo: ok` / `ok`). El import relativo `./odd-tasks` carga en el host (la sección
    ODD lo prueba) y el HUD sigue pintando (`◆ ODD visual-union 0/5` en sidebar y junto al prompt).
  - 90×30: una sola columna; `enter` abre el detalle de la Sesión con título, metadatos y hilo.
  - Capturas crudas y frames en `/tmp/opencode/union*.raw` y `/tmp/opencode/union*-frames/`
    (fuera del repositorio).

## Progreso

- 2026-10-18 — Revisión del proyecto y pregunta de producto; documento creado.
- 2026-10-18 — W1–W5 completos: lector ODD compartido, vista unificada, suite verde (164 tests),
  docs al día y smokes en pty (130×44 y 90×30) con capturas. Implementación lista para revisar.

## Siguiente paso

Revisar con el usuario (abrir kairos en una sesión y pulsar `alt+g`) y, si lo pide, preparar los
commits por unidad de trabajo. Quedan como deuda deliberada la ventana simple del hilo y la
sección ODD de una sola tarea.
