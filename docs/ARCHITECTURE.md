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
        │  plugins/       → guarda bash + notificación       │
        │  skills/        → instrucciones bajo demanda       │
        │  tui.json       → tema + logo + statusline         │
        └───────────────────────────────────────────────────┘
```

OpenCode carga la configuración desde las variables de entorno que define el launcher. El repositorio no modifica `~/.config/opencode`, salvo por el enlace del tema descrito en el README.

## Mapeo: gentle-shell (Pi) → kairos (OpenCode)

| Componente en gentle-shell | Equivalente en kairos | Notas |
|---|---|---|
| `assets/orchestrator.md` | `prompts/orchestrator.md` (prompt común) + perfiles `kairos`, `kairos-auto` en `opencode.json` | Placeholders resueltos; cada perfil define modelo y permisos sin duplicar el prompt |
| `assets/orchestrator-*.md`, `chains/` | `gentle-assets/` | Se leen bajo demanda, igual que en Pi |
| `assets/agents/*.md` | `agents/*.md` (modo `subagent`) | Permisos derivados de la lista `tools` original (ver abajo) |
| Lista `tools` de cada agente | `permission.edit`, `permission.bash`, `permission.webfetch` | Ver reglas de derivación |
| `registerCommand("gentle:…")` | `commands/gentle-*.md` | Solo los comandos con equivalente directo en OpenCode |
| `lib/destructive-command-guard.ts` | `lib/destructive-command-guard.ts` + `plugins/gentle-shell.ts` | El plugin llama a la guarda en `tool.execute.before` |
| `gentle-notifications` (sonido y escritorio) | Evento `session.idle` → `notify-send` | Sonidos no portados |
| Memoria Engram | MCP `engram` en `opencode.json` | Usa el binario de gentle-shell |
| `skills/*/SKILL.md` | `skills/` | Mismo formato; dos skills se refrescan al sincronizar |
| `themes/` y TUI propia | `themes/gentleman-kairos.json`, `tui-plugins/`, `tui.json` | Logo y tema propios |
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
| Prompt común | `prompts/orchestrator.md` | Lo referencia cada perfil con `{file:./prompts/orchestrator.md}`. Se genera desde gentle-shell. |
| Herencia de modelo | OpenCode | Un subagente sin `model` usa el del agente que lo invoca. Así el perfil activo decide el modelo de todo el trabajo. |
| Excepciones de subagentes | `opencode.json` | `gentle-ai-explore` (15 pasos) y `jd-judge-b` usan el modelo por defecto (DeepSeek v4.1 Flash). |

Permisos:

- **Normal** (global): lectura, búsqueda y subagentes permitidos. Edición y bash piden confirmación. Un conjunto de lecturas habituales de bash está permitido. El comodín `*` va primero, porque la última regla que coincide gana.
- **Automático** (`kairos-auto`): `permission: "allow"` a nivel de agente. Como la última regla que coincide gana, sobrescribe las de `ask`.
- **Auto de OpenCode**: `kairos --auto` pasa el flag al binario. Respeta los `deny`.
- **Guarda de comandos**: `plugins/gentle-shell.ts` la aplica en `tool.execute.before`, en todos los modos.

Comandos del flujo (`commands/`): cada uno usa `!\`...\`` para incluir contexto real del repositorio (diff, estado, estadísticas) y delega en subagentes con la herramienta `task`. `/judge` sigue las reglas de la skill `judgment-day`: jueces ciegos en paralelo, corrección solo de hallazgos confirmados por ambos y como máximo dos rondas. `/review` elige las lentes `review-*` por tamaño y riesgo, con la tabla de gentle-shell.

## Dependencias y cadena de suministro

- Gestor: pnpm 11.22.0, fijado en `package.json` (`packageManager`) y en `install.sh`. `install.sh` usa el pnpm del sistema solo si es esa versión exacta; si no, instala la fijada en su propia carpeta.
- Instalación: `pnpm install --frozen-lockfile`. Un lockfile que no coincide con `package.json` detiene la instalación.
- Políticas en `pnpm-workspace.yaml`: `minimumReleaseAge` (24 h), `trustPolicy: no-downgrade` con `trustPolicyIgnoreAfter` (un año) y una excepción estrecha verificada. `blockExoticSubdeps`, `strictDepBuilds` y `allowBuilds` controlan los scripts de instalación.
- Verificación de descargas: SHA-256 fijado para Node, pnpm y engram. El binario de pnpm además tiene atestación de procedencia de GitHub.
- Decisiones documentadas: la excepción de `effect@4.0.0-beta.74` se comprobó con `npm audit signatures` (firma y SLSA válidos, repositorio `Effect-TS/effect-smol`). `msgpackr-extract` queda desactivado porque es un addon nativo opcional.

## Pruebas

- `pnpm test` ejecuta `tests/*.test.mjs` con el runner integrado de Node (sin dependencias extra). Cubre: configuración (perfiles, modelo por defecto, permisos, proveedor ollama deshabilitado), agentes y comandos (frontmatter, permisos, portabilidad, reglas de `/judge`), detector de IA local (endpoints propios, filtros, tolerancia a errores), y la guarda de comandos destructivos.
- `KAIROS_E2E=1 pnpm test` añade pruebas con el binario real de OpenCode: lista de perfiles, resolución del repositorio y una respuesta real del modelo por defecto.
- Las pruebas que consultan servicios usan `KAIROS_LOCAL_PROVIDERS` para apuntar a servidores de prueba, y no asumen qué runtimes locales hay instalados.
- Lección registrada: la salida de `opencode agent list` por tubería puede truncarse al cerrar el proceso. Por eso las pruebas y `install.sh` escriben la salida a un archivo.

## Ciclo de vida de los archivos

| Archivo o carpeta | Origen | ¿Lo modifica la sincronización? |
|---|---|---|
| `agents/` (orchestrator y subagentes de gentle-shell) | Generado | Sí, reemplaza los suyos y borra los que ya no existan upstream |
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

- La TUI de gentle-shell no se portó (ver README).
- Solo se portaron 3 comandos `/gentle:*`; los demás dependen de la API de Pi o de la TUI propia.
- Las herramientas que el orchestrator espera de Pi (`codegraph`, `gentle_review`, `web_*`) no están configuradas en OpenCode. Los agentes deben reportar esa ausencia en lugar de simularla.
- `opencode.json` contiene rutas absolutas (binario de `engram`) y `tui.json` contiene la ruta de `gentle-logo.tsx`. Hay que ajustarlas al clonar en otra máquina.
- No hay suite de pruebas automatizadas. La verificación fue manual: carga de configuración, agentes, comandos, plugin, validación de la guarda y sincronización.
