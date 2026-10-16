# Clasificador de auto-aprobación (paridad con gentle-shell)

> Documento ODD. Vive en el repositorio en `odd/tasks/auto-approval-classifier.md`.
> Se espeja en memoria (tema `odd/auto-approval-classifier/tasks`) para poder retomar entre sesiones.

## Objetivo

Portar el clasificador de auto-aprobación de gentle-shell a kairos con el hook `permission.ask` de OpenCode, en **ambas direcciones**: el perfil `kairos-control` aprueba automáticamente lo clasificado como seguro y dentro del pedido vivo; `kairos-auto` suma un veto inteligente sobre su `allow` actual. Nunca debilita las capas duras existentes y un fallo del clasificador deja la decisión como está hoy (fail-safe no regresivo).

## Problema

- **Perfil normal**: cada edición o bash fuera de la lista blanca interrumpe aunque sea rutina ya autorizada por el pedido (`opencode.json:54` `edit: ask`; `opencode.json:56` `bash *: ask`).
- **Perfil auto**: `kairos-auto` es aprobación ciega (`opencode.json:98` `permission: "allow"`); su única red es la heurística de la guarda (`plugins/gentle-shell.ts:44`) y el piso de rutas sensibles (`plugins/gentle-shell.ts:53`). gentle-shell cubría esto con un clasificador por modelo (`gentle-pi/lib/auto-permission-classifier.ts`: prompt `SYSTEM` en :99, veredicto JSON estricto en :295) que kairos no portó (`README.md`, «Qué no incluye»).
- **Mecanismo verificado en T1 (2026-10-16)**: `permission.ask` está declarado (`@opencode-ai/plugin/dist/index.d.ts:225`) pero el runtime 1.18.35 **no lo despacha** (0 disparadores en el binario; 11 corridas sin invocación). El camino viable es el evento `permission.asked` + respuesta con `client._client.post("/permission/{requestID}/reply")` para ask→allow, y `tool.execute.before` (como ya hace la guarda) para el veto allow→deny. La SDK ya presente permite la llamada de clasificación (`@opencode-ai/sdk/dist/gen/types.gen.d.ts`: `SessionMessagesData` :2209, `SessionPromptData` con `model`/`system`/`tools` :2244; `session.create`/`delete` en `sdk.gen.d.ts`).

## Por qué

- Es la consecuencia directa del objetivo del proyecto: «unir lo mejor de ambos mundos». Es el único bloque de gentle-shell con valor alto que quedó fuera y ya tiene equivalente nativo en OpenCode.
- Decisión del usuario (2026-10-16): **ambas direcciones** — el perfil normal aprueba lo seguro; el auto veta lo peligroso o fuera de alcance.

## Alcance

### Dentro

- Plugin nuevo `plugins/auto-approval.ts`: evento `permission.asked` + respuesta (ask→allow) y veto en `tool.execute.before` (allow→deny), según el mecanismo verificado en T1.
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

- [x] T1 — Spike del hook · Criterio: acta observada — `permission.ask` existe en la API pero el runtime 1.18.35 NO lo despacha; contingencia probada de punta a punta: evento `permission.asked` + prompt anidado (sin deadlock) + respuesta por `client._client.post(/permission/{requestID}/reply)` (once/always/reject); con `allow` no hay evento de permiso y el veto va por `tool.execute.before` · Prueba: config temporal en `/tmp/opencode/classifier-spike` con plugin espía + `opencode run`/TUI
- [x] T2 — Librería del clasificador · Criterio: `lib/auto-approval/` prepara el contexto (pedido vivo desde `session.messages` + acción redactada), prompt adaptado del `SYSTEM` de gentle-pi, parseo estricto de `{decision, reason}` y política pura decidible por tests; RED antes de GREEN · Prueba: `pnpm test` (tests/classifier.test.mjs)
- [x] T3 — Plugin y mecanismo · Criterio: mecanismo registrado (evento + veto) con re-entrada bloqueada, timeout, fail-safe «dejar como está» y stub `KAIROS_CLASSIFIER_STUB`; sin recursión (sesión interna sin herramientas); `KAIROS_NO_CLASSIFIER=1` lo apaga · Prueba: `pnpm test` + smoke manual
- [x] T4 — Ambas direcciones y presupuestos · Criterio: ask→allow y allow→deny observables de punta a punta con stub; concurrentes y timeout se quedan como están; el override de modelo funciona · Prueba: `KAIROS_E2E=1 pnpm test`
- [x] T5 — Docs · Criterio: README con la sección del clasificador (qué hace, interruptores, límites, fail-safe); ARCHITECTURE con el mapeo actualizado; SECURITY con que es consejo contextual y no autoridad · Prueba: revisión
- [x] T6 — Saneo del prompt generado · Criterio: `prompts/orchestrator.md` sin referencias a «identity/harness section» ni «`Current persona mode:`» sin definir (se definen en el bloque Runtime del sync, no editando el generado); `sync --check` al día tras `--force`; regeneración estable · Prueba: `pnpm test` + `node scripts/sync-gentle-shell.mjs --check`
- [x] T7 — Decisión `/gentle:*` · Criterio: ARCHITECTURE/README dicen, por bloque, qué comandos de Pi no aplican y su equivalente nativo (stats, agents, jobs, profiles, toggles de TUI…) · Prueba: revisión

## Evidencia de verificación

- Recon (2026-10-16): `permission.ask` en `@opencode-ai/plugin` 1.18.35 (`dist/index.d.ts:225`); docs de plugins: los hooks corren para `allow` y `ask`, un `deny` configurado es final y el hook puede cambiar el efecto. SDK: `SessionPromptData.model/tools/system` (`types.gen.d.ts:2244`), `SessionMessagesData` (`:2209`), `session.create/delete` (`sdk.gen.d.ts:106-190`).
- Upstream: `gentle-pi/lib/auto-permission-classifier.ts` (459 líneas; `SYSTEM` :99–110; veredicto estricto :295–301) y `lib/auto-permission-runtime.ts` (`AUTO_DIRECTIVE` :12; límites de denegación :46).
- Suite de partida: `pnpm test` → 58 tests, 54 pass, 4 skip (E2E), 0 fail (2026-10-16).
- T1 (2026-10-16): spike con plugin espía en `/tmp/opencode/classifier-spike` (11 corridas `opencode run` + TUI/pty). Hallazgos observados:
  - `permission.ask`: declarado en la API pero **nunca despachado** por 1.18.35 — 0 disparadores `trigger("permission.ask")` en el binario y 0 invocaciones en las 11 corridas (incluida una TUI con el diálogo `△ Permission required` pendiente).
  - `allow` no emite ningún evento de permiso (solo `tool.execute.before/after`); `deny` es final y tampoco dispara nada. El veto allow→deny debe ir por `tool.execute.before`.
  - Con `ask`, el evento `permission.asked` trae: bash → `patterns:[comando literal]` + `metadata.command`; edit → `patterns:[ruta relativa]` + `metadata.filepath`/`metadata.diff`; `always` = prefijo sugerido de "permitir siempre".
  - Respuesta probada en TUI: `client._client.post("/permission/{requestID}/reply", { reply: "once" })` → `permission.replied once` y el comando ejecuta (marker presente); `{ reply: "reject" }` → bloqueado (marker ausente). El cliente del plugin NO expone `client.permission`; `serverUrl` es un placeholder in-process (un `fetch` directo falla).
  - `session.prompt` anidado **resuelve mientras el permiso está pendiente, sin deadlock**: 1.395 ms y 4.994 ms con respuesta real ("OK").
  - Límite observado: en `opencode run` (no interactivo) el CLI auto-rechaza en ~19 ms y gana la carrera; el camino `permission.asked` es práctico en TUI (el uso normal de kairos).
- T2 (2026-10-16): `lib/auto-approval/` (presupuestos 32 KiB/512 tokens/15 s, redacción de secretos, contexto acotado con el pedido vivo primero, prompt adaptado del `SYSTEM` de gentle-pi, parseo estricto, política pura, guarda single-flight) + `tests/classifier.test.mjs` (20 pruebas; RED→GREEN). `pnpm test` → 95 tests, 91 pass, 4 skip, 0 fail.
- T3+T4 (2026-10-16): `plugins/auto-approval.ts` — evento `permission.asked` → reply `once` solo con veredicto seguro; veto en `tool.execute.before` únicamente con `allow` confirmado (vía `/agent`; desconocido nunca bloquea); caché LRU por callID; guarda de sesión interna; deadline; fail-safe total. `tests/auto-approval.test.mjs` (19 pruebas + e2e pty opt-in). `pnpm test` → 115 tests, 110 pass, 5 skip, 0 fail. Evidencia observada: e2e pty con stub allow (ask auto-respondido y marcador creado; control negativo con `KAIROS_NO_CLASSIFIER=1` deja el diálogo); veto manual en `kairos-auto` + stub deny (bloqueo con `auto-approval: bloqueado por el clasificador`); corrida real sin stub (el modelo clasificó y respondió `once`).
- T5+T7 (2026-10-16): README (subsección del clasificador con interruptores/límites/fail-safe; conteo real 115), ARCHITECTURE (fila del mapeo, subsección del mecanismo verificado en T1, tabla de 29 comandos `/gentle:*` de Pi con estado y equivalente nativo, pruebas y limitaciones al día), SECURITY (fila: consejo contextual, nunca autoridad ni respuesta a consentimientos).
- T6 (2026-10-16): el bloque `RUNTIME_NOTE` del sync define la sección de identidad y `Current persona mode:` (resuelve las referencias colgantes del prompt generado); `--force` + `--check` al día; regeneración estable (misma huella en dos pasadas).

## Progreso

- 2026-10-16 — Documento creado tras la revisión del port (oleada 2 elegida por el usuario). Decisión de producto: ambas direcciones. Recon del hook y del clasificador upstream completos. Pronóstico de tamaño: ~600 líneas autoradas (heurística; sin PR, los commits los decide el autor).
- 2026-10-16 — T1 completo: `permission.ask` no existe en runtime; acta registrada y mecanismo sustituto verificado (evento `permission.asked` + reply + veto por `tool.execute.before`). El diseño de T3 se adapta a ese mecanismo.
- 2026-10-16 — T2–T7 completos: librería, plugin con ambas direcciones, e2e con stub y corrida real, docs (README/ARCHITECTURE/SECURITY) y saneo del prompt generado; suite 115 tests, 0 fallos.

## Siguiente paso

Completado. La fase 2 (evidencia acotada con inspección de archivos) y el resto del alcance «Fuera» quedan a la espera de una nueva decisión del usuario.
