# Seguridad

Qué protege kairos, qué no, y cómo ajustarlo. Resumen honesto: hay defensas reales y también límites conocidos.

## Modelo de amenaza

El agente trabaja en tu máquina con tus permisos. Las defensas son **capas heurísticas y de configuración**, no un sandbox: no aíslan procesos, no inspeccionan binarios y no sustituyen tu criterio.

## Protecciones activas

| Capa | Qué hace |
|---|---|
| Guarda de comandos destructivos | Bloquea (fail-closed) formas reconocibles: `rm -rf` sobre rutas peligrosas, `git push --force`, `DROP`/`TRUNCATE`, `DELETE` sin `WHERE`, etc. Aplica a todos los perfiles, también `kairos-auto`. |
| Rutas sensibles (piso inviolable) | El plugin bloquea **leer o escribir** en `~/.ssh`, `~/.gnupg`, `~/.aws`, `.git-credentials`, `.netrc`, claves `id_rsa`/`id_dsa`/`id_ecdsa`/`id_ed25519` y `auth.json` — en las herramientas de archivo **y** en comandos bash que las referencien (p. ej. `cat ~/.ssh/id_rsa`). No se puede aprobar ni saltar con `kairos-auto`. |
| Rutas sensibles (perfiles) | `opencode.json` añade `deny` para credenciales y `ask` para `.env`, `*.pem`, `.kube/config` y `.docker/config.json`. En el perfil normal eso pide confirmación; en `kairos-auto` las reglas `ask` no preguntan (ver límites). |
| Directorios externos | Leer o escribir fuera del proyecto pide confirmación (`external_directory: ask`). |
| Permisos por perfil | `kairos-control` pregunta antes de editar y ejecutar; `kairos-auto` no pregunta, pero las guardas de arriba siguen aplicando. |
| Clasificador de auto-aprobación | Consejo contextual, nunca autoridad ni respuesta a consentimientos humanos: solo aprueba un `ask` cuando el veredicto es seguro y está dentro del pedido vivo, y solo veta en sesiones con permiso `allow` confirmado. Veredictos peligrosos o dudosos y cualquier fallo (timeout, error, veredicto inválido o concurrencia) dejan la decisión como está; no debilita la guarda ni el piso de rutas sensibles. Se apaga con `KAIROS_NO_CLASSIFIER=1`. |
| Cadena de suministro | pnpm con lockfile congelado, `minimumReleaseAge` (24 h), `trustPolicy: no-downgrade`, `blockExoticSubdeps`, scripts de instalación de dependencias bloqueados. El instalador fija versiones con SHA-256 y verifica atestaciones donde existen (`pnpm`, `engram`); el instalador oficial de OpenCode se ejecuta sin fijar versión (riesgo residual aceptado, ver T6 del plan). |
| Privacidad del repositorio | `tests/privacy.test.mjs` falla si un archivo versionado contiene rutas de la máquina o correos personales. |
| IA local | Opt-out por máquina (`touch .no-local-ai`) o por apertura (`KAIROS_NO_LOCAL=1`). Los endpoints detectados son locales; no se envía nada a terceros por esta vía. |

## Límites conocidos

- **No es un sandbox.** Un comando destructivo ofuscado (variables, codificación, scripts) puede escapar de la heurística textual. La guarda reconoce formas literales.
- En `kairos-auto`, los archivos `.env`/`*.pem`/kube/docker **se pueden leer sin pregunta** (el perfil sobrescribe las reglas `ask`). Lo inviolable es la tabla de credenciales.
- `grep`/`glob` sobre directorios normales pueden exponer nombres de archivos; las rutas de credenciales sí están cubiertas por el piso inviolable.
- Los servidores MCP (engram local, context7 remoto) corren con sus propias garantías; sus herramientas no pasan por la guarda.
- Las credenciales del proveedor de modelo (OpenCode Go) las gestiona OpenCode, no este repositorio.
- La guarda actúa **antes** de ejecutar: protege al agente de sí mismo, no a un atacante con acceso a tu shell.

## Ajustar si te bloquea de más

- Rutas sensibles de lectura: edita `permission.read` en `opencode.json`.
- Piso inviolable (credenciales): edita `SENSITIVE_PATH` en `plugins/gentle-shell.ts`.
- Después de cualquier cambio: `pnpm test` (hay pruebas de comportamiento para la guarda y las rutas sensibles).

## Reportar

Abre un issue en el repositorio del proyecto describiendo el caso (comando o ruta que debería bloquearse y no lo hace, o que se bloquea sin motivo). No publiques secretos reales en el reporte.
