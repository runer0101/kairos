# Endurecimiento post-port (opencode-venjix)

> Documento ODD. Vive en `odd/tasks/post-port-hardening.md`.
> Se espeja en memoria (tema `odd/post-port-hardening/tasks`).

## Objetivo

Cerrar los huecos detectados tras portar gentle-shell: un bug vivo en la TUI, documentación desactualizada, un test que no prueba nada, dependencias sin alinear con el runtime y falta de CI, desinstalación y pruebas multi-distro.

## Problema

Reconocimiento (solo lectura) sobre `main` en 6f9cc2b:

- `tui-plugins/gentle-logo.tsx:60` usa `compactArt` sin definir: con terminales de menos de 45 columnas o 27 filas, el home de la TUI lanza `ReferenceError`.
- `@opencode-ai/plugin` fijado en 1.16.2 (`package.json:16`) con runtime 1.18.x (`README.md:24`, `docs/ARCHITECTURE.md:15`).
- Docs desactualizadas: `README.md:165` (dice 30 pruebas; hay 34), `docs/ARCHITECTURE.md:181` (dice 3 comandos `/gentle:*`; hay 4), `docs/ARCHITECTURE.md:184` (dice que no hay suite de pruebas), `scripts/sync-gentle-shell.mjs:12` (menciona `LEEME.md`, inexistente), `README.md:224` y `docs/ARCHITECTURE.md:111` (usan `npm audit signatures`; el proyecto va solo con pnpm).
- `tests/config.test.mjs:71-75`: la aserción de rutas absolutas es siempre verdadera por precedencia de operadores; no protege nada.
- Sin CI (no hay `.github/`), sin `install.sh --uninstall`, y el instalador de OpenCode se ejecuta con `curl | bash` sin fijar versión (`install.sh:197,199`).
- La sincronización no tiene modo de solo-verificación (`--check`).

## Por qué

El port se entregó sin CI y sin pruebas de TUI; hay un crash latente en terminales pequeñas, números que no cuadran en docs y flujo de desinstalación inexistente. Antes de compartirlo con más gente conviene cerrarlo.

## Alcance

### Dentro

- Bugs: `compactArt` del logo; test vacuo de configuración.
- Alineación de `@opencode-ai/plugin` con el runtime instalado (1.18.35).
- Robustez: `sync --check`, `install.sh --uninstall`, pin de versión de OpenCode en el instalador, CI con tests + shellcheck.
- Docs: coherencia, QUICKSTART, SECURITY.md, comentario de `LEEME.md`.
- Scripts de matriz multi-distro (contenedores) y smoke de TUI (pty/tmux).

### Fuera

- Licencia del repositorio (decisión del autor).
- RDD, Herdr y paneles de la TUI de Pi (dependen de su API).
- macOS y Windows.

## Restricciones

- Gestor único: pnpm 11.22.0. Nada de npm en scripts, CI ni docs.
- Commits sin coautor; sin push (los publica el autor).
- El instalador oficial de OpenCode queda fijado por versión; el riesgo residual (sin SHA-256 propio) se documenta en SECURITY.md.
- No romper la idempotencia de `install.sh` ni la transaccionalidad de la sincronización.

## Checklist

Cada tarea tiene ID estable, criterio de aceptación observable y prueba.

- [x] T1 — Arte compacto del logo · Criterio: `compactArt` definido, por debajo de los umbrales del logo grande, y la TUI abre en pty 40×12 sin `ReferenceError` · Prueba: `pnpm test` + smoke de TUI
- [x] T2 — Test de rutas absolutas · Criterio: falla con una ruta no permitida y pasa con la configuración real · Prueba: `pnpm test`
- [x] T3 — Plugin alineado · Criterio: `@opencode-ai/plugin` 1.18.35 en `package.json` y lockfile; `pnpm install --frozen-lockfile` reproducible · Prueba: `pnpm test`
- [x] T4 — sync `--check` · Criterio: informa sin escribir; el marcador no cambia · Prueba: `pnpm test`
- [ ] T5 — `install.sh --uninstall` · Criterio: retira solo enlaces que apuntan al repo y conserva datos · Prueba: ejecución con HOME temporal
- [ ] T6 — Pin de OpenCode · Criterio: instalador usa `--version` fijada (override por env) y no toca el PATH del usuario · Prueba: `bash -n` + ejecución limpia
- [ ] T7 — SECURITY.md + verificador de políticas · Criterio: `pnpm check:policies` informa sin npm · Prueba: `node scripts/check-trust-policies.mjs`
- [ ] T8 — CI · Criterio: workflow con tests + shellcheck en push/PR · Prueba: shellcheck local sobre `install.sh`
- [ ] T9 — Docs coherentes + QUICKSTART · Criterio: números reales; QUICKSTART cubre instalación, perfiles, memoria y rollback · Prueba: revisión
- [ ] T10 — Matriz multi-distro + smoke TUI · Criterio: scripts ejecutables y al menos una corrida registrada (local o CI manual) · Prueba: `tests/container-install-test.sh ubuntu`
- [x] T11 — Interruptor de IA local por máquina (añadida después del plan) · Criterio: `.no-local-ai` o `OPENCODE_VENJIX_NO_LOCAL=1` evitan la detección sin tocar el repo; sin interruptor se mantiene · Prueba: `pnpm test` (tests/launcher.test.mjs)
- [x] T12 — Modelo único DeepSeek v4.1 Flash (pedida por el usuario, después del plan) · Criterio: `model`, `small_model` y todos los agentes de `opencode.json` usan `opencode-go/deepseek-v4.1-flash`; docs y pruebas coherentes · Prueba: `pnpm test` + comprobación en vivo

## Evidencia de verificación

- Baseline: `pnpm test` → 34 tests, 30 pass, 4 skipped (E2E), 0 fail.
- T1: `fe93bfa` — `pnpm test` → 39 tests, 35 pass, 4 skipped, 0 fail. Smoke real en pty 40×12 (`script -qec "stty rows 12 cols 40; ./bin/opencode-venjix"`): la TUI abre, pinta el arte compacto (`/_/    \_\`) y sale con 0; sin `ReferenceError` en la captura.
- T11: `tests/launcher.test.mjs` traza el lanzador con `bash -x` y comprueba que el detector no se invoca con el interruptor ni con el marcador, y sí sin ellos.
- T2: validador único `validateAbsolutePaths` + caso negativo "una ruta absoluta no permitida se detecta" (falla con `/tmp/opencode`, pasa con la config real). `pnpm test` → 40 tests, 36 pass, 4 skipped, 0 fail.
- T3: `@opencode-ai/plugin` 1.16.2 → 1.18.35 (coincide con el runtime). La política de confianza marcó `effect@4.0.0-beta.83` (transitiva nueva): atestación de publicación y procedencia SLSA verificadas contra el registro (digest sha512 coincide; origen `Effect-TS/effect-smol`, `.github/workflows/release.yml`); exclusión estrecha actualizada de beta.74 a beta.83 en `pnpm-workspace.yaml` y README. `pnpm install --frozen-lockfile` → "Already up to date"; `pnpm test` → 40/36/4/0.
- T4: `--check` compara el staging contra el repo y la versión del marcador; `tests/sync.test.mjs` verifica "al día" (exit 0) en el repo real sin cambiar marcador ni archivos, y "cambios pendientes" (exit 1) en un repo temporal vacío sin escribir nada. `pnpm test` → 42 tests, 38 pass, 4 skipped, 0 fail.
- T12: `opencode.json` con `opencode-go/deepseek-v4.1-flash` en `model`, `small_model`, los tres perfiles, `gentle-ai-explore` y `jd-judge-b`; README y ARCHITECTURE actualizados; pruebas de configuración ajustadas (los tres perfiles usan el mismo modelo; el juez B pierde su modelo distinto). Comprobación en vivo: `opencode-venjix run "responde solo la palabra: ok"` → "ok" con cabecera `venjix · deepseek-v4.1-flash`.

## Progreso

- 2026-10-14 — reconocimiento y plan; documento creado.
- 2026-10-15 — T1: fix de `compactArt` (`fe93bfa`) + prueba estática y smoke real en pty 40×12.
- 2026-10-15 — T11: interruptor de IA local por máquina (lanzador, `.gitignore`, README y pruebas del lanzador).
- 2026-10-15 — T2: validador de rutas absolutas con caso negativo.
- 2026-10-15 — T3: plugin alineado a 1.18.35; exclusión de `effect` revisada y verificada (beta.83).
- 2026-10-15 — T4: `--check` de solo-verificación con pruebas. Commits de la sesión: `dadf730` (T11), `6e28a29` (T3), `a8ed996` (T2), `1b7d28d` (T4); sin coautor, sin push.
- 2026-10-15 — T12 (pedido del usuario): todos los perfiles, agentes y subagentes por defecto con DeepSeek v4.1 Flash (`91d69d9`). `jd-judge-b` pierde su modelo distinto; `venjix-deep` comparte modelo con `venjix`.

## Siguiente paso

- T5: `install.sh --uninstall` (retira solo enlaces que apuntan al repo, conserva datos; prueba con HOME temporal).
