# opencode-venjix

Configuración de [OpenCode](https://opencode.ai) con las herramientas de **gentle-shell** portadas a su base, con un aspecto visual propio (tema `gentleman` en tonos azules, logo Arch y statusline).

El proyecto no es un programa independiente: es un conjunto de agentes, comandos, skills, un plugin, un tema y scripts que se cargan sobre OpenCode mediante variables de entorno (`OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_TUI_CONFIG`).

## Características

- **Orchestrator** (`gentle-orchestrator`): agente primario que coordina subagentes en lugar de ejecutar trabajo pesado en línea.
- **Subagentes especializados**: exploración, verificación, implementación, revisión (legibilidad, fiabilidad, resiliencia, riesgo) y jurado de *Judgment Day*.
- **Guarda de comandos destructivos**: un plugin bloquea comandos bash reconocibles como destructivos (`rm -rf` sobre rutas peligrosas, `git push --force`, `DROP`/`TRUNCATE`, `DELETE` sin `WHERE`).
- **Memoria persistente** mediante el servidor MCP `engram`, y documentación de librerías mediante `context7`.
- **Modelo gratuito por defecto** de OpenCode (`opencode/big-pickle`). No requiere instalar nada más.
- **IA local opcional**: si tienes Ollama, LM Studio, llama.cpp o vLLM activos, opencode-venjix detecta sus modelos al abrir y los muestra como proveedores locales. Si no hay ninguno, no pasa nada.
- **Sincronización** con la versión instalada de gentle-shell: al abrir, el launcher detecta cambios y regenera los componentes derivados sin tocar el visual ni las skills propias.
- **Tema y logo propios**, con colores de acento azules.

## Requisitos

| Componente | Versión probada | Para qué |
|---|---|---|
| OpenCode | 1.18.35 | Base sobre la que corre todo |
| Node.js | 26 | Script de sincronización y dependencias del plugin |
| gentle-shell | 4.2.0 | Fuente de agentes y guardas; opcional, solo para sincronizar |
| engram | 3.4.0 | Memoria persistente (MCP); viene con gentle-shell |
| notify-send | — | Notificación de escritorio al terminar; opcional |

## Instalación

```bash
git clone https://github.com/runer0101/opencode-venjix.git
cd opencode-venjix
npm install

# 1. Lanzador en el PATH
ln -s "$PWD/bin/opencode-venjix" ~/.local/bin/opencode-venjix

# 2. Tema: OpenCode busca los temas en ~/.config/opencode/themes
mkdir -p ~/.config/opencode/themes
ln -sf "$PWD/themes/gentleman.json" ~/.config/opencode/themes/gentleman.json
```

### Ajustes por máquina

Algunos valores dependen de la máquina y deben revisarse tras clonar:

- `tui.json`: ruta absoluta a `tui-plugins/gentle-logo.tsx`.
- `opencode.json`: ruta absoluta al binario de `engram` (`mcp.engram.command`).
- `opencode.json`: modelo por defecto (`model`, `small_model`). Los modelos locales no se configuran aquí: se detectan.
- `local-providers.json` (opcional): endpoints propios de IA local (ver sección *IA local*).
- `agents/` y `gentle-assets/`: contienen la ruta local del repositorio. El launcher los regenera al abrir la primera vez (no hay marcador de sincronización tras clonar), así que no hace falta editarlos.

## Uso

```bash
opencode-venjix                 # abre OpenCode con esta configuración
opencode-venjix --where         # muestra la carpeta de configuración
```

Comandos disponibles dentro de OpenCode:

| Comando | Descripción |
|---|---|
| `/gentle-doctor` | Diagnóstico de la instalación: agentes, comandos, plugins, skills y estado de sincronización |
| `/gentle-models` | Lista los modelos disponibles |
| `/gentle-status` | Cambios del repositorio actual y siguiente paso |

El agente por defecto es `gentle-orchestrator`. Con `Tab` se cambia entre agentes.

## IA local (opcional)

El instalador **no instala ni descarga modelos locales**. Si quieres usar IA en tu propia máquina, instala el runtime que prefieras; opencode-venjix lo detecta al abrir (cada arranque, sin configurar nada):

| Runtime | Puerto por defecto | Proveedor en OpenCode |
|---|---|---|
| Ollama | 11434 | `local-ollama` |
| LM Studio | 1234 | `local-lmstudio` |
| llama.cpp (`llama-server`) | 8080 | `local-llamacpp` |
| vLLM | 8000 | `local-vllm` |

Cualquier servidor compatible con OpenAI que responda en `GET /v1/models` se puede añadir con un archivo `local-providers.json` en la raíz del repo (no se versiona):

```json
[
  { "id": "local-jan", "name": "Jan (local)", "baseURL": "http://127.0.0.1:1337/v1" }
]
```

Reglas:

- El id debe empezar por `local-` para no mezclarse con proveedores de la configuración global.
- Los modelos aparecen en el selector de modelos de OpenCode (`/models`). El modelo por defecto no cambia: sigue siendo el gratuito de `opencode.json`.
- Los modelos de embeddings se omiten.
- Las capacidades (herramientas, contexto) son supuestas: OpenAI-compatible no las informa. Si un modelo no usa herramientas bien, no lo selecciones para agentes.
- Si el runtime no está activo, se ignora sin error.

Comprobar qué detecta el lanzador:

```bash
node scripts/detect-local-models.mjs
```

## Actualizaciones de gentle-shell

Al abrir `opencode-venjix`, el launcher ejecuta `scripts/sync-gentle-shell.mjs --if-changed`:

- Si la versión instalada de gentle-shell no cambió desde la última sincronización, no hace nada.
- Si cambió, regenera los agentes, las referencias del orchestrator, la guarda de comandos y las skills `gentle-ai` y `rdd-defect-workflow`.
- Todo se genera en un directorio temporal y se valida antes de escribir. Si gentle-shell cambió una API que el port usa, no se modifica nada y el launcher abre con la versión anterior.

Comandos relacionados:

```bash
node scripts/sync-gentle-shell.mjs --force       # sincronizar ahora
OPENCODE_VENJIX_NO_SYNC=1 opencode-venjix        # abrir sin sincronizar
```

> **No uses `gentle-sync` sobre este directorio.** Esa herramienta reemplaza el directorio entero con la salida de gentle-ai y borraría este proyecto. Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#actualizaciones).

La sincronización no cambia `opencode.json`. Si una versión nueva de gentle-shell requiere cambios de configuración (MCPs, modelos, permisos), hay que aplicarlos a mano.

## Estructura del repositorio

```
opencode-venjix/
├── bin/opencode-venjix            Lanzador: fija las variables de OpenCode y sincroniza
├── opencode.json                  Modelo gratuito por defecto, MCPs, agente, permisos
├── scripts/detect-local-models.mjs  Detecta runtimes de IA local al abrir
├── tui.json                       Tema, logo y statusline de la TUI
├── agents/                        Orchestrator y subagentes (generados)
├── gentle-assets/                 Referencias perezosas del orchestrator (generadas)
├── commands/                      Comandos /gentle-*
├── plugins/gentle-shell.ts        Guarda de comandos destructivos y notificación
├── lib/destructive-command-guard.ts   Lógica de la guarda (copia de gentle-pi)
├── skills/                        Skills del entorno (33)
├── themes/gentleman.json          Tema de colores
├── tui-plugins/gentle-logo.tsx    Logo Arch para la TUI
├── scripts/sync-gentle-shell.mjs  Sincronización con gentle-shell
├── docs/ARCHITECTURE.md           Arquitectura y decisiones de diseño
├── LICENSE-gentle-shell           Licencia MIT de los componentes derivados
└── package.json                   Dependencias de plugins de OpenCode
```

Detalles de cada componente, el mapeo de Pi a OpenCode y el flujo de actualización están en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Qué no incluye

La TUI propia de gentle-shell (barra fullscreen, animaciones, paneles de uso, regiones de puntero, sonidos) depende de la API de Pi y no existe en OpenCode. No se portó, y tampoco los comandos `/gentle:*` que dependían de ella.

## Seguridad

- El repositorio no contiene claves ni credenciales. Las claves de proveedores se guardan fuera del repo (`~/.local/share/opencode/auth.json`, `~/.gentle-shell/agent/auth.json`); no las subas.
- `.gitignore` excluye `node_modules/`, archivos de respaldo, `.env` y el marcador local de sincronización.
- La guarda de comandos destructivos es heurística: reconoce formas ejecutables comunes, no es un sandbox. Un comando ofuscado puede pasarla.
- La configuración usa `"permission": "allow"`, por lo que las herramientas no piden confirmación por defecto. Ajústalo en `opencode.json` si quieres más control.
- Antes de compartir una sesión o un log, revisa que no incluya rutas o datos personales.

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `falta .../opencode.json` | Repositorio incompleto o symlink roto | Revisa la ruta real con `opencode-venjix --where` |
| El tema no cambia | El tema no está enlazado en `~/.config/opencode/themes` | Repite el paso 2 de la instalación |
| No aparece el logo | Ruta absoluta de `tui.json` incorrecta | Corrige la ruta en `tui.json` |
| `no se pudo sincronizar con gentle-shell` | gentle-shell no está instalado o cambió una API usada por el port | Ejecuta el script a mano con `--force` para ver el detalle |
| `/gentle-doctor` muestra `sin marcador` | Nunca se sincronizó | Ejecuta `node scripts/sync-gentle-shell.mjs --force` |

## Créditos y licencia

- Los agentes, la guarda de comandos y las skills `gentle-ai` y `rdd-defect-workflow` se derivan de **gentle-pi** (gentle-shell), bajo licencia MIT. Ver `LICENSE-gentle-shell`.
- Las demás skills de `skills/` se incorporaron desde el ecosistema gentle-ai antes de este portado. Revisa su licencia de origen antes de redistribuirlas.
- La licencia de este repositorio aún no está definida por el autor.
