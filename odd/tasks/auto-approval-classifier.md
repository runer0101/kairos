# Clasificador de auto-aprobación (paridad con gentle-shell)

> Documento ODD. Vive en el repositorio en `odd/tasks/auto-approval-classifier.md`.
> Se espeja en memoria (tema `odd/auto-approval-classifier/tasks`) para poder retomar entre sesiones.

## Objetivo

Portar el clasificador de auto-aprobación de gentle-shell a kairos con el hook `permission.ask` de OpenCode, en **ambas direcciones**: el perfil `kairos-control` aprueba automáticamente lo clasificado como seguro y dentro del pedido vivo; `kairos-auto` suma un veto inteligente sobre su `allow` actual. Nunca debilita las capas duras existentes y un fallo del clasificador deja la decisión como está hoy (fail-safe no regresivo).

## Problema

- **Perfil normal**: cada edición o bash fuera de la lista blanca interrumpe aunque sea rutina ya autorizada por el pedido (`opencode.json:54` `edit: ask`; `opencode.json:56` `bash *: ask`).
- **Perfil auto**: `kairos-auto` es aprobación ciega (`opencode.json:98` `permission: "allow"`); su única red es la heurística de la guarda (`plugins/gentle-shell.ts:44`) y el piso de rutas sensibles (`plugins/gentle-shell.ts:53`). gentle-shell cubría esto con un clasificador por modelo (`gentle-pi/lib/auto-permission-classifier.ts`: prompt `SYSTEM` en :99, veredicto JSON estricto en :295) que kairos no portó (`README.md`, «Qué no incluye»).
- **Ahora es viable sin dependencias nuevas**: OpenCode 1.18.35 expone `permission.ask` (`@opencode-ai/plugin/dist/index.d.ts:225`); según la documentación de plugins, los hooks de permiso corren para `allow` y `ask` (un `deny` configurado es final) y pueden cambiar el efecto. La SDK ya presente permite la llamada de clasificación (`@opencode-ai/sdk/dist/gen/types.gen.d.ts`: `SessionMessagesData` :2209, `SessionPromptData` con `model`/`system`/`tools` :2244; `session.create`/`delete` en `sdk.gen.d.ts`).

## Por qué

- Es la consecuencia directa del objetivo del proyecto: «unir lo mejor de ambos mundos». Es el único bloque de gentle-shell con valor alto que quedó fuera y ya tiene equivalente nativo en OpenCode.
- Decisión del usuario (2026-10-16): **ambas direcciones** — el perfil normal aprueba lo seguro; el auto veta lo peligroso o fuera de alcance.

## Alcance

### Dentro

- Plugin nuevo `plugins/auto-approval.ts` con el hook `permission.ask`.
- Librería del clasificador bajo `lib/auto-approval/`: contexto, prompt, parseo estricto, política pura y presupuestos.
- Sesión interna de clasificación vía SDK: modelo explícito, herramientas deshabilitadas, timeout, borrado y guardas de re-entrada.
- Política v1, solo tipos `bash` y `edit`:
  - `ask` → `allow` si el veredicto es seguro y está dentro del pedido vivo.
  - `allow` → `deny` si el veredicto es peligroso o fuera de alcance.
  - Cualquier fallo (timeout, error, veredicto inválido, modelo sin cupo, concurrencia): **dejar como está**.
- Interruptores: `KAIROS_NO_CLASSIFIER=1`, `KAIROS_CLASSIFIER_MODEL=provider/model` y stub de pruebas `KAIROS_CLASSIFIER_STUB=allow|deny|timeout`.
- Tests: unitarios (política, parseo, redacción, presupuestos) y e2e opt-in con stub (sin depender del humor del modelo).
- Docs: README (sección propia), ARCHITECTURE (mapeo y ciclo de vida) y SECURITY (límites: consejo contextual, nunca autoridad ni respuesta a consentimientos).
- Compañeras de ola:
  - T6 — saneo de las referencias colgantes del harness en el prompt generado.
  - T7 — decisión documentada sobre los `/gentle:*` restantes (equivalente nativo o no aplica).

### Fuera

- Evidencia acotada con inspección de archivos (`inspect_permission_file` de gentle-pi): fase 2, solo si T1–T5 muestran valor.
- RDD, Herdr y TUI fullscreen (dependen de la API de Pi).
- Cambios de semántica en la guarda o en el piso de rutas sensibles (siguen como capas duras independientes).
- Commits y publicación: los decide el autor.

## Restricciones

- Gestor único pnpm; sin dependencias nuevas (SDK y plugin ya están en `package.json`).
- El clasificador nunca responde consentimientos humanos, nunca se clasifica a sí mismo y no registra contenido sensible.
- Presupuestos: entrada ≤ 32 KiB, salida ≤ 512 tokens, deadline ≤ 15 s por petición, una clasificación en vuelo (las concurrentes se dejan como están).
- Si la firma del hook cambia en una actualización de OpenCode, el plugin debe degradar sin romper ni bloquear (fail-safe).
- Sin rutas de la máquina ni datos personales en archivos versionados (`tests/privacy.test.mjs` debe seguir verde).
- `pnpm test` verde al cierre; CI intacto.

## Checklist

Cada tarea tiene ID estable, criterio de aceptación observable y prueba.

- [ ] T1 — Spike del hook · Criterio: acta observada — cuándo corre `permission.ask` (¿también con `allow`? ¿nunca con `deny`?), valor inicial de `status`, contenido de `title`/`pattern`/`metadata` para bash y edit, y si `session.prompt` anidado resuelve mientras el hook espera (go/no-go; contingencias: `promptAsync` o llamada directa al proveedor) · Prueba: config temporal en `/tmp` con plugin espía + `opencode run`
- [ ] T2 — Librería del clasificador · Criterio: `lib/auto-approval/` prepara el contexto (pedido vivo desde `session.messages` + acción redactada), prompt adaptado del `SYSTEM` de gentle-pi, parseo estricto de `{decision, reason}` y política pura decidible por tests; RED antes de GREEN · Prueba: `pnpm test` (tests/classifier.test.mjs)
- [ ] T3 — Plugin y hook · Criterio: hook registrado con re-entrada bloqueada, timeout, fail-safe «dejar como está» y stub `KAIROS_CLASSIFIER_STUB`; sin recursión (sesión interna sin herramientas); `KAIROS_NO_CLASSIFIER=1` lo apaga · Prueba: `pnpm test` + smoke manual
- [ ] T4 — Ambas direcciones y presupuestos · Criterio: ask→allow y allow→deny observables de punta a punta con stub; concurrentes y timeout se quedan como están; el override de modelo funciona · Prueba: `KAIROS_E2E=1 pnpm test`
- [ ] T5 — Docs · Criterio: README con la sección del clasificador (qué hace, interruptores, límites, fail-safe); ARCHITECTURE con el mapeo actualizado; SECURITY con que es consejo contextual y no autoridad · Prueba: revisión
- [ ] T6 — Saneo del prompt generado · Criterio: `prompts/orchestrator.md` sin referencias a «identity/harness section» ni «`Current persona mode:`» sin definir (se definen en el bloque Runtime del sync, no editando el generado); `sync --check` al día tras `--force`; regeneración estable · Prueba: `pnpm test` + `node scripts/sync-gentle-shell.mjs --check`
- [ ] T7 — Decisión `/gentle:*` · Criterio: ARCHITECTURE/README dicen, por bloque, qué comandos de Pi no aplican y su equivalente nativo (stats, agents, jobs, profiles, toggles de TUI…) · Prueba: revisión

## Evidencia de verificación

- Recon (2026-10-16): `permission.ask` en `@opencode-ai/plugin` 1.18.35 (`dist/index.d.ts:225`); docs de plugins: los hooks corren para `allow` y `ask`, un `deny` configurado es final y el hook puede cambiar el efecto. SDK: `SessionPromptData.model/tools/system` (`types.gen.d.ts:2244`), `SessionMessagesData` (`:2209`), `session.create/delete` (`sdk.gen.d.ts:106-190`).
- Upstream: `gentle-pi/lib/auto-permission-classifier.ts` (459 líneas; `SYSTEM` :99–110; veredicto estricto :295–301) y `lib/auto-permission-runtime.ts` (`AUTO_DIRECTIVE` :12; límites de denegación :46).
- Suite de partida: `pnpm test` → 58 tests, 54 pass, 4 skip (E2E), 0 fail (2026-10-16).

## Progreso

- 2026-10-16 — Documento creado tras la revisión del port (oleada 2 elegida por el usuario). Decisión de producto: ambas direcciones. Recon del hook y del clasificador upstream completos. Pronóstico de tamaño: ~600 líneas autoradas (heurística; sin PR, los commits los decide el autor).

## Siguiente paso

- T1: spike del hook con plugin espía en config temporal — acta de comportamiento antes de escribir la librería.
