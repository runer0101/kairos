# Paridad UX: vista de agentes pulida, cambio de modelo fácil y subagentes DeepSeek

> Documento ODD. Vive en el repositorio del proyecto, en `odd/tasks/ux-parity.md`.
> Se espeja en memoria (tema `kairos/ux-parity`) para poder retomar entre sesiones.

## Objetivo

Cerrar la brecha visual que el usuario todavía percibe frente a gentle-shell y hacer trivial el cambio de modelo de IA:

1. **Vista de agentes (`alt+g`) pulida** hasta el look del overlay de gentle-shell (lista a la izquierda, hilo a la derecha) y más descubrible.
2. **Cambio de modelo fácil**: atajo directo a la lista de modelos, favoritos sembrados y teclas de ciclo, sin editar JSON a mano.
3. **Subagentes en DeepSeek por defecto**: modelo explícito en `opencode.json` para los 10 subagentes.

## Problema

Pedido del usuario (2026-10-18): «quiero que el lado izquierdo tenga las cosas que aparecen en gentle-shell… los subagentes colócalos por defecto DeepSeek y que sea más fácil cambiar de modelo de IA».

Evidencia recogida en el análisis (2026-10-18):

- **Columna fija izquierda: no es posible en OpenCode 1.x.** El `tui.json` no tiene opción de posición de sidebar (verificado en el schema oficial y en `@opencode-ai/plugin` 1.18.35 **y** 1.19.3: los slots del host son `sidebar_title/content/footer`, `session_prompt(_right)`, `home_*`, `app*`; `TuiApp` solo expone `version`). El PR upstream 18497 (`sidebar_position` con `row-reverse`) quedó cerrado para V1 («port it to V2»). Solo sería posible migrando a OpenCode 2 o con un fork compilado del host → decisión de producto con el usuario: **pulir la vista a pantalla completa existente** (lista izquierda), que ya replica el patrón de los overlays de gentle-shell (agentes, cambios, routing).
- La vista existe y está probada (V1–V7 de `agents-view.md`, **sin commitear**), pero el usuario «no está convencido»: falta paridad fina con la captura de referencia `gentle-pi/docs/assets/features/agents-view.png` (1512×812) y hacerla descubrible.
- **Modelos**: favoritos de modelos **vacíos** en `~/.local/state/opencode/model.json` (`"favorite": []`); `model_cycle_favorite` sin atajo por defecto; `model_list` solo en `<leader>m`; `f2` (recientes) ya existe; `ctrl+f` marca favorito. 8 de 10 subagentes heredan el modelo del perfil (solo `gentle-ai-explore` y `jd-judge-b` están fijados).
- `scripts/sync-gentle-shell.mjs` **no toca** `opencode.json`, `tui.json` ni `tui-plugins/` (seguro editar ahí); sí regenera `agents/*.md` (los actos del sync no deben pisarse).

## Decisiones de producto (usuario, 2026-10-18)

- «Lado izquierdo» → **pulir la vista `alt+g`** (opción recomendada); no columna fija ni fork del host.
- «Cambiar de modelo» → **atajos + favoritos** (no vista propia tipo routing; queda como segunda entrega opcional).
- Subagentes → fijar a DeepSeek Flash (explícito), decidido en el pedido.

## Alcance

### Dentro

- **U1 — Auditoría visual en pty**: capturar la vista actual (130×44 y 90×30) y compararla contra la referencia de gentle-shell; anotar brechas concretas (header, filas, chips de modelo/tokens/coste/tiempo, barra de atajos, colores por estado, spacing). Criterio: nota con brechas concretas y capturas.
- **U2 — Pulido de `tui-plugins/kairos-agents.tsx`**: cerrar las brechas de U1 hasta la paridad razonable; sin cambiar las teclas ni el contrato de datos. Criterio: capturas nuevas comparables + `tests/tui-agents.test.mjs` verde.
- **U3 — Descubribilidad**: `alt+g` en los atajos del logo (`tui-plugins/gentle-logo.tsx`) + README. Criterio: captura del home + tests del logo.
- **U4 — Atajos de modelo en `tui.json`**: `model_list` con `alt+m` adicional; `model_cycle_favorite` → `f3` y reverse `shift+f3`. Criterio: test de configuración; verificado en pty que `alt+m` abre la lista.
- **U5 — Sembrador de favoritos**: `scripts/seed-model-favorites.mjs` (idempotente, fusiona sin pisar favoritos existentes, escritura atómica) con lista curada (DeepSeek v4.1 Flash Go, DeepSeek Flash free, y los locales que ya estén en `recent`); llamado desde `install.sh`. Criterio: test con directorio de estado temporal (merge, no pisa, segunda corrida no-op).
- **U6 — Subagentes DeepSeek**: `model` explícito `opencode-go/deepseek-v4.1-flash` en los 10 subagentes de `opencode.json`. Criterio: test de configuración + los agentes siguen apareciendo en `client.app.agents()`.
- **U7 — Docs**: README (vista de agentes descubrible, sección «Cambiar de modelo») y `docs/ARCHITECTURE.md` si hace falta; cerrar este documento con evidencia.

### Fuera

- Columna fija izquierda persistente (requiere OpenCode 2 o fork del host; proyecto aparte) y vista de modelos propia tipo «Profile routing» (segunda entrega opcional).
- Tocar el monitor de terceros (`opencode-subagent-statusline`) o el HUD: conviven sin cambios.
- Subir a OpenCode 1.19.x (fuera del pedido; el README fija 1.18.35).
- Tarjetas inline en la conversación: la API de plugins TUI 1.x no tiene renderer de partes de mensaje (solo slots fijos y rutas).

## Restricciones

- Sin dependencias nuevas (solo `@opencode-ai/plugin/tui`, `solid-js`, `@opentui/solid` ya instalados).
- Colores solo de `api.theme.current`; sin hex fijos. Legible en 80×24 y en los 4 temas.
- La siembra de favoritos es la única escritura fuera del repo: fusionar, preservar lo existente, escritura atómica, y nada si el archivo no existe/no es JSON válido (fallar suave).
- `pnpm test` verde, incluida la prueba de privacidad (sin rutas de la máquina en lo versionado).
- Código y comentarios en inglés; documentos del repo en español.
- Sin commits salvo pedido explícito (convención actual: el trabajo previo sigue sin commitear).

## Deuda deliberada

- `shortcut: la siembra de favoritos es una lista curada estática; si el usuario cambia de proveedores, se edita el script — revisar si conviene un archivo de configuración.`

## Checklist

Cada tarea tiene ID estable, criterio de aceptación observable y prueba.

- [ ] U1 — Auditoría visual en pty · Criterio: nota con brechas concretas (con captura 130×44 y 90×30) · Prueba: capturas pty + lectura comparada con la referencia
- [ ] U2 — Pulido de la vista de agentes · Criterio: paridad razonable con la referencia (header, filas, chips, hints, colores) · Prueba: capturas pty nuevas + `tests/tui-agents.test.mjs`
- [ ] U3 — `alt+g` en los atajos del logo · Criterio: el home muestra el atajo; README lo explica · Prueba: `tests/tui-logo.test.mjs` + captura del home
- [ ] U4 — Atajos de modelo (`alt+m`, `f3`, `shift+f3`) · Criterio: `alt+m` abre la lista de modelos en la TUI real · Prueba: test de configuración + pty
- [ ] U5 — Sembrador de favoritos + `install.sh` · Criterio: fusiona sin pisar; segunda corrida no-op; archivo inválido no rompe · Prueba: test con estado temporal
- [ ] U6 — Subagentes a DeepSeek · Criterio: los 10 subagentes con `model` explícito en `opencode.json` · Prueba: test de configuración
- [ ] U7 — Docs y cierre · Criterio: README/ARCHITECTURE al día; documento cerrado con evidencia · Prueba: revisión + `pnpm test`

## Evidencia de verificación

- Análisis 2026-10-18: schema `tui.json` (opencode.ai) sin `sidebar_position`; `@opencode-ai/plugin` 1.19.3 con los mismos slots que 1.18.35; PR 18497 cerrado para V1; `~/.local/state/opencode/model.json` con `"favorite": []`; `scripts/sync-gentle-shell.mjs` no toca `opencode.json`/`tui.json`; atajos por defecto de `tui.json` (docs oficiales): `model_list` `<leader>m`, `model_cycle_recent` `f2`, `model_favorite_toggle` `ctrl+f`, `model_cycle_favorite` `none`.
- (U1–U7) se completa durante la implementación.

## Progreso

- 2026-10-18 — Análisis del proyecto y del host; decisiones de producto con el usuario (pulir `alt+g`; atajos + favoritos; subagentes DeepSeek). Documento creado.

## Siguiente paso

Implementar U1–U7 en orden; empezar por la auditoría visual (U1) para no pulir a ciegas.
