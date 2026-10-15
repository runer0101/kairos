# Endurecimiento post-port (opencode-venjix)

> Documento ODD. Vive en `odd/tasks/post-port-hardening.md`.
> Se espeja en memoria (tema `odd/post-port-hardening/tasks`).

## Objetivo

Cerrar los huecos detectados tras portar gentle-shell: un bug vivo en la TUI, documentación desactualizada, un test que no prueba nada, dependencias sin alinear con el runtime y falta de CI, desinstalación y pruebas multi-distro.

## Problema

Reconocimiento (solo lectura) sobre `main` en efaea4b:

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

- Licencia del repositorio (resuelta el 2026-10-15: MIT; ver T21).
- RDD, Herdr y paneles de la TUI de Pi (dependen de su API).
- macOS y Windows.

## Restricciones

- Gestor único: pnpm 11.22.0. Nada de npm en scripts, CI ni docs.
- Commits sin coautor; sin push (los publica el autor).
- El instalador oficial de OpenCode queda fijado por versión; el riesgo residual (sin SHA-256 propio) se documenta en SECURITY.md.
- No romper la idempotencia de `install.sh` ni la transaccionalidad de la sincronización.
- Sin datos personales ni rutas de la máquina en archivos versionados: `tests/privacy.test.mjs` lo verifica, y el instalador y el sync no deben introducirlos.

## Checklist

Cada tarea tiene ID estable, criterio de aceptación observable y prueba.

- [x] T1 — Arte compacto del logo · Criterio: `compactArt` definido, por debajo de los umbrales del logo grande, y la TUI abre en pty 40×12 sin `ReferenceError` · Prueba: `pnpm test` + smoke de TUI
- [x] T2 — Test de rutas absolutas · Criterio: falla con una ruta no permitida y pasa con la configuración real · Prueba: `pnpm test`
- [x] T3 — Plugin alineado · Criterio: `@opencode-ai/plugin` 1.18.35 en `package.json` y lockfile; `pnpm install --frozen-lockfile` reproducible · Prueba: `pnpm test`
- [x] T4 — sync `--check` · Criterio: informa sin escribir; el marcador no cambia · Prueba: `pnpm test`
- [ ] T5 — `install.sh --uninstall` · Criterio: retira solo enlaces que apuntan al repo y conserva datos · Prueba: ejecución con HOME temporal
- [ ] T6 — Pin de OpenCode · Criterio: instalador usa `--version` fijada (override por env) y no toca el PATH del usuario · Prueba: `bash -n` + ejecución limpia
- [ ] T7 — SECURITY.md + verificador de políticas · Criterio: `pnpm check:policies` informa sin npm · Prueba: `node scripts/check-trust-policies.mjs`
- [x] T8 — CI · Criterio: workflow con tests + shellcheck en push/PR · Prueba: run `38688720308` del 2026-10-15 (tests 18 s, shellcheck 7 s, ambos verdes)
- [ ] T9 — Docs coherentes + QUICKSTART · Criterio: números reales; QUICKSTART cubre instalación, perfiles, memoria y rollback · Prueba: revisión
- [ ] T10 — Matriz multi-distro + smoke TUI · Criterio: scripts ejecutables y al menos una corrida registrada (local o CI manual) · Prueba: `tests/container-install-test.sh ubuntu`
- [x] T11 — Interruptor de IA local por máquina (añadida después del plan) · Criterio: `.no-local-ai` o `OPENCODE_VENJIX_NO_LOCAL=1` evitan la detección sin tocar el repo; sin interruptor se mantiene · Prueba: `pnpm test` (tests/launcher.test.mjs)
- [x] T12 — Modelo único DeepSeek v4.1 Flash (pedida por el usuario, después del plan) · Criterio: `model`, `small_model` y todos los agentes de `opencode.json` usan `opencode-go/deepseek-v4.1-flash`; docs y pruebas coherentes · Prueba: `pnpm test` + comprobación en vivo
- [x] T13 — Repo publicable sin datos personales (pedida por el usuario, después del plan) · Criterio: archivos versionados sin rutas de hogar ni correos; el instalador y el sync no materializan rutas · Prueba: `pnpm test` (privacy) + `install.sh` idempotente sin cambios
- [x] T14 — Temas de gentle-shell portados (pedida por el usuario, después del plan) · Criterio: los tres temas de `gentle-pi` (Gentle, Gentleman-Cute, Gentleman-Sexy) convertidos al formato de OpenCode, enlazados por `install.sh` y validados · Prueba: `pnpm test` (tests/themes.test.mjs) + smoke de TUI con `gentleman-sexy`
- [x] T15 — Sonidos y logo personal (pedida por el usuario, después del plan) · Criterio: los 3 tonos portados con atribución y apagados por defecto (`OPENCODE_VENJIX_SOUNDS=1`); texto del logo configurable (`OPENCODE_VENJIX_LOGO_TEXT`, por defecto `venjix`) · Prueba: `pnpm test` (sounds + tui-logo) + smoke de TUI
- [x] T16 — Selector de perfiles simplificado (pedida por el usuario, después del plan) · Criterio: `build`/`plan` desactivados, `venjix-deep` retirado y `venjix-yolo` renombrado a `venjix-auto`; solo `venjix` y `venjix-auto` visibles en el selector · Prueba: `pnpm test` + `opencode agent list`
- [x] T17 — Alias corto `ov` (pedida por el usuario, después del plan) · Criterio: `install.sh` crea `~/.local/bin/ov` → lanzador y `ov` funciona en cualquier shell · Prueba: `pnpm test` (launcher) + `ov --where`
- [x] T18 — Seguridad: rutas sensibles + SECURITY.md (elegida por el usuario, después del plan) · Criterio: credenciales bloqueadas en todos los perfiles (incluido `venjix-auto` y vía bash); `.env`/`.pem` con confirmación en el perfil normal; modelo de seguridad documentado · Prueba: `pnpm test` (sensitive-paths) + verificación en vivo con señuelos
- [x] T19 — Separación local/público (elegida por el usuario, después del plan) · Criterio: clon de publicación aparte con origin a GitHub, repo local sin remoto (imposible push accidental) y script de publicación que verifica privacidad antes de subir · Prueba: primer push al remoto con CI verde + `publicar-opencode-venjix.sh` en seco (hashes reescritos después, ver T20)
- [x] T20 — Historia limpia y repositorio público (elegida por el usuario, después del plan) · Criterio: ningún commit con rutas de la máquina ni correos; repositorio público; README profesional · Prueba: escaneo de los 47 commits de `main` + `gh repo view`
- [x] T21 — Licencia MIT y README final (pedida por el usuario, después del plan) · Criterio: `LICENSE` MIT en la raíz, badge de licencia y sección de créditos coherente; README con pasada profesional (contribuir, estado, correcciones) · Prueba: `pnpm test` + revisión del README
- [x] T22 — Visual nativo: pack de sonidos y pie de inicio (elegida por el usuario, después del plan) · Criterio: los tonos se integran con el sistema de atención nativo de OpenCode (pack `venjix`) y la pantalla de inicio muestra un pie con atajos · Prueba: `pnpm test` + smoke de TUI
- [x] T23 — Arranque rápido de `ov` (reportado por el usuario) · Criterio: identificar la causa del arranque lento y corregirla · Prueba: TTFD oficial antes/después (10.005 ms → 4.889 ms)
- [x] T24 — Instalación en un comando y pnpm asegurado en el repo público (pedida por el usuario) · Criterio: `curl | bash` clona y configura solo; el repo público mantiene pnpm (lock, workspace, packageManager, sin package-lock) · Prueba: `pnpm test` + bootstrap probado con stub de git + verificación del repo público

## Evidencia de verificación

- Baseline: `pnpm test` → 34 tests, 30 pass, 4 skipped (E2E), 0 fail.
- T1: `f555f51` — `pnpm test` → 39 tests, 35 pass, 4 skipped, 0 fail. Smoke real en pty 40×12 (`script -qec "stty rows 12 cols 40; ./bin/opencode-venjix"`): la TUI abre, pinta el arte compacto (`/_/    \_\`) y sale con 0; sin `ReferenceError` en la captura.
- T11: `tests/launcher.test.mjs` traza el lanzador con `bash -x` y comprueba que el detector no se invoca con el interruptor ni con el marcador, y sí sin ellos.
- T2: validador único `validateAbsolutePaths` + caso negativo "una ruta absoluta no permitida se detecta" (falla con `/tmp/opencode`, pasa con la config real). `pnpm test` → 40 tests, 36 pass, 4 skipped, 0 fail.
- T3: `@opencode-ai/plugin` 1.16.2 → 1.18.35 (coincide con el runtime). La política de confianza marcó `effect@4.0.0-beta.83` (transitiva nueva): atestación de publicación y procedencia SLSA verificadas contra el registro (digest sha512 coincide; origen `Effect-TS/effect-smol`, `.github/workflows/release.yml`); exclusión estrecha actualizada de beta.74 a beta.83 en `pnpm-workspace.yaml` y README. `pnpm install --frozen-lockfile` → "Already up to date"; `pnpm test` → 40/36/4/0.
- T4: `--check` compara el staging contra el repo y la versión del marcador; `tests/sync.test.mjs` verifica "al día" (exit 0) en el repo real sin cambiar marcador ni archivos, y "cambios pendientes" (exit 1) en un repo temporal vacío sin escribir nada. `pnpm test` → 42 tests, 38 pass, 4 skipped, 0 fail.
- T12: `opencode.json` con `opencode-go/deepseek-v4.1-flash` en `model`, `small_model`, los tres perfiles, `gentle-ai-explore` y `jd-judge-b`; README y ARCHITECTURE actualizados; pruebas de configuración ajustadas (los tres perfiles usan el mismo modelo; el juez B pierde su modelo distinto). Comprobación en vivo: `opencode-venjix run "responde solo la palabra: ok"` → "ok" con cabecera `venjix · deepseek-v4.1-flash`.
- T13: rutas portables (`tui.json` con ruta relativa, engram `{env:HOME}/...`, gentle-assets `$OPENCODE_CONFIG_DIR`); `install.sh` ya no reescribe archivos rastreados (dos corridas idempotentes sin cambios); smoke de TUI 40×12 desde otro cwd carga el logo compacto; engram conecta en vivo (`mem_list_projects` → 4). El test de rutas absolutas pasó a exigir cero rutas absolutas en `opencode.json`. Resuelto el mismo día: la autoría de todos los commits quedó en el noreply de GitHub y la historia completa se reescribió para eliminar las rutas de la máquina antes de publicar el repositorio.
- T14: `themes/gentle.json`, `themes/gentleman-cute.json` y `themes/gentleman-sexy.json` (vars+colors de Pi → defs+theme de OpenCode, mismo juego de claves que `gentleman`); `install.sh` enlaza todos los temas; `pnpm test` → 47 tests, 43 pass, 4 skipped, 0 fail; smoke real: con `theme: gentleman-sexy` la TUI pinta el fondo `#060407` (ausente el de `gentleman`) y sale sin errores.
- T15: tema por defecto renombrado a `gentleman-venjix` (el enlace viejo se retira solo en `install.sh`); `assets/sounds/{success,error,attention}.wav` + `LICENSE.md` portados con su atribución; el plugin reproduce en `session.idle`/`session.error`/`permission.asked|question.asked` (paplay→pw-play→aplay; macOS afplay) solo con `OPENCODE_VENJIX_SOUNDS=1`; el logo pinta `LOGO_TEXT` (env `OPENCODE_VENJIX_LOGO_TEXT`, por defecto `venjix`). `pnpm test` → 50 tests, 46 pass, 4 skipped, 0 fail; smoke real: tema renombrado pinta su fondo y `OPENCODE_VENJIX_LOGO_TEXT=personalizado` aparece en la captura.
- T16: `opencode.json` con `build`/`plan` en `disable: true`, sin `venjix-deep` y con `venjix-auto` (antes `venjix-yolo`); README, ARCHITECTURE, `install.sh` (verifica ambos perfiles) y el comando `/gentle-usage` actualizados. `pnpm test` → 51 tests, 47 pass, 4 skipped, 0 fail; `opencode agent list` → solo `venjix` y `venjix-auto` como primarios visibles; `install.sh` completo pasa su verificación.
- T17: enlace `~/.local/bin/ov` → lanzador creado por `install.sh` (verificado: `ov --where` resuelve el repo; `command -v ov` en zsh); el lanzador y el README lo documentan; `pnpm test` → 52 tests, 48 pass, 4 skipped, 0 fail.
- T18: capa doble — `permission.read` con `deny`/`ask` (config) + piso inviolable en el plugin (`SENSITIVE_PATH`: `.ssh`, `.gnupg`, `.aws`, `.git-credentials`, `.netrc`, claves `id_*`, `auth.json`; aplica a herramientas de archivo y a comandos bash que las referencien); `SECURITY.md` con modelo, límites y cómo ajustarlo. En vivo con señuelos: perfil normal → read SSH bloqueado por el plugin, `.env` auto-rechazado por la regla `ask`, archivo de control leído; `venjix-auto` → read y `cat` bloqueados igual; `.env` legible en auto (por diseño, documentado en límites). `pnpm test` → 56 tests, 52 pass, 4 skipped, 0 fail.
- T8: `.github/workflows/ci.yml` con dos jobs en push/PR: `tests` (Node 24, pnpm 11.22.0, lockfile congelado, `pnpm test`) y `shellcheck --severity=error` sobre `install.sh` y `bin/opencode-venjix`. Primer run: `38688720308` ✓ (tests 18 s, shellcheck 7 s).
- T19: repo local sin remoto (imposible un push accidental desde la máquina); clon de publicación aparte con `origin` a GitHub; script `publicar-opencode-venjix.sh` (fuera de ambos repos) que exige árbol limpio, corre la prueba de privacidad y exporta solo archivos versionados antes de commitear y subir. Verificado en seco ("al día") y con el primer push real (después reescrito por T20) que dejó el CI verde.
- T20: reescritura completa de la historia (47 commits) reemplazando `/home/runer` por `$HOME` en todo el contenido; verificado: 0 ocurrencias en todo `main` y solo queda el usuario público `runer0101`; force push del clon de publicación; visibilidad del repositorio cambiada a pública; README reestructurado (badge de CI, índice, logo ASCII, agradecimientos); refs de respaldo locales purgadas y objetos antiguos recolectados con `git gc` (local y clon público).
- T21: `LICENSE` MIT (© 2026 runer0101) en la raíz; README con badge de licencia y de Node, nota de estado activo, sección «Contribuir», corrección de «Qué no incluye» (los sonidos sí están) y créditos actualizados; la nota de licencia sin definir quedó retirada. `pnpm test` → 56 tests, 52 pass, 4 skipped, 0 fail.
- T22: `tui-plugins/gentle-sounds.ts` registra el pack nativo `venjix` (done y subagent_done → `success`, error → `error`, permission y question → `attention`) con activación persistente vía `OPENCODE_VENJIX_SOUNDS=1`; el plugin de servidor deja de reproducir sonidos por su cuenta (guardas y aviso de escritorio siguen igual); el logo muestra bajo el arco la firma y los atajos (el slot `home_footer` no renderiza en OpenCode 1.18; se descartó); README actualizado con una fila de diagnóstico para el aviso interno `background dependency install failed` (OpenCode intenta npm en un proyecto pnpm; los plugins cargan igual). `pnpm test` → 57 tests, 53 pass, 4 skipped, 0 fail; smoke de TUI con el arte y los atajos visibles.
- T23: causa raíz — OpenCode ejecuta npm sobre el directorio de configuración al arrancar (install de `@opencode-ai/plugin`) y npm 12 crashea al recorrer el layout de symlinks de pnpm (arborist `Link.matches` → null; reproducible con `npm install --package-lock-only` en el repo), esperando ~5 s por intento. Fix: `nodeLinker: hoisted` en `pnpm-workspace.yaml`. Verificado: npm ya no crashea, el install deja de fallar (0 avisos nuevos), TTFD oficial 10.005 ms → 4.889 ms y los plugins/atajos siguen renderizando; `pnpm install --frozen-lockfile` reproducible y `pnpm test` → 57/53/0.
- T24: `install.sh` detecta si corre fuera de un checkout (tubería) y clona en la ruta canónica re-ejecutándose desde ahí; probado con stub de git (invoca `clone --depth 1` con la URL correcta) y `--help` por tubería no clona. Repo público verificado: `pnpm-lock.yaml` y `pnpm-workspace.yaml` presentes (HTTP 200), `packageManager: pnpm@11.22.0`, sin `package-lock.json` (404). README: instalación de un comando como método principal, opción de clonar para revisar y badge de pnpm. `pnpm test` → 58 tests, 54 pass, 4 skipped, 0 fail.

## Progreso

- 2026-10-14 — reconocimiento y plan; documento creado.
- 2026-10-15 — T1: fix de `compactArt` (`f555f51`) + prueba estática y smoke real en pty 40×12.
- 2026-10-15 — T11: interruptor de IA local por máquina (lanzador, `.gitignore`, README y pruebas del lanzador).
- 2026-10-15 — T2: validador de rutas absolutas con caso negativo.
- 2026-10-15 — T3: plugin alineado a 1.18.35; exclusión de `effect` revisada y verificada (beta.83).
- 2026-10-15 — T4: `--check` de solo-verificación con pruebas. Commits de la sesión: `e2e2e77` (T11), `7582bd6` (T3), `bf73265` (T2), `ecae635` (T4); sin coautor, sin push.
- 2026-10-15 — T12 (pedido del usuario): todos los perfiles, agentes y subagentes por defecto con DeepSeek v4.1 Flash (`2e46767`). `jd-judge-b` pierde su modelo distinto; `venjix-deep` comparte modelo con `venjix`.
- 2026-10-15 — T13: hardening de privacidad para publicar sin datos personales (rutas portables, instalador que no ensucia, prueba de privacidad, bits de ejecución). Commits: `0e0694d`, `7111461`, `5278ce3`, `ee36699`; sin push.
- 2026-10-15 — Reescritura de autoría de los 13 commits sin publicar (correo personal → noreply de GitHub) con el consentimiento del autor; el árbol quedó idéntico y este documento ya apunta a los hashes nuevos. La historia completa se reescribió después (T20) para eliminar las rutas de la máquina antes de hacer público el repositorio.
- 2026-10-15 — T14: temas de gentle-shell portados a OpenCode (Gentle, Gentleman-Cute, Gentleman-Sexy) con enlace múltiple en `install.sh`, pruebas de esquema y smoke real en la TUI (`53031d5`). Pendiente decidir sonidos y logo de texto personal.
- 2026-10-15 — T14/T15: tema por defecto renombrado a `gentleman-venjix` (`63f5771`); sonidos opt-in y texto del logo portados y verificados (`06e7f41`).
- 2026-10-15 — T16: selector simplificado a `venjix` + `venjix-auto` (build/plan desactivados, venjix-deep retirado) a pedido del usuario (`bf9caef`).
- 2026-10-15 — T17: alias corto `ov` creado por `install.sh` (`143d7a4`).
- 2026-10-15 — T18 (elegido por el usuario: seguridad primero): piso inviolable de rutas sensibles (config + plugin, también en bash y en `venjix-auto`) y `SECURITY.md` (`adfcb60`).
- 2026-10-15 — T8/T19: CI en GitHub (primer run verde) y separación local/público (clon de publicación con origin, local sin remoto, script con verificación de privacidad); primer push al remoto tras reescribir la autoría de los 27 commits pendientes a la identidad noreply (hashes luego reescritos por T20).
- 2026-10-15 — T20 (pedido del usuario): historia completa sin rutas de la máquina (47 commits reescritos), force push, repositorio público y README profesional.
- 2026-10-15 — T21 (pedido del usuario): licencia MIT y pasada profesional final del README.
- 2026-10-15 — T22 (pedido del usuario): sonidos integrados con el sistema nativo de OpenCode (pack `venjix`) y pie de la pantalla de inicio con atajos.
- 2026-10-15 — T23 (reportado por el usuario): arranque de `ov` acelerado ~5 s — `nodeLinker: hoisted` para que el install con npm de OpenCode no crashee sobre el layout de pnpm.
- 2026-10-15 — T24 (pedido del usuario): instalación de un comando (`curl | bash` con bootstrap) y pnpm verificado en el repo público.
- 2026-10-15 — README: plataforma objetivo destacada (Linux, en especial Arch Linux) en intro, requisitos y badge.
- 2026-10-15 — Renombre a Kairos (pedido del usuario): el repo pasa a `opencode-kairos`, perfiles `kairos`/`kairos-auto` y alias `kai`; tarea propia en `odd/tasks/rename-to-kairos.md` (R1–R5 hechos, R6–R8 pendientes).

## Siguiente paso

- T5: `install.sh --uninstall` (retira solo enlaces que apuntan al repo, conserva datos; prueba con HOME temporal).
