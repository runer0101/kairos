# Renombre completo a Kairos (`opencode-venjix` → `kairos`)

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
- [x] R2 — Archivos renombrados · Criterio: `bin/kairos` y `themes/gentleman-kairos.json` con historia de git · Prueba: `git status` (R/RM)
- [x] R3 — Alias `kai` e `install.sh` actualizados (enlace, mensajes, perfiles de verificación) · Prueba: `pnpm test` (launcher)
- [x] R4 — Generados al día con el nombre nuevo · Criterio: sin diferencias contra el staging del sync · Prueba: `node scripts/sync-gentle-shell.mjs --check` → «al día» (sin necesidad de `--force`)
- [x] R5 — Suite verde · Prueba: `pnpm test` → 58 tests, 54 pasan, 0 fallan, 4 omitidos
- [x] R6 — Instalación migrada (`~/.config/kairos`, symlinks `kairos`/`kai`, temas y share) · Prueba: `kai --where` resuelve la ruta nueva; `install.sh` EXIT 0
- [x] R7 — GitHub recreado desde cero (`runer0101/kairos`): descripción y topics conservados, historia completa subida desde el primer commit y repositorio anterior eliminado · Prueba: `git ls-remote` + `gh repo view`
- [x] R8 — rc del shell y memoria sin referencias viejas · Prueba: `.zshrc` actualizado; script de publicación renombrado a `publicar-kairos.sh`

## Evidencia de verificación

- R1: `git grep -il venjix` → solo los documentos de tarea (`post-port-hardening.md` histórico y `rename-to-kairos.md` de transición); 0 menciones en código, docs vigentes y configuración.
- R2: `git status` muestra `RM bin/opencode-venjix -> bin/kairos` y `R themes/gentleman-venjix.json -> themes/gentleman-kairos.json`.
- R3/R5: `node --experimental-strip-types --test tests/*.test.mjs` → 58 tests, 54 pass, 0 fail, 4 skipped (E2E opt-in).
- R4: `sync --check` → «al día (gentle-shell 4.2.0-1.2.0, gentle-pi 4.2.0)»; el sed quedó byte a byte igual al staging regenerado.
- Diff total del renombre: 40 archivos de contenido (≈190 líneas) + 2 renombrados por git.
- R7: repositorio recreado desde cero (`gh repo create runer0101/kairos --public`, descripción y 6 topics; `git push -u origin main` con la historia completa desde el primer commit) y repositorio anterior eliminado con `gh repo delete`; respaldo espejo del remoto previo tomado antes de borrar. El nombre intermedio `opencode-kairos` se descartó a pedido del autor: la publicación final va sin prefijo.
- Commits de la tarea: `02ee15f` (regla de idioma), `5967f84` (renombre), `e6d10c9` (registro R7), `09a6de4` (Kairos sin prefijo) y los de la migración local (R6/R8); identidad `runer0101 <203803429+runer0101@users.noreply.github.com>`, sin coautores.
- R6: clon local alineado por fast-forward a `09a6de4`; carpetas renombradas (`~/.config/kairos` y `entorno/kairos`); symlinks `kairos`/`kai` recreados y temas re-enlazados por `install.sh` (EXIT 0); symlink roto del tema viejo retirado; `kai --where` resuelve la ruta nueva.
- R8: `.zshrc` sin referencias viejas; script externo renombrado a `publicar-kairos.sh` con rutas nuevas; `opencode.json` adopta el formato del ajustador del instalador (corridas idempotentes).

## Progreso

- 2026-10-15 — Tarea creada a pedido del usuario tras consulta mitológica. Decisión: corte limpio (sin alias ni variables heredadas; si hiciera falta, una línea reintroduce compatibilidad). Mitología corregida: Kairos = hijo menor de Zeus y contraparte de Chronos; no es hermano de Cronos (que es el Titán padre de Zeus).
- 2026-10-15 — R1–R5 completos y verificados. Pendientes: R6 (instalación) y R8 (rc/memoria).
- 2026-10-15 — R7 completo (decisión del autor: recrear el repositorio en vez de renombrarlo): repo `runer0101/kairos` creado desde cero, historia completa subida (desde el primer commit) y repositorio anterior eliminado.
- 2026-10-15 — Ajuste del autor: el nombre queda «Kairos» a secas (sin prefijo `opencode-`): repo `runer0101/kairos`, paquete `kairos`, comando `bin/kairos`, ruta `~/.config/kairos`, share y variables `KAIROS_*`; el repositorio intermedio se recreó con el nombre final.
- 2026-10-15 — R6/R8 completos: migración local integral (clon alineado, carpetas nuevas, symlinks y temas, instalador re-ejecutado, `.zshrc`, script `publicar-kairos.sh`); publicación con el flujo oficial.

## Siguiente paso

Nada pendiente de este renombre: tarea completa. El endurecimiento posterior (T5–T10) sigue en `odd/tasks/post-port-hardening.md`.
