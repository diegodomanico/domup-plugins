---
name: instalar-fabrica
description: Deja lista la computadora del vendedor para correr la fábrica de clips DomUP igual que en DomUP (ffmpeg, Python con OpenCV y Pillow, Node, HyperFrames, el conector local de Google Flow con la sesión de Google iniciada) y verifica cada pieza sin pedirle comandos al alumno. Usar la primera vez, cuando pidan «instalá la fábrica», «preparame la compu para los clips» o cuando fabrica-clip diga que falta algo.
---

# Instalar la fábrica en tu computadora

La fábrica corre en una **sesión local** (Claude Code o la app de escritorio de Claude con una carpeta conectada), porque el montaje y el conector de Flow corren en la máquina del vendedor, como en la PC de DomUP.

**Regla clave:** al alumno **no se le piden comandos de terminal** (ni winget, ni pip, ni npm install). Verificá primero en silencio con `get_device_info` / `flow_status` / chequeos internos (`ffmpeg -version`, `python -c "import cv2, PIL, numpy"`, `node --version`, `curl.exe --version`, `npx hyperframes --version`) y mostrá una tabla final ✅/❌:

| Pieza | Cómo se verifica | Si falta en Windows |
|---|---|---|
| ffmpeg y ffprobe | `ffmpeg -version` | Ejecutar `instalar-fabrica.cmd` (doble clic) |
| Python 3.12 + librerías (`cv2`, `PIL`, `numpy`) | `python -c "import cv2, PIL, numpy"` | Ejecutar `instalar-fabrica.cmd` (doble clic) |
| Node 20+ | `node --version` | Ejecutar `instalar-fabrica.cmd` (doble clic) |
| HyperFrames (efectos del montaje) | `npx hyperframes --version` | se baja solo la primera vez con `npx hyperframes` |
| curl (subir cuadros al revisor) | `curl.exe --version` (Mac: `curl --version`) | viene con Windows 10/11 y macOS |
| Conector `domup-flow` | `flow_status` responde OK y aparece `flow_upload_image` | viene empaquetado con el plugin (sin `npm install`); si no aparece, verificá Node 20+ y reiniciá Claude |
| Sesión de Google en Flow | `flow_status` dice que hay sesión | si falta sesión, el instalador o Claude abre Flow con la cuenta de Google del plan (Pro: 1.000 créditos por mes) |
| Clave de ElevenLabs | `ELEVENLABS_API_KEY` en `.env.local` | se pega una sola vez en `.env.local` (lo abre el Bloc de notas al final del instalador); nunca en el chat |
| Carpeta de trabajo | existe `Documentos\Fabrica DomUP\clips` | la crea `instalar-fabrica.cmd` |

## Si falta alguna pieza en Windows

No le dictes comandos de PowerShell ni de terminal al alumno. Decile exactamente:
> «Abrí la carpeta del plugin en `${CLAUDE_PLUGIN_ROOT}/instalar/` y hacé doble clic en **`instalar-fabrica.cmd`**. Cuando termine (y pegues tu `ELEVENLABS_API_KEY` en el archivo que te abre), cerrá y volvé a abrir Claude.»

(En Mac: instalá con Homebrew si el usuario lo autoriza, manteniendo las mismas piezas.)

## Reporte de conexión a DomUP

Cuando `flow_status` confirme la sesión de Google en Flow (o falle), llamá `flow_estado_reportar(conectado, plugin_version, cust_id?)` con el `version` de `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` (si tenés varias cuentas, usá `cuentas` para obtener el `cust_id`; con una sola cuenta es opcional). No mandes nada más: ni la cuenta de Google ni datos de la sesión.

## Variables de `.env.local`

`instalar-fabrica.cmd` deja `.env.local` en `Documentos\Fabrica DomUP\.env.local` solo con:
- `CLIPS_RAIZ=<Documentos>/Fabrica DomUP/clips`
- `CLIPS_ENV_LOCAL=<Documentos>/Fabrica DomUP/.env.local`
- `ELEVENLABS_API_KEY=<tu-clave>` (la pega el alumno en Notepad)

`SHORTS_MTL` y `CLIPS_SKILL_SCRIPTS` **no** se fijan en `.env.local` porque se resuelven relativos a `${CLAUDE_PLUGIN_ROOT}` para que las actualizaciones del plugin entren solas.

Sin sesión local (solo claude.ai en el navegador), la fábrica igual corre con Claude en Chrome sobre Flow y el montaje se hace en la ejecución de código de Claude; decíselo al vendedor y seguí.
