# Renombre completo a Kairos (`opencode-venjix` → `opencode-kairos`)

> Documento ODD. Vive en el repositorio del proyecto, en `odd/tasks/rename-to-kairos.md`.
> Se espeja en memoria (tema `odd/rename-to-kairos/tasks`) para poder retomar entre sesiones.

## Objetivo

Renombrar el proyecto completo — repo, perfiles, alias, variables, rutas, tema, sonidos y documentos vigentes — de «venjix» a «kairos», con migración de la instalación local y sin referencias huérfanas.

## Problema

El nombre actual (Venjix: un villano de Power Rangers) no encaja con el destino público del proyecto. Medido antes del cambio: 41 archivos y 209 líneas con «venjix», 6 variables `OPENCODE_VENJIX_*` y superficies de instalación (ruta canónica, lanzador, alias, tema, pack de sonidos, texto del logo).

## Por qué

Pedido del usuario (2026-10-15). Kairos — el momento oportuno; en la tradición, el hijo más joven de Zeus (hermano de Apolo, Dioniso y Hermes) y contraparte de Chronos — le calza a un orquestador que elige cuándo actuar. La ventana más barata es ahora: repo público pero joven, sin releases, y el hardening pendiente (T5–T10 del documento anterior) todavía no fijó nombres nuevos.

## Alcance

### Dentro
- Contenido y nombres de archivo del repo.
- Regeneración de los archivos gestionados por el sync (nota de runtime incluida).
- Documentos vigentes (README, ARCHITECTURE, SECURITY, CI, odd/README).
- Migración de la instalación local (ruta, symlinks, comentarios del rc).
- GitHub: renombre del repositorio, remoto y URLs.
- Memoria (Engram): la clave de proyecto cambia con el remoto.

### Fuera
- Historia: los documentos ODD y la evidencia pasada conservan los nombres de época.
- Push: los commits los publica el autor.

## Restricciones

- Gestor único pnpm; nada de npm.
- No romper la transaccionalidad del sync ni la idempotencia de `install.sh`.
- Sin datos personales ni rutas de la máquina en archivos versionados.
- `pnpm test` verde al cierre.

## Checklist

Cada tarea tiene ID estable, criterio de aceptación observable y prueba.

- [x] R1 — Contenido del repo renombrado · Criterio: las únicas menciones de «venjix» viven en los documentos de tarea (transición e historia) · Prueba: `git grep -il venjix` → solo `odd/tasks/post-port-hardening.md` y `odd/tasks/rename-to-kairos.md`
- [x] R2 — Archivos renombrados · Criterio: `bin/opencode-kairos` y `themes/gentleman-kairos.json` con historia de git · Prueba: `git status` (R/RM)
- [x] R3 — Alias `kai` e `install.sh` actualizados (enlace, mensajes, perfiles de verificación) · Prueba: `pnpm test` (launcher)
- [x] R4 — Generados al día con el nombre nuevo · Criterio: sin diferencias contra el staging del sync · Prueba: `node scripts/sync-gentle-shell.mjs --check` → «al día» (sin necesidad de `--force`)
- [x] R5 — Suite verde · Prueba: `pnpm test` → 58 tests, 54 pasan, 0 fallan, 4 omitidos
- [ ] R6 — Instalación migrada (`~/.config/opencode-kairos`, symlinks `opencode-kairos`/`kai`, temas y share) · Prueba: `kai --where`
- [ ] R7 — GitHub renombrado (`runer0101/opencode-kairos`), remoto y URLs operativas · Prueba: `git ls-remote`
- [ ] R8 — rc del shell y memoria sin referencias viejas · Prueba: revisión + `mem_list_projects`

## Evidencia de verificación

- R1: `git grep -il venjix` → solo los documentos de tarea (`post-port-hardening.md` histórico y `rename-to-kairos.md` de transición); 0 menciones en código, docs vigentes y configuración.
- R2: `git status` muestra `RM bin/opencode-venjix -> bin/opencode-kairos` y `R themes/gentleman-venjix.json -> themes/gentleman-kairos.json`.
- R3/R5: `node --experimental-strip-types --test tests/*.test.mjs` → 58 tests, 54 pass, 0 fail, 4 skipped (E2E opt-in).
- R4: `sync --check` → «al día (gentle-shell 4.2.0-1.2.0, gentle-pi 4.2.0)»; el sed quedó byte a byte igual al staging regenerado.
- Diff total del renombre: 40 archivos de contenido (≈190 líneas) + 2 renombrados por git.

## Progreso

- 2026-10-15 — Tarea creada a pedido del usuario tras consulta mitológica. Decisión: corte limpio (sin alias ni variables heredadas; si hiciera falta, una línea reintroduce compatibilidad). Mitología corregida: Kairos = hijo menor de Zeus y contraparte de Chronos; no es hermano de Cronos (que es el Titán padre de Zeus).
- 2026-10-15 — R1–R5 completos y verificados. Pendientes: R6 (instalación), R7 (GitHub), R8 (rc/memoria).

## Siguiente paso

Migrar la instalación (R6): renombrar `~/.config/opencode-venjix` → `~/.config/opencode-kairos`, actualizar symlinks (`opencode-kairos`, `kai`) y reabrir la TUI con el nombre nuevo (coordinar el reinicio).
