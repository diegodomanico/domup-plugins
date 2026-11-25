---
name: instalar-fabrica
description: Instala la fábrica de clips DomUP (videos cortos de producto para Mercado Libre) en tu computadora (Windows o Mac) igual que en DomUP — ffmpeg, Python con OpenCV y Pillow, Node, HyperFrames y el conector local de Google Flow con la sesión de Google iniciada — y verifica cada pieza sin pedirle comandos al alumno. Usar la primera vez, cuando pidan «instalá la fábrica de clips», «preparame la compu para los clips» o cuando fabrica-clip diga que falta algo.
---

# Instalar la fábrica de clips en tu computadora

La fábrica corre en una **sesión local** (Claude Code o la app de escritorio de Claude con una carpeta conectada), porque el montaje y el conector de Flow corren en la máquina del vendedor, como en la PC de DomUP.

**Paso 0 · Detectá el sistema primero (`get_device_info` / `uname -s` / `process.platform`)** para saber si el alumno está en **Windows** o **Mac (macOS)**, y usá siempre las rutas, el editor y el instalador que corresponden a su sistema.

**Regla clave:** al alumno **no se le piden comandos de terminal** (ni winget, ni brew, ni pip, ni npm install). Verificá primero en silencio con `get_device_info` / `flow_status` / chequeos internos (`ffmpeg -version`, Python con `import cv2, PIL, numpy`, `node --version`, `hyperframes --version` o `npx hyperframes --version`, `curl`) y mostrá una tabla final ✅/❌:

| Pieza | Cómo se verifica | Si falta en Windows | Si falta en Mac |
|---|---|---|---|
| ffmpeg y ffprobe | `ffmpeg -version` y `ffprobe -version` | Ejecutar `instalar-fabrica.cmd` (doble clic) | Ejecutar `instalar-fabrica.command` (doble clic) o `brew install ffmpeg` por Claude en sesión local |
| Python 3.12 + librerías (`cv2`, `PIL`, `numpy`) | Win: `python -c "import cv2, PIL, numpy"` · Mac: `~/Documents/Fabrica DomUP/.venv/bin/python -c "import cv2, PIL, numpy"` (o `python3`) | Ejecutar `instalar-fabrica.cmd` (doble clic) | Ejecutar `instalar-fabrica.command` (arma `.venv` por PEP 668) o `brew install python@3.12` + venv por Claude |
| Node 20+ | `node --version` (v20 o superior) | Ejecutar `instalar-fabrica.cmd` (doble clic) | Ejecutar `instalar-fabrica.command` (`node@20` + `brew link` + `~/.zprofile`) |
| HyperFrames (efectos del montaje) | `hyperframes --version` (o `npx hyperframes --version`) | `npm install -g hyperframes` o `npx hyperframes` | `npm install -g hyperframes` (en `instalar-fabrica.command`) o `npx hyperframes` |
| curl (subir cuadros al revisor) | Win: `curl.exe --version` · Mac: `curl --version` | viene con Windows 10/11 | viene con macOS |
| Conector `domup-flow` | `flow_status` responde OK y aparece `flow_upload_image` | viene empaquetado con el plugin (sin `npm install`); si no aparece, verificá Node 20+ y reiniciá Claude | viene empaquetado con el plugin; si no aparece, verificá Node 20+ linkeado en `~/.zprofile` y reiniciá Claude |
| Sesión de Google en Flow | `flow_status` dice que hay sesión | si falta sesión, Claude abre Flow con la cuenta de Google del plan (Pro: 1.000 créditos/mes) | en Mac corre con ventana visible; si pide sesión o verificación, se completa directo en la ventana de Flow |
| Clave de ElevenLabs | `ELEVENLABS_API_KEY` en `.env.local` | se pega una sola vez en `Documentos\Fabrica DomUP\.env.local` (lo abre Bloc de notas); nunca en el chat | se pega una sola vez en `~/Documents/Fabrica DomUP/.env.local` (lo abre TextEdit); nunca en el chat |
| Carpeta de trabajo | Win: `Documentos\Fabrica DomUP\clips` · Mac: `~/Documents/Fabrica DomUP/clips` | la crea `instalar-fabrica.cmd` | la crea `instalar-fabrica.command` |

## Si falta alguna pieza (en sesión local)

1. **Si falta algo que Claude puede instalar directo en la sesión local** (por ejemplo `hyperframes`, librerías Python en el `.venv`, o un paquete con `brew` / `winget` ya presente y sin pedir sudo interactivo), **instalalo vos mismo primero** antes de mandar al alumno al instalador.
2. Si falta la instalación base o el entorno completo (o en Mac falta Homebrew / contraseña de administrador), mandalo al instalador de su sistema (sin dictarle comandos de terminal):
   - **En Windows**:
     > «Abrí la carpeta del plugin en `${CLAUDE_PLUGIN_ROOT}/instalar/` y hacé doble clic en **`instalar-fabrica.cmd`**. Cuando termine (y pegues tu `ELEVENLABS_API_KEY` en el Bloc de notas que te abre), cerrá y volvé a abrir Claude.»
   - **En Mac (macOS)**:
     > «Abrí la carpeta del plugin en `${CLAUDE_PLUGIN_ROOT}/instalar/` y hacé doble clic en **`instalar-fabrica.command`** (si te pide la contraseña de tu Mac para instalar Homebrew, escribila y presioná Enter; si macOS pregunta por seguridad la primera vez, clic derecho → Abrir). Cuando termine (y pegues tu `ELEVENLABS_API_KEY` en TextEdit), cerrá y volvé a abrir Claude.»

## Reporte de conexión a DomUP

Cuando `flow_status` confirme la sesión de Google en Flow (o falle), llamá `flow_estado_reportar(conectado, plugin_version, cust_id?)` con el `version` de `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` (si tenés varias cuentas, usá `cuentas` para obtener el `cust_id`; con una sola cuenta es opcional). No mandes nada más: ni la cuenta de Google ni datos de la sesión.

## Variables de `.env.local`

El instalador deja `.env.local` (`Documentos\Fabrica DomUP\.env.local` en Windows · `~/Documents/Fabrica DomUP/.env.local` en Mac) solo con:
- `CLIPS_RAIZ=<Documentos>/Fabrica DomUP/clips`
- `CLIPS_ENV_LOCAL=<Documentos>/Fabrica DomUP/.env.local`
- `ELEVENLABS_API_KEY=<tu-clave>` (la pega el alumno en Bloc de notas / TextEdit)

`SHORTS_MTL` y `CLIPS_SKILL_SCRIPTS` **no** se fijan en `.env.local` porque se resuelven relativos a `${CLAUDE_PLUGIN_ROOT}` para que las actualizaciones del plugin entren solas.

Sin sesión local (solo claude.ai en el navegador), la fábrica igual corre con Claude en Chrome sobre Flow y el montaje se hace en la ejecución de código de Claude; decíselo al vendedor y seguí.
