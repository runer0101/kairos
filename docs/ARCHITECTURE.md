# Arquitectura

Este documento describe cómo está construido kairos, qué se portó desde gentle-shell, cómo funciona la sincronización y qué limitaciones tiene.

## Visión general

```
                 ┌──────────────────────────────┐
  kairos│ bin/kairos          │  fija OPENCODE_CONFIG,
  (launcher) ───▶│  1. sync si cambió gentle-shell│  OPENCODE_CONFIG_DIR,
                 │  2. exec opencode            │  OPENCODE_TUI_CONFIG
                 └──────────────┬───────────────┘
                                ▼
        ┌───────────────────────────────────────────────────┐
        │ OpenCode 1.18.x                                    │
        │  opencode.json  → modelos, MCPs, permisos, agente  │
        │  agents/        → orchestrator + subagentes        │
        │  commands/      → /gentle-*                        │
        │  plugins/       → guarda bash + avisos al terminar │
        │  skills/        → instrucciones bajo demanda       │
        │  tui.json       → tema + logo + statusline         │
        └───────────────────────────────────────────────────┘
```

OpenCode carga la configuración desde las variables de entorno que define el launcher. El repositorio no modifica `~/.config/opencode`, salvo por el enlace del tema descrito en el README.

## Mapeo: gentle-shell (Pi) → kairos (OpenCode)

| Componente en gentle-shell | Equivalente en kairos | Notas |
|---|---|---|
| `assets/orchestrator.md` | `prompts/orchestrator.md` (común + Ponytail) + perfiles `kairos-control`, `kairos-auto` en `opencode.json` | Placeholders resueltos; la capa de economía de implementación va integrada en el prompt común de los dos perfiles |
| `assets/orchestrator-*.md`, `chains/` | `gentle-assets/` | Se leen bajo demanda, igual que en Pi |
| `assets/agents/*.md` | `agents/*.md` (modo `subagent`) | Permisos derivados de la lista `tools` original (ver abajo) |
| Lista `tools` de cada agente | `permission.edit`, `permission.bash`, `permission.webfetch` | Ver reglas de derivación |
| `registerCommand("gentle:…")` | `commands/gentle-*.md` | Solo los comandos con equivalente directo en OpenCode |
| `lib/destructive-command-guard.ts` | `lib/destructive-command-guard.ts` + `plugins/gentle-shell.ts` | El plugin llama a la guarda en `tool.execute.before` |
| Clasificador de auto-aprobación (`lib/auto-permission-classifier.ts` + runtime) | `plugins/auto-approval.ts` + `lib/auto-approval/` | Mecanismo verificado en OpenCode 1.18.35: el ask se responde por el evento `permission.asked` y el veto va por `tool.execute.before` (ver «Clasificador de auto-aprobación») |
| `gentle-notifications` (sonido y escritorio) | Eventos `session.status`/`session.error` → `notify-send` filtrado + pack de tonos nativo | Avisa solo a la sesión principal al pasar de `busy` a `idle`, calla el «listo» tras un error (avisando el error) y silencia a subagentes y sesiones internas del clasificador. Tonos opt-in con `KAIROS_SOUNDS=1`; avisos apagables con `KAIROS_NO_NOTIFY=1` |
| Memoria Engram | MCP `engram` en `opencode.json` | Usa el binario de gentle-shell |
| `skills/*/SKILL.md` | `skills/` | Mismo formato; dos skills se refrescan al sincronizar |
| `themes/` y TUI propia | `themes/` (4 temas), `tui-plugins/`, `tui.json` | Tema, logo que sigue al tema y HUD ODD propios (ver «La TUI (mapa)») |
| Barra fullscreen, paneles, animaciones, regiones de puntero | No portado | Dependen de la API de Pi |

### Derivación de permisos de subagentes

Pi declara en cada agente una lista de herramientas. El script las traduce a permisos de OpenCode:

| Si la lista `tools` contiene… | Permiso resultante |
|---|---|
| `write` o `edit` | `edit: allow` (si no, `deny`) |
| `bash` | `bash: allow` (si no, `deny`) |
| `web_*`, `source_check`, `fetch_content`, `get_search_content` | `webfetch: allow` (si no, `deny`) |

Ejemplo: `review-risk` no declara escritura ni bash, así que queda en solo lectura.

### Nota de equivalencias en los prompts

Los prompts originales nombran herramientas de Pi (`subagent_run`, `ask_user_choice`, `mem_save`, etc.). Cada agente generado lleva al inicio un bloque **Runtime: OpenCode** que indica la equivalencia:

| Herramienta de Pi | Equivalente en OpenCode |
|---|---|
| `subagent_run`, `Agent` | `task` con `subagent_type` |
| `ask_user_choice` | `question` |
| `find` | `glob` |
| `mem_save` | `mem_*` del MCP `engram` |
| `codegraph`, `gentle_review`, `web_*` | Solo si aparecen en la lista de herramientas del agente; si no, se reporta como no disponible |

Esta nota es una mitigación, no una reescritura: los prompts siguen siendo los de gentle-shell.

## Modelos y detección de IA local

La configuración de modelos se reparte en dos capas:

| Capa | Dónde | Qué aporta |
|---|---|---|
| Modelo por defecto | `opencode.json` (`model`, `small_model`) | `opencode-go/deepseek-v4.1-flash` (requiere suscripción OpenCode Go) |
| Proveedores locales | Detectados en cada arranque | Ollama, LM Studio, llama.cpp, vLLM y endpoints de `local-providers.json` |

En cada arranque, `bin/kairos` ejecuta `scripts/detect-local-models.mjs`. El script sondea los puertos por defecto con un timeout de 800 ms y devuelve un JSON de proveedores. El lanzador lo pasa en `OPENCODE_CONFIG_CONTENT`, que OpenCode fusiona por encima de la configuración del proyecto.

Dos decisiones de diseño:

- **IDs propios**: los proveedores detectados usan IDs `local-*`. Si usaran `ollama`, se fusionarían con el proveedor `ollama` de la configuración global del usuario (`~/.config/opencode/opencode.jsonc`), que puede declarar modelos que ya no existen.
- **`disabled_providers: ["ollama"]`** en `opencode.json`: oculta ese proveedor global. El `ollama-cloud` global se conserva porque son modelos de nube, no locales.

## Perfiles, modos de permiso y comandos

Los perfiles equivalen a `/gentle:profiles` de gentle-shell, pero se implementan con lo que OpenCode ya ofrece:

| Pieza | Dónde | Qué hace |
|---|---|---|
| Agentes primarios | `opencode.json` → `agent` | Un agente por perfil, con su modelo y permisos. Se cambian con `Tab`. |
| Prompt común | `prompts/orchestrator.md` | Lo usan los dos perfiles con `{file:./prompts/orchestrator.md}`. Se genera desde gentle-shell e incluye la capa de Ponytail. |
| Herencia de modelo | OpenCode | Un subagente sin `model` usa el del agente que lo invoca. Así el perfil activo decide el modelo de todo el trabajo. |
| Excepciones de subagentes | `opencode.json` | `gentle-ai-explore` (15 pasos) y `jd-judge-b` usan el modelo por defecto (DeepSeek v4.1 Flash). |

Permisos:

- **Normal** (global): lectura, búsqueda y subagentes permitidos. Edición y bash piden confirmación. Un conjunto de lecturas habituales de bash está permitido. El comodín `*` va primero, porque la última regla que coincide gana.
- **Automático** (`kairos-auto`): `permission: "allow"` a nivel de agente. Como la última regla que coincide gana, sobrescribe las de `ask`.
- **Auto de OpenCode**: `kairos --auto` pasa el flag al binario. Respeta los `deny`.
- **Guarda de comandos**: `plugins/gentle-shell.ts` la aplica en `tool.execute.before`, en todos los modos.

Comandos del flujo (`commands/`): cada uno usa `!\`...\`` para incluir contexto real del repositorio (diff, estado, estadísticas) y delega en subagentes con la herramienta `task`. `/judge` sigue las reglas de la skill `judgment-day`: jueces ciegos en paralelo, corrección solo de hallazgos confirmados por ambos y como máximo dos rondas. `/review` elige las lentes `review-*` por tamaño y riesgo, con la tabla de gentle-shell.

### Ponytail integrado en los perfiles

La capa de economía de implementación (Ponytail v5.3.2, MIT) se genera dentro de `prompts/orchestrator.md`, el prompt común de `kairos-control` y `kairos-auto`. No sustituye ODD, delegación, riesgo, revisión ni verificación: si hay conflicto, manda el proceso de kairos. `/review` incorpora además la lente lean en `review-readability`, y la plantilla ODD tiene una sección «Deuda deliberada» para los comentarios `shortcut:`.

### Clasificador de auto-aprobación

Portado de gentle-pi (`lib/auto-permission-classifier.ts` + runtime) sobre el mecanismo que T1 verificó en OpenCode 1.18.35:

- **Ask → allow**: `permission.ask` está declarado en la API del plugin pero el runtime **no lo despacha**; el camino real es el evento `permission.asked`, respondido con `client._client.post("/permission/{requestID}/reply", { reply: "once" })`. Solo se clasifican `bash` y edición (`write` entra por el permiso de edición); el resto de consentimientos sigue en manos humanas.
- **Allow → deny (veto)**: `allow` no emite evento de permiso, así que el veto lanza un error en `tool.execute.before`, como la guarda. Solo actúa cuando el permiso efectivo del agente para esa herramienta es `allow` confirmado (lo resuelve desde `/agent` y el último mensaje de usuario); con estado desconocido o `ask` no veta.
- **Sesión interna**: la clasificación corre en una sesión propia con herramientas deshabilitadas (`tools: {}`), modelo explícito y borrado al terminar; una sola clasificación en vuelo (las concurrentes se dejan como están) y una caché acotada por `callID` evita clasificar dos veces la misma llamada.
- **Fail-safe**: cualquier fallo, timeout (deadline de 15 s), veredicto inválido o concurrencia deja la decisión como está; el plugin nunca debilita la guarda ni el piso de rutas sensibles.
- **Contexto**: pedido vivo primero, acción redactada (secretos enmascarados) y presupuestos de 32 KiB de entrada y 512 tokens de salida.

Evidencia del spike, criterios y presupuestos completos: `odd/tasks/auto-approval-classifier.md`.

### Comandos `/gentle:*` de Pi: qué aplica

gentle-pi 4.3.0 registra 30 comandos `/gentle:*` (verificado en `extensions/` y `lib/`). Kairos porta los que tienen equivalente directo y cubre el resto con lo nativo de OpenCode:

| Comando de Pi | Estado en kairos | Equivalente nativo |
|---|---|---|
| `gentle:doctor` | portado (`commands/gentle-doctor.md`) | Diagnóstico de la instalación kairos |
| `gentle:models` | portado (`commands/gentle-models.md`) | Lista modelos con `opencode models`; los modelos por defecto se editan en `opencode.json` |
| `gentle:status` | portado (`commands/gentle-status.md`) | Reorientado al repositorio y la sesión (`git status`); el estado de la instalación lo cubre `/gentle-doctor` |
| `gentle:usage` | portado (`commands/gentle-usage.md`) | Usa `opencode stats` |
| `gentle:profiles` | no aplica | Perfiles de kairos con `Tab` (selector de agente primario) |
| `gentle:mode` | no aplica | Perfiles con `Tab` para el modo automático y `kairos --auto` para el auto de OpenCode |
| `gentle:yolo` | no aplica | Perfil `kairos-auto` (`Tab`) o `kairos --auto` |
| `gentle:persona` | no aplica | Sin equivalente: kairos no tiene personas intercambiables |
| `gentle:customize` | no aplica | `tui.json` (tema, logo, sonidos, atajos) y `opencode.json` (permisos) |
| `gentle:animations` | no aplica | Sin ajuste equivalente en `tui.json` |
| `gentle:vim` | no aplica | Sin equivalente; la edición del prompt usa los atajos de la TUI (`keybinds` en `tui.json`) |
| `gentle:double-esc-cancel` | no aplica | Sin ajuste equivalente; las teclas se personalizan con `keybinds` en `tui.json` |
| `gentle:banner` | no aplica | Logo propio (`tui-plugins/gentle-logo.tsx`, `KAIROS_LOGO_TEXT`) |
| `gentle:banner-color` | no aplica | `theme` en `tui.json`: el logo sigue al tema activo |
| `gentle:toggle-rose` | no aplica | `theme` en `tui.json` (temas gentleman) |
| `gentle:toggle-text-logo` | no aplica | Editar `tui-plugins/gentle-logo.tsx` o quitarlo de `tui.json` |
| `gentle:dev-binary` | no aplica | Kairos usa el binario de OpenCode instalado |
| `gentle:telemetry` | no aplica | Sin equivalente: kairos no incluye telemetría |
| `gentle:commands` | no aplica | Paleta de comandos de la TUI (`ctrl+p`) |
| `gentle:changes` | no aplica | `/gentle-status` (resumen del árbol) y `git diff` en la terminal |
| `gentle:agents` | no aplica | `opencode agent list` y el panel `opencode-subagent-statusline` (subagentes vía `task`) |
| `gentle:jobs` | no aplica | Herramienta `task` en segundo plano (`background`); kairos delega en primer plano por defecto |
| `gentle:background-subagents` | no aplica | `task` (segundo plano con `background`); primer plano por defecto |
| `gentle:stats` | no aplica | `opencode stats` (el mismo que usa `/gentle-usage`) |
| `gentle:status-timing` | no aplica | Sin equivalente: diagnóstico propio de Pi |
| `gentle:review-mode` | no aplica | RDD no portado; la revisión se cubre con `/review`, `/judge` y `/verify` |
| `gentle:review-session-permission` | no aplica | RDD no portado |
| `gentle:install-delegation` | no aplica | `node scripts/sync-gentle-shell.mjs --force` regenera agentes y prompts; `/gentle-doctor` diagnostica |
| `gentle:install-review` | no aplica | `node scripts/sync-gentle-shell.mjs --force` regenera los agentes de revisión y sus skills |

## Dependencias y cadena de suministro

- Gestor: pnpm 11.22.0, fijado en `package.json` (`packageManager`) y en `install.sh`. `install.sh` usa el pnpm del sistema solo si es esa versión exacta; si no, instala la fijada en su propia carpeta.
- Instalación: `pnpm install --frozen-lockfile`. Un lockfile que no coincide con `package.json` detiene la instalación.
- Políticas en `pnpm-workspace.yaml`: `minimumReleaseAge` (24 h), `trustPolicy: no-downgrade` con `trustPolicyIgnoreAfter` (un año) y una excepción estrecha verificada. `blockExoticSubdeps`, `strictDepBuilds` y `allowBuilds` controlan los scripts de instalación.
- Verificación de descargas: SHA-256 fijado para Node, pnpm y engram. El binario de pnpm además tiene atestación de procedencia de GitHub.
- Decisiones documentadas: la excepción de `effect@4.0.0-beta.74` se comprobó con `npm audit signatures` (firma y SLSA válidos, repositorio `Effect-TS/effect-smol`). `msgpackr-extract` queda desactivado porque es un addon nativo opcional.

## Pruebas

- `pnpm test` ejecuta `tests/*.test.mjs` con el runner integrado de Node (sin dependencias extra). Cubre: configuración (perfiles, modelo por defecto, permisos, proveedor ollama deshabilitado), agentes y comandos (frontmatter, permisos, portabilidad, reglas de `/judge`), detector de IA local (endpoints propios, filtros, tolerancia a errores), guarda de comandos destructivos, clasificador de auto-aprobación (presupuestos, redacción, parseo, política y plugin), rutas sensibles, lanzador, hook `commit-msg`, sincronización, privacidad, temas, logo, HUD y sonidos.
- `KAIROS_E2E=1 pnpm test` añade pruebas con el binario real de OpenCode: lista de perfiles, resolución del repositorio, una respuesta real del modelo por defecto y el e2e del clasificador en pty con `KAIROS_CLASSIFIER_STUB`.
- Las pruebas que consultan servicios usan `KAIROS_LOCAL_PROVIDERS` para apuntar a servidores de prueba, y no asumen qué runtimes locales hay instalados.
- Lección registrada: la salida de `opencode agent list` por tubería puede truncarse al cerrar el proceso. Por eso las pruebas y `install.sh` escriben la salida a un archivo.

## La TUI (mapa)

`tui.json` configura la TUI de OpenCode (tema y plugins). Los plugins propios viven en `tui-plugins/` — manuales, la sincronización no los toca — y leen el tema activo con `api.theme.current`.

| Pieza | Slots | Qué pinta |
|---|---|---|
| `gentle-logo.tsx` | `home_logo` | Arco Arch (arte compacto en terminales pequeñas), texto personal (`KAIROS_LOGO_TEXT`) y los atajos principales. Colores del tema: `primary`/`secondary` en el arco y `accent` en el texto y los separadores. |
| `kairos-hud.tsx` | `session_prompt_right`, `sidebar_content` | Tarea ODD activa (`◆ odd <tarea> n/m`, `✓` al completar) y aviso `sync pendiente`; en la sidebar, los pendientes (tope 3, `… +N`). Refresco cada 4 s con caché por mtime+tamaño. |
| `gentle-sounds.ts` | Pack de atención nativo | Tonos `done`, `subagent_done`, `error`, `permission` y `question`; opt-in con `KAIROS_SOUNDS=1`. |
| `opencode-subagent-statusline` (tercero) | `session_prompt`, `sidebar_content`, `home_bottom` | Panel de subagentes del paquete npm. |

Para apagar una pieza, quita su línea de `plugin` en `tui.json` y reabre kairos.

## Ciclo de vida de los archivos

| Archivo o carpeta | Origen | ¿Lo modifica la sincronización? |
|---|---|---|
| `agents/` (orchestrator y subagentes de gentle-shell) | Generado | Sí, reemplaza los suyos y borra los que ya no existan upstream |
| `prompts/orchestrator.md` | Generado | Sí, se regenera con la capa de Ponytail incluida |
| `gentle-assets/` | Generado | Sí, se regenera completo |
| `lib/destructive-command-guard.ts`, `LICENSE-gentle-shell` | Copiado | Sí |
| `skills/gentle-ai`, `skills/rdd-defect-workflow` | Copiado | Sí, se refrescan |
| Resto de `skills/` | Propio / incorporado | No |
| `opencode.json` | Manual | No |
| `plugins/`, `commands/` | Manual | No |
| `themes/`, `tui-plugins/`, `tui.json` | Visual, manual | No |
| `node_modules/`, `package*.json` | Dependencias | No |
| `.gentle-shell-sync.json` | Marcador local | Sí; no se versiona |

## Actualizaciones

### Flujo

1. El launcher ejecuta `node scripts/sync-gentle-shell.mjs --if-changed` con un límite de 30 s.
2. El script lee la versión de gentle-shell desde `~/.gentle-shell/current` (sigue el symlink, así que siempre apunta a la versión activa) y la compara con `.gentle-shell-sync.json`.
3. Si coincide, termina sin cambios.
4. Si no coincide, genera todo en un directorio temporal:
   - agentes y prompts con las sustituciones y la nota de runtime,
   - referencias del orchestrator,
   - copia de la guarda,
   - skills `gentle-ai` y `rdd-defect-workflow`.
5. Valida antes de tocar el repositorio:
   - la guarda sigue exportando `recognizeDestructiveCommands` (el plugin depende de ella),
   - el número de agentes coincide con las fuentes,
   - no quedan placeholders `{{…}}` sin resolver,
   - el orchestrator lleva la nota de runtime.
6. Si la validación falla, aborta con un mensaje y no modifica nada. El launcher abre igual con la versión anterior.
7. Si pasa, reemplaza solo los archivos gestionados, borra los agentes generados en la sincronización anterior que ya no existan y escribe el marcador.

Modo manual: `node scripts/sync-gentle-shell.mjs --force`.

### Por qué `gentle-sync` está bloqueado

`gentle-sync` (herramienta de gentle-ai, fuera de este repositorio) mueve `~/.config/opencode` a un lado, copia el contenido de un directorio de ecosistema, ejecuta gentle-ai y **borra el directorio de destino** antes de restaurar la salida. Sobre este repositorio eso eliminaría el port, el tema y el logo.

Por eso el repositorio se identifica por su marcador `.gentle-shell-sync.json`. Si `gentle-sync` detecta ese marcador, se detiene con un aviso. `GENTLE_SYNC_FORCE=1` lo salta bajo responsabilidad del usuario.

Esa comprobación está en la copia local de `gentle-sync` (`~/.local/bin/gentle-sync`), no en este repositorio. En una máquina donde `gentle-sync` no tenga esa comprobación, no usar la herramienta sobre este directorio.

### Qué puede romperse en una actualización

- Si gentle-shell cambia la firma de la guarda, la validación lo detecta y la sincronización no se aplica. Hay que adaptar `plugins/gentle-shell.ts` a mano.
- Si gentle-shell agrega MCPs, modelos o permisos que deberían estar en OpenCode, no se propagan: hay que editar `opencode.json`.
- Si cambia la estructura de `assets/agents/*.md` (frontmatter o campo `tools`), la derivación de permisos puede no reflejar la intención original. Conviene revisar `agents/` tras una actualización mayor.

## Seguridad

- **Secretos**: el repositorio no debe contener claves. Las claves de proveedores viven en `~/.local/share/opencode/auth.json` y `~/.gentle-shell/agent/auth.json`, fuera del árbol del proyecto.
- **Guarda de comandos**: reconoce formas ejecutables comunes (`rm -rf` sobre rutas peligrosas, `git push --force`, `DROP`/`TRUNCATE`, `DELETE` sin `WHERE`) tras normalizar comillas, heredocs y envoltorios como `sudo`/`env`. Es un filtro heurístico, no un sandbox: no interpreta shell arbitraria ni scripts externos.
- **Permisos**: la configuración base permite herramientas sin confirmación (`"permission": "allow"`). Para un modo más restrictivo, cambia a `ask` por herramienta en `opencode.json`.
- **Sincronización**: solo lee de `~/.gentle-shell` y solo escribe dentro del repositorio.

## Limitaciones conocidas

- La barra fullscreen, los paneles de uso y las animaciones de la TUI de Pi no se portaron; la identidad visual propia (tema, logo, sonidos y HUD ODD) sí existe (ver «La TUI (mapa)»).
- Los comandos `/gentle:*` de Pi que no aplican en kairos, con su equivalente nativo, están en la tabla «Comandos `/gentle:*` de Pi: qué aplica».
- El clasificador de auto-aprobación usa el evento `permission.asked` y el cliente de bajo nivel (`client._client.post`). Si una actualización de OpenCode cambia esa superficie, el plugin degrada sin romper: la decisión queda como está.
- En `opencode run` (no interactivo) el CLI auto-rechaza el ask antes de que el clasificador responda; el camino automático es práctico en la TUI.
- Las herramientas que el orchestrator espera de Pi (`codegraph`, `gentle_review`, `web_*`) no están configuradas en OpenCode. Los agentes deben reportar esa ausencia en lugar de simularla.
- La ruta del binario de `engram` en `opencode.json` se ajusta con `{env:HOME}` al instalar; `tui.json` usa rutas relativas al repositorio. En otra máquina basta ejecutar `install.sh`.
- Lo visual se verifica con pruebas estáticas y capturas pty por tema; no hay captura visual automatizada en CI (evidencia en `odd/tasks/visual-statusline.md`).
