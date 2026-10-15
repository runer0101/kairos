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

- [ ] T1 — Arte compacto del logo · Criterio: `compactArt` definido, por debajo de los umbrales del logo grande, y la TUI abre en pty 40×12 sin `ReferenceError` · Prueba: `pnpm test` + smoke de TUI
- [ ] T2 — Test de rutas absolutas · Criterio: falla con una ruta no permitida y pasa con la configuración real · Prueba: `pnpm test`
- [ ] T3 — Plugin alineado · Criterio: `@opencode-ai/plugin` 1.18.35 en `package.json` y lockfile; `pnpm install --frozen-lockfile` reproducible · Prueba: `pnpm test`
- [ ] T4 — sync `--check` · Criterio: informa sin escribir; el marcador no cambia · Prueba: `pnpm test`
- [ ] T5 — `install.sh --uninstall` · Criterio: retira solo enlaces que apuntan al repo y conserva datos · Prueba: ejecución con HOME temporal
- [ ] T6 — Pin de OpenCode · Criterio: instalador usa `--version` fijada (override por env) y no toca el PATH del usuario · Prueba: `bash -n` + ejecución limpia
- [ ] T7 — SECURITY.md + verificador de políticas · Criterio: `pnpm check:policies` informa sin npm · Prueba: `node scripts/check-trust-policies.mjs`
- [ ] T8 — CI · Criterio: workflow con tests + shellcheck en push/PR · Prueba: shellcheck local sobre `install.sh`
- [ ] T9 — Docs coherentes + QUICKSTART · Criterio: números reales; QUICKSTART cubre instalación, perfiles, memoria y rollback · Prueba: revisión
- [ ] T10 — Matriz multi-distro + smoke TUI · Criterio: scripts ejecutables y al menos una corrida registrada (local o CI manual) · Prueba: `tests/container-install-test.sh ubuntu`

## Evidencia de verificación

- Baseline: `pnpm test` → 34 tests, 30 pass, 4 skipped (E2E), 0 fail.
- (se completa por tarea)

## Progreso

- 2026-10-14 — reconocimiento y plan; documento creado.

## Siguiente paso

- T1: prueba del logo en rojo (`tests/tui-logo.test.mjs`) y fix de `compactArt`.
