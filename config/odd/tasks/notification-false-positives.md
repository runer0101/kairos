# Avisos de escritorio sin falsos positivos (subagentes vivos y entradas pendientes)

> Documento ODD. Vive en el repositorio del proyecto, en `odd/tasks/notification-false-positives.md`.
> Se espeja en memoria (tema `kairos/notification-positives`).

## Objetivo

Que el aviso de escritorio «Listo para tu siguiente mensaje» no vuelva a llegar mientras la
sesión sigue trabajando o está esperando algo del usuario.

## Problema

Reporte del usuario (2026-10-18): «a veces lanza falsos positivos: que ya acabó la tarea pero no
es así». El plugin `plugins/gentle-shell.ts` avisaba en **cualquier** `busy→idle` de una sesión
principal, con tres agujeros:

1. **Subagentes vivos**: el principal queda `idle` tras lanzar `task` en background (o con hijos
   aún corriendo) y el aviso salía con trabajo pendiente.
2. **Esperando al usuario**: con un permiso (`permission.asked`) o una pregunta
   (`question.asked`) pendiente, la sesión está `idle` pero no «lista para tu siguiente
   mensaje»: te está esperando a ti.
3. **Sesiones desconocidas**: una sesión cuyo `created`/`updated` no se vio (p. ej. una hija
   creada antes de cargar el plugin) podía colarse como principal y avisar.

## Alcance

### Dentro

- **F1 — Hijos vivos**: `childParent` (hijo → padre) y `waitingParents` (padres idle con hijos
  corriendo). El aviso del padre se difiere al `idle` del **último hijo limpio**; si un hijo
  falla, no se dispara el diferido (el padre decidirá y avisará por su cuenta).
- **F2 — Entradas pendientes**: `question.asked`/`question.replied`/`question.rejected` y
  `permission.asked`/`permission.replied` alimentan un mapa de solicitudes pendientes por
  sesión; con una pendiente, el `idle` no avisa (al responder, el siguiente `busy→idle` sí).
- **F3 — Sesiones conocidas**: solo avisa si la sesión pasó por `created`/`updated`.
- **F5 — Barrera del servidor**: antes de avisar, `client.session.get` contrasta que la
  sesión no tenga `parentID` (una hija cuyo `created`/`updated` no se vio como tal no avisa);
  si el servidor no responde, se confía en el rastreo por eventos y el aviso no se pierde.
- **F4 — Pruebas**: 8 casos nuevos en `tests/notifications.test.mjs` (hijos vivos, diferido
  al último, pregunta, permiso, hijo con error, sesión desconocida, hija según el servidor,
  servidor sin respuesta).

### Fuera

- Debounce por tiempo para idles transitorios (<1,5 s entre pasos): OpenCode mantiene `busy`
  durante la corrida completa; el caso no se ha observado. Revisar si apareciera.
- Notificar «esperando tu decisión» con permiso/pregunta: el host ya lo cubre con su sistema de
  atención (desactivado en kairos por defecto).

## Restricciones

- Sin dependencias nuevas y sin tocar los sonidos ni la configuración de atención del host.
- Los avisos siguen apagables con `KAIROS_NO_NOTIFY=1`.

## Deuda deliberada

- `shortcut: los hijos vivos se rastrean por eventos (created + status); no se consulta children() con sus status en cada aviso — revisar si apareciera un caso de hija creada antes de cargar el plugin.`

## Checklist

- [x] F1 — Aviso diferido al terminar el último hijo · Prueba: `tests/notifications.test.mjs`
- [x] F2 — Silencio con permiso/pregunta pendiente · Prueba: ídem
- [x] F3 — Solo sesiones conocidas · Prueba: ídem
- [x] F5 — Barrera del servidor (parentID) · Prueba: ídem
- [x] F4 — Suite verde · Prueba: `pnpm test` (186 tests)

## Evidencia de verificación

- Análisis (2026-10-18): el host interno (`internal:notifications`, V1 1.18.35) usa el mismo
  criterio `busy→idle` y además rastrea `question.asked`/`permission.asked` — de ahí las dos
  primeras causas. En la máquina del usuario el sistema de atención del host está desactivado
  (sin `attention` en la config y sin `KAIROS_SOUNDS`), así que el único emisor es el plugin de
  kairos.
- Implementación (2026-10-18): `plugins/gentle-shell.ts` con `childParent`, `waitingParents`,
  `pendingInputs` (claves `q:`/`p:`) y `knownSessions`; el `idle` de un hijo limpio dispara el
  aviso diferido del padre solo si no quedan hijos vivos ni entradas pendientes. Mitigación del
  riesgo residual (F5): `client.session.get` como última barrera (parentID del servidor); si el
  fetch falla, no se silencia (fail-open) para no perder avisos legítimos.
- Pruebas (2026-10-18): `pnpm test` → 186 tests, 181 pass, 5 skip, 0 fail; los 8 casos nuevos
  en verde y los 9 anteriores intactos.

## Progreso

- 2026-10-18 — Reporte del usuario, análisis, fix y pruebas. Cerrado.

## Siguiente paso

Nada pendiente. Si vuelve a aparecer un falso positivo, capturar la secuencia de eventos
(`session.status` del padre y de sus hijos, `question.*`/`permission.*`) para añadir el caso.
