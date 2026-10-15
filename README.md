# kairos

[![CI](https://github.com/runer0101/kairos/actions/workflows/ci.yml/badge.svg)](https://github.com/runer0101/kairos/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.13-brightgreen.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-11.22.0-orange.svg)](https://pnpm.io)
[![Plataforma](https://img.shields.io/badge/plataforma-Linux%20%C2%B7%20Arch-1793d1.svg)](#requisitos)

**OpenCode con el harness de [gentle-shell](https://github.com/Gentleman-Programming/gentle-shell) portado a su base** — el flujo "el Gentleman" sobre tu terminal: ODD con documento de feature, subagentes enfocados, revisión por riesgo, juicio adversarial y verificación independiente, con memoria persistente, guardas de seguridad y temas, logo y sonidos propios.

```
      /\
     /  \
    / /\ \
   / /  \ \
  /_/    \_\   kairos
```

Dos mundos en uno: la potencia nativa de OpenCode (LSP, formateadores, snapshots, MCP, plugins) y las herramientas de gentle-shell (agentes, skills, comandos, ODD, guardas), sin renunciar a ninguna.

Pensado para **Linux** — en especial **Arch Linux**, donde se desarrolla y prueba a diario — aunque funciona en cualquier distribución con glibc.

> Proyecto en desarrollo activo: cada push pasa la suite completa, `shellcheck` y un escaneo de privacidad en CI.

## Índice

[Qué incluye](#qué-incluye) · [Requisitos](#requisitos) · [Instalación rápida](#instalación-rápida) · [Perfiles de agente](#perfiles-de-agente) · [Modos de permiso](#modos-de-permiso) · [Comandos](#comandos) · [Temas](#temas) · [IA local](#ia-local-opcional) · [Dependencias](#dependencias-y-cadena-de-suministro) · [Pruebas](#pruebas) · [Estructura](#estructura-del-repositorio) · [Seguridad](#seguridad) · [Solución de problemas](#solución-de-problemas) · [Contribuir](#contribuir) · [Créditos y licencia](#créditos-y-licencia)

## Qué incluye

- **Perfiles de agente** (se cambian con `Tab`): `kairos` (normal) y `kairos-auto` (sin preguntas). Los agentes `build` y `plan` de OpenCode quedan desactivados para no confundir el selector.
- **Modos de permiso**: normal por defecto; automático con el perfil `kairos-auto` o con `kairos --auto`. La guarda de comandos destructivos siempre está activa.
- **Rutas sensibles protegidas**: credenciales (`~/.ssh`, `~/.gnupg`, `~/.aws`, claves, `auth.json`) bloqueadas en todos los perfiles; `.env`/`.pem` piden confirmación en el perfil normal (ver `SECURITY.md`).
- **Flujo ODD**: `/odd-task <nombre>` crea un documento de feature en el proyecto, con checklist y criterios observables.
- **Revisión** (`/review`), **juicio adversarial** (`/judge`) y **verificación** (`/verify`), con los subagentes de gentle-shell.
- **Memoria** persistente mediante el servidor MCP `engram`, y documentación de librerías mediante `context7`.
- **DeepSeek v4.1 Flash por defecto** (`opencode-go/deepseek-v4.1-flash`; requiere suscripción OpenCode Go). Si tienes Ollama, LM Studio, llama.cpp o vLLM activos, sus modelos aparecen automáticamente.
- **Calidad de código**: servidores LSP, formateadores y `snapshot` para deshacer cambios.
- **Sincronización** con la versión instalada de gentle-shell.

## Requisitos

| Componente | Versión | Cómo se obtiene |
|---|---|---|
| Linux (x86_64 o arm64, glibc) | — | Cualquier distribución con glibc |
| `curl` o `wget`, `tar`, `gzip`, `sha256sum`, `git` | — | Gestor de paquetes de tu distribución |
| Node.js | 22 o superior (probado con 26) | `install.sh` lo instala si falta |
| pnpm | 11.22.0 | `install.sh` lo instala si falta |
| OpenCode | 1.18.x | `install.sh` usa el instalador oficial si falta |
| engram | 3.4.0 | `install.sh` descarga el binario oficial |
| Ollama u otro runtime local | opcional | Se detecta al abrir, si está activo |

El proyecto está pensado para **Arch Linux** (es el entorno de desarrollo y pruebas); cualquier otra distribución con glibc funciona igual, porque el instalador no depende de apt, dnf ni zypper. Alpine Linux (musl) no está soportado: Node.js y los binarios de OpenCode se distribuyen para glibc.

## Instalación rápida

Un comando (el instalador clona el repo en `~/.config/kairos` y configura todo):

```bash
curl -fsSL https://raw.githubusercontent.com/runer0101/kairos/main/install.sh | bash
```

¿Prefieres revisarlo antes de ejecutarlo? Es el mismo script, desde el repo:

```bash
git clone https://github.com/runer0101/kairos.git ~/.config/kairos
cd ~/.config/kairos
./install.sh
```

El instalador:

1. Comprueba el sistema y las herramientas básicas.
2. Instala Node.js 24.21.0 si falta, desde nodejs.org, verificando su SHA-256.
3. Instala pnpm 11.22.0 si falta, desde GitHub, verificando su SHA-256. No toca el pnpm del usuario si ya tiene esa versión.
4. Instala OpenCode si falta (instalador oficial de opencode.ai).
5. Descarga engram 3.4.0 si falta, verificando su SHA-256.
6. Instala las dependencias con `pnpm install --frozen-lockfile`.
7. Enlaza el lanzador en `~/.local/bin/kairos` (con el alias corto `kai`) y los temas en `~/.config/opencode/themes/`.
8. Ajusta las rutas locales de `tui.json` y `opencode.json`.
9. Sincroniza con gentle-shell si está instalado.
10. Verifica que OpenCode carga los perfiles antes de terminar.

No instala Ollama ni descarga modelos. Es idempotente: puedes ejecutarlo de nuevo para reparar la instalación.

Si `~/.local/bin` no está en tu `PATH`, añade `export PATH="$HOME/.local/bin:$PATH"` a tu shell.

Para abrirlo usa `kairos` o su alias corto `kai` (el instalador crea ambos enlaces; funciona en cualquier shell).

## Perfiles de agente

Pulsa `Tab` para cambiar de perfil durante una sesión.

| Perfil | Modelo | Permisos | Para qué |
|---|---|---|---|
| `kairos` (por defecto) | `opencode-go/deepseek-v4.1-flash` | Normales | Trabajo diario |
| `kairos-auto` | `opencode-go/deepseek-v4.1-flash` | Sin preguntas | Trabajo autónomo sobre un repositorio de confianza |

Los dos perfiles usan el mismo modelo (DeepSeek v4.1 Flash, requiere suscripción OpenCode Go). Los subagentes sin modelo propio heredan el modelo del perfil activo. `gentle-ai-explore` limita a 15 pasos para acotar el costo de la exploración; el resto de subagentes (incluido `jd-judge-b`) usa DeepSeek v4.1 Flash.

Para cambiar los modelos, edita `agent` en `opencode.json`. No necesitas tocar los prompts.

## Modos de permiso

| Modo | Cómo se activa | Qué pasa |
|---|---|---|
| Normal | Por defecto | Edición y comandos de bash piden confirmación. Las lecturas habituales (`ls`, `git status`, `git diff`, `grep`…) no. |
| Automático | Perfil `kairos-auto` | No pide confirmación. La guarda de comandos destructivos sigue bloqueando. |
| Auto (OpenCode) | `kairos --auto` | Aprueba lo que pediría confirmación. Las reglas `deny` siguen aplicando. |

La guarda de comandos destructivos bloquea, en todos los modos, formas reconocibles como `rm -rf` sobre rutas peligrosas, `git push --force`, `DROP`/`TRUNCATE` y `DELETE` sin `WHERE`. Es un filtro heurístico, no un sandbox.

Además hay un **piso inviolable de rutas sensibles**: leer o escribir en `~/.ssh`, `~/.gnupg`, `~/.aws`, `.git-credentials`, `.netrc`, claves `id_*` o `auth.json` se bloquea para el agente en todos los perfiles (también `kairos-auto`, y también vía bash). Los `.env`, `*.pem` y configs de kube/docker piden confirmación en el perfil normal. Detalles y límites en [SECURITY.md](SECURITY.md).

## Comandos

| Comando | Descripción |
|---|---|
| `/gentle-doctor` | Diagnóstico: agentes, comandos, plugins, skills y sincronización |
| `/gentle-models` | Modelos disponibles |
| `/gentle-status` | Cambios del repositorio y siguiente paso |
| `/gentle-usage` | Tokens y costo (`opencode stats`) |
| `/odd-task <nombre>` | Crea `odd/tasks/<nombre>.md` en el proyecto a partir de la plantilla ODD |
| `/review` | Revisa el cambio actual con las lentes que correspondan por tamaño y riesgo |
| `/judge [alcance]` | Judgment Day: dos jueces ciegos con modelos distintos y corrección acotada |
| `/verify` | Verificación independiente con evidencia observada |

### Flujo recomendado

1. **Cambio pequeño y entendido**: pídelo directamente en `kairos`. No hace falta documento.
2. **Tarea grande**: `/odd-task <nombre>` antes de tocar código. Implementa tarea por tarea.
3. **Antes de entregar**: `/review`. Si el cambio toca seguridad, datos o dependencias, `/judge`.
4. **Para dar algo por terminado**: `/verify`. Nada se considera hecho sin salida observada.

## Temas

Cuatro temas en `themes/` (los tres de gentle-shell portados a OpenCode, MIT):

| Tema (`tui.json`) | Estilo |
|---|---|
| `gentleman-kairos` (por defecto) | Rosé Pine con azules profundos |
| `gentle` | Azul frío con acento dorado |
| `gentleman-cute` | Rosas suaves |
| `gentleman-sexy` | Rosas intensos con violeta |

Para cambiar de tema, edita `tui.json` y ajusta `"theme"` con el nombre de la tabla (sin `.json`), o usa el selector de temas de la TUI. `install.sh` enlaza todos los temas en `~/.config/opencode/themes/`.

### Sonidos de aviso (opcional)

`assets/sounds/` trae los tres tonos originales de gentle-shell (MIT), integrados con el **sistema nativo de atención de OpenCode** como pack `kairos`: `done` y `subagent_done` usan `success`, `error` usa `error`, y `permission`/`question` usan `attention`. Actívalo al lanzar:

```bash
KAIROS_SOUNDS=1 kairos
```

Eso lo registra y lo deja activo de forma persistente; también puedes elegirlo a mano en la configuración de atención de OpenCode (`tui.json`), donde se controlan el volumen y si suenan solo cuando la ventana no tiene foco.

### Logo

El arco lleva debajo un texto personal (`kairos` por defecto). Cámbialo editando `LOGO_TEXT` en `tui-plugins/gentle-logo.tsx` o al lanzar:

```bash
KAIROS_LOGO_TEXT=otro-texto kairos
```

Bajo el texto del logo se recuerdan los atajos principales (`Tab`, `ctrl+p`, `/gentle-doctor`).

## IA local (opcional)

El instalador no instala ni descarga modelos locales. Si instalas un runtime, kairos lo detecta al abrir, sin configurar nada:

| Runtime | Puerto por defecto | Proveedor en OpenCode |
|---|---|---|
| Ollama | 11434 | `local-ollama` |
| LM Studio | 1234 | `local-lmstudio` |
| llama.cpp (`llama-server`) | 8080 | `local-llamacpp` |
| vLLM | 8000 | `local-vllm` |

Cualquier servidor compatible con OpenAI que responda en `GET /v1/models` puede añadirse en `local-providers.json` (no se versiona), con un id que empiece por `local-`:

```json
[
  { "id": "local-jan", "name": "Jan (local)", "baseURL": "http://127.0.0.1:1337/v1" }
]
```

Reglas:

- Los modelos aparecen en el selector de modelos (`/models`). El modelo por defecto no cambia.
- Los modelos de embeddings se omiten.
- Las capacidades (herramientas, contexto) son supuestas, porque OpenAI-compatible no las informa. No uses un modelo local que no maneje herramientas bien en los perfiles con agentes.
- Si el runtime no está activo, se ignora sin error.

En una máquina sin recursos puedes desactivar todo lo relacionado con IA local sin tocar el repositorio:

```bash
touch ~/.config/kairos/.no-local-ai   # desactivar en esta máquina
rm ~/.config/kairos/.no-local-ai      # volver a activarla
KAIROS_NO_LOCAL=1 kairos     # desactivar solo esta apertura
```

El marcador `.no-local-ai` no se versiona (está en `.gitignore`): en las demás máquinas la detección sigue activa.

Para ver qué detecta el lanzador: `node scripts/detect-local-models.mjs`.

## Actualizaciones de gentle-shell

Al abrir `kairos`, el lanzador compara la versión instalada de gentle-shell con la última sincronizada. Si cambió, regenera los componentes derivados: subagentes, prompts del orquestador, guarda de comandos y las skills `gentle-ai` y `rdd-defect-workflow`.

Todo se genera en un directorio temporal y se valida antes de escribir. Si gentle-shell cambió algo que el port usa, no se modifica nada y el lanzador abre con la versión anterior.

```bash
node scripts/sync-gentle-shell.mjs --force       # sincronizar ahora
KAIROS_NO_SYNC=1 kairos        # abrir sin sincronizar
```

La sincronización no cambia `opencode.json`, el tema, el logo ni las skills propias. Si una versión nueva de gentle-shell requiere cambios de configuración, hay que aplicarlos a mano.

> **No uses `gentle-sync` sobre este directorio.** Reemplaza el directorio entero con la salida de gentle-ai y borraría esta instalación. La copia local de `gentle-sync` lo bloquea; `GENTLE_SYNC_FORCE=1` lo salta.

## Dependencias y cadena de suministro

Las dependencias se gestionan con pnpm 11.22.0 (`packageManager` en `package.json`). La configuración está en `pnpm-workspace.yaml`:

| Ajuste | Efecto |
|---|---|
| `minimumReleaseAge: 1440` | Una versión recién publicada no se instala hasta pasar 24 horas. Da tiempo a que se detecten paquetes comprometidos. |
| `trustPolicy: no-downgrade` | Falla si una versión tiene menos evidencia de confianza que las anteriores. |
| `trustPolicyIgnoreAfter: 525600` | Omite esa comprobación en paquetes publicados hace más de un año, muchos sin procedencia. Lo reciente sigue verificándose. |
| `trustPolicyExclude: effect@4.0.0-beta.83` | Excepción estrecha y verificada: procedencia SLSA firmada, repositorio `Effect-TS/effect-smol`. Dependencia de `@opencode-ai/plugin`. |
| `blockExoticSubdeps: true` | Las dependencias transitivas solo pueden venir del registro, no de git ni de URLs. |
| `strictDepBuilds: true` + `allowBuilds` | Los scripts de instalación están bloqueados salvo decisión explícita. `msgpackr-extract` (addon nativo opcional) está desactivado a propósito. |

El lockfile (`pnpm-lock.yaml`) se instala con `--frozen-lockfile`: si no coincide con `package.json`, la instalación falla en lugar de cambiar versiones en silencio.

El binario de pnpm y el de engram se verifican con SHA-256 fijado en `install.sh`. El de pnpm también tiene atestación de procedencia de GitHub (`gh attestation verify <archivo> -R pnpm/pnpm`).

## Pruebas

```bash
pnpm test                           # 58 pruebas: configuración, agentes, comandos, detector, guarda, lanzador, sincronización, privacidad, temas, sonidos y rutas sensibles
KAIROS_E2E=1 pnpm test     # añade pruebas con OpenCode real y el modelo por defecto
```

Las pruebas de extremo a extremo llaman al binario de OpenCode y al modelo, por eso son opcionales. La prueba de privacidad recorre los archivos versionados y falla si aparece una ruta de tu máquina o un correo personal: el repositorio se publica tal cual.

## Estructura del repositorio

```
kairos/
├── bin/kairos              Lanzador: fija variables, detecta IA local, sincroniza
├── install.sh                       Instalador para Linux
├── opencode.json                    Perfiles, modo normal, modelo por defecto, MCP, LSP y formateo
├── tui.json                         Tema, logo y statusline
├── prompts/orchestrator.md          Prompt común de los perfiles (generado)
├── agents/                          Subagentes de gentle-shell (generados)
├── gentle-assets/                   Referencias perezosas del orquestador (generadas)
├── commands/                        Comandos /gentle-*, /odd-task, /review, /judge, /verify
├── odd/                             Plantilla y guía del flujo ODD
├── plugins/gentle-shell.ts          Guarda de comandos destructivos y notificación al terminar
├── lib/destructive-command-guard.ts Lógica de la guarda (copia de gentle-pi)
├── scripts/
│   ├── detect-local-models.mjs      Detección de runtimes de IA local
│   └── sync-gentle-shell.mjs        Sincronización con gentle-shell
├── skills/                          Skills (33)
├── themes/                          Temas (gentleman-kairos, gentle, gentleman-cute, gentleman-sexy)
├── tui-plugins/gentle-logo.tsx      Logo para la TUI
├── tests/                           Pruebas (node:test)
├── docs/ARCHITECTURE.md             Arquitectura y decisiones de diseño
├── pnpm-workspace.yaml              Ajustes de pnpm y políticas de seguridad
├── pnpm-lock.yaml                   Versiones fijadas
└── LICENSE-gentle-shell             Licencia MIT de los componentes derivados
```

Detalles de cada componente, el mapeo de Pi a OpenCode y el flujo de actualización están en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Qué no incluye

Algunas piezas de gentle-shell dependen de la API o de la interfaz propia de Pi, y no se portaron:

- La barra fullscreen, paneles de uso, animaciones y regiones de puntero de la TUI de Pi (los sonidos sí se portaron, opt-in).
- La autoridad nativa de revisión (RDD), Herdr y el clasificador de la aprobación automática de Pi.
- Los comandos `/gentle:*` que dependían de esas piezas.

## Seguridad

Resumen: detalle completo, límites y cómo ajustarlo en [SECURITY.md](SECURITY.md).

- El repositorio no contiene claves ni credenciales. Las claves de proveedores se guardan fuera del repo (`~/.local/share/opencode/auth.json`).
- `.gitignore` excluye `node_modules/`, respaldos, `.env`, `auth.json`, claves privadas y el marcador local de sincronización.
- La guarda de comandos destructivos es heurística: reconoce formas comunes, no es un sandbox.
- Los perfiles con permisos amplios (`kairos-auto`, `--auto`) deben usarse solo en repositorios de confianza.
- Antes de compartir una sesión o un log, revisa que no incluya rutas o datos personales.

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `falta .../opencode.json` | Repositorio incompleto o enlace roto | `kairos --where` muestra la ruta real |
| El tema no cambia | Enlace de tema ausente | Vuelve a ejecutar `./install.sh` |
| `no se pudo sincronizar con gentle-shell` | gentle-shell no instalado o con una API distinta | `node scripts/sync-gentle-shell.mjs --force` para ver el detalle |
| `ERR_PNPM_TRUST_DOWNGRADE` al instalar | Un paquete reciente perdió evidencia de confianza | No lo ignores: revisa la procedencia del paquete en el registro (atestaciones) y, si es legítimo, añade una excepción estrecha en `trustPolicyExclude` |
| `ERR_PNPM_IGNORED_BUILDS` | Un script de instalación sin decisión | Decide en `allowBuilds` de `pnpm-workspace.yaml` |
| El modelo no responde | Sin red, sin suscripción OpenCode Go o límite del proveedor | `kairos run "ok"` para diagnosticar |
| `/gentle-doctor` muestra `sin marcador` | Nunca se sincronizó | `node scripts/sync-gentle-shell.mjs --force` |
| Aviso `background dependency install failed` o arranque lento | npm (que OpenCode ejecuta sobre el directorio de config) crashea al recorrer el layout de symlinks de pnpm | Ya prevenido: el repo usa `nodeLinker: hoisted`; si reaparece, ejecuta `pnpm install` |

## Contribuir

- ¿Ideas o fallos? Abre un *issue* con el caso concreto: comando o ruta, resultado esperado y resultado observado.
- ¿Código? Pasa `pnpm test` antes de enviar. El proyecto sigue su propio flujo ODD (`/odd-task`) y los commits van por unidad de trabajo.
- No incluyas datos personales en issues, logs ni capturas: el repositorio mantiene una prueba de privacidad que falla ante rutas o correos.

## Créditos y licencia

Mantenido por [@runer0101](https://github.com/runer0101).

Este repositorio se distribuye bajo **licencia MIT** (ver [LICENSE](LICENSE)).

- Los subagentes, la guarda de comandos, los prompts del orquestador y las skills `gentle-ai` y `rdd-defect-workflow` se derivan de **gentle-pi** (gentle-shell), de [Gentleman Programming](https://github.com/Gentleman-Programming), bajo licencia MIT. Ver `LICENSE-gentle-shell`.
- Las demás skills de `skills/` se incorporaron desde el ecosistema gentle-ai. Revisa su licencia de origen antes de redistribuirlas.
- Los tonos de `assets/sounds/` son originales de gentle-pi (MIT); su nota de licencia está junto a los archivos.
- Los servidores MCP (`engram`, `context7`) son proyectos externos, cada uno con su propia licencia.
