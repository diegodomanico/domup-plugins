---
name: instalar-fabrica
description: Deja lista la computadora del vendedor para correr la fábrica de clips DomUP igual que en DomUP (ffmpeg, Python con OpenCV y Pillow, Node, HyperFrames, el conector local de Google Flow con la sesión de Google iniciada) y verifica cada pieza. Usar la primera vez, cuando pidan «instalá la fábrica», «preparame la compu para los clips» o cuando fabrica-clip diga que falta algo.
---

# Instalar la fábrica en tu computadora

La fábrica corre en una **sesión local** (Claude Code o la app de escritorio de Claude con una carpeta conectada), porque el montaje y el conector de Flow corren en la máquina del vendedor, como en la PC de DomUP.

Verificá cada pieza y, si falta, instalala (pedí OK antes de instalar). Mostrá una tabla final ✅/❌:

| Pieza | Verificar | Instalar |
|---|---|---|
| ffmpeg y ffprobe | `ffmpeg -version` | Windows: `winget install Gyan.FFmpeg` · Mac: `brew install ffmpeg` |
| Python 3.11+ | `python --version` | Windows: `winget install Python.Python.3.12` · Mac: `brew install python` |
| Librerías | `python -c "import cv2, PIL, numpy"` | `python -m pip install opencv-python pillow numpy` |
| Node 20+ | `node --version` | Windows: `winget install OpenJS.NodeJS.LTS` · Mac: `brew install node` |
| HyperFrames (efectos del montaje) | `npx hyperframes --version` | se baja solo con `npx` la primera vez |
| curl (subir cuadros al revisor) | `curl --version` (en PowerShell: `curl.exe --version`) | viene con Windows 10/11 y macOS |
| Conector google-flow | aparecen las herramientas `flow_*` | `cd ${CLAUDE_PLUGIN_ROOT}/vendor/google-flow-mcp && npm install`, reiniciar Claude |
| Sesión de Google en Flow | `flow_status` dice que hay sesión | abrir Flow con la herramienta del conector y entrar con la cuenta de Google del plan (Pro: 1.000 créditos por mes) |
| Clave de ElevenLabs | variable `ELEVENLABS_API_KEY` | se pega una sola vez en el archivo `.env.local` de la carpeta de trabajo; nunca en el chat |
| Carpeta de trabajo | existe `clips/` en la carpeta conectada | crearla |

Cuando `flow_status` confirme la sesión de Google en Flow (o falle), llamá `flow_estado_reportar(conectado, plugin_version, cust_id?)` con el `version` de `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` (si tenés varias cuentas, usá `cuentas` para obtener el `cust_id`; con una sola cuenta es opcional). No mandes nada más: ni la cuenta de Google ni datos de la sesión.

Variables que el montaje lee (escribilas en `.env.local` de la carpeta de trabajo): `CLIPS_RAIZ=<carpeta de trabajo>/clips`, `CLIPS_ENV_LOCAL=<carpeta de trabajo>/.env.local`, `SHORTS_MTL=${CLAUDE_PLUGIN_ROOT}/vendor/shorts-mtl`, `CLIPS_SKILL_SCRIPTS=${CLAUDE_PLUGIN_ROOT}/vendor/shorts-mtl/scripts`.

Sin sesión local (solo claude.ai en el navegador), la fábrica igual corre con Claude en Chrome sobre Flow y el montaje se hace en la ejecución de código de Claude; decíselo al vendedor y seguí.
