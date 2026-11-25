---
name: montaje-clip
description: Monta el clip final de MercadoLibre con el script de montaje de la fábrica DomUP (montar.py) — carátula, cortes por voz, 1,13x, subtítulos en zona segura, logo a mitad del clip, efectos HyperFrames, cierre de marca y -14 LUFS — y lo pasa por el revisor final. Usar cuando pidan «editá el clip», «montá el video», «armá el final» o como paso 6 de fabrica-clip.
---

## ⛔ Procedimiento obligatorio

- **Siempre con el kit de la fábrica**: se monta con `clip_kit_montaje` + `${CLAUDE_PLUGIN_ROOT}/fabrica/montaje/montar.py` (y su plantilla `build-vq.mjs`), nunca con un proyecto inventado de HyperFrames o Remotion.
- **Con sesión local** (Claude Code o app de escritorio con carpeta): Claude corre todo él mismo y deja el MP4 en la carpeta del clip (`entrega/<item>-<pedido>.mp4`).
- **Sin sesión local** (`claude.ai` en el navegador o el panel lateral de Chrome): el render corre en la ejecución de código de Claude y se entrega el MP4 en el chat. **Prohibido pasarle al vendedor zips o bloques de comandos.** Si falta HyperFrames o el entorno en ejecución de código y falla, no se improvisa un proyecto ni se piden zips o comandos: se le indica abrir **Claude Code** o la **app de escritorio** con su carpeta y se sigue ahí.
- **Panel lateral de Chrome**: desde el panel lateral de Chrome los archivos del chat no se descargan; si se entrega el MP4 en el chat, pedile al vendedor que lo baje desde la **app de escritorio** o desde **`claude.ai` en una pestaña**.
- **Subtítulos**: la palabra clave cambia solo de color, nunca de tamaño (si se agranda, pisa la palabra vecina).

# Montaje (el mismo script de la fábrica)

El montaje es `${CLAUDE_PLUGIN_ROOT}/fabrica/montaje/montar.py`, el mismo que corre en DomUP: no hay criterio, son reglas en código. Si falta algo para correrlo, usá la habilidad `instalar-fabrica`.

## Entradas (en la carpeta del clip, como en la fábrica)

| Archivo | De dónde sale |
|---|---|
| `pedido.json` | `clip_receta` (lo armó `fabrica-clip`) |
| `plan.json`, `paneles/manifest.json` | `storyboard-flow` |
| `anim-plan.json`, `anim/e1.mp4 … e6.mp4` | `animacion-flow` |
| `voz/manifest.json` y las tomas | `voces-elevenlabs` |
| identidad de la marca (`MARCA_JSON`) | `node ${CLAUDE_PLUGIN_ROOT}/fabrica/lib/marca-auto.mjs` con el logo y la esencia de `clip_kit_montaje`: logo, color con contraste 4,5:1, música de ElevenLabs y «TIENDA OFICIAL <MARCA>» |

## Correr

`python ${CLAUDE_PLUGIN_ROOT}/fabrica/montaje/montar.py <carpeta del clip>` con las variables de `.env.local` cargadas y `MARCA_JSON` apuntando a la identidad. Sale `entrega/<item>-<pedido>.mp4` y `montaje/linea.json`.

Lo que el script garantiza (y hay que comprobar al final): carátula 0,6 s; todo a 1,13x; aire de 0,3 s entre frases; la voz de Flow nunca entra; subtítulos con su parte de arriba en y=740 (660 si tapa una cara) y nada debajo de 880; logo en la escena 3-4; cierre de 3 a 4,1 s; mezcla a -14 LUFS con true peak de -1,5. Si frena con «quedaría X s congelado», se acorta la frase o se anima esa escena a 6 u 8 s, como dice el mensaje.

**Sin sesión local**: el mismo script corre en la ejecución de código de Claude (con los archivos ya subidos en la sesión) y se entrega el MP4 en el chat, pidiéndole al vendedor que lo descargue desde `claude.ai` en una pestaña o desde la app de escritorio (no desde el panel lateral de Chrome, donde las tarjetas de archivo no descargan). Si en ejecución de código falla o falta HyperFrames, no se improvisa ni se piden zips o comandos: indicá pasar a Claude Code o app de escritorio con su carpeta.

## Puerta

Si los cuadros están en archivos (Descargas o la carpeta de trabajo): achicalos a 1080 px de lado largo con ffmpeg, pedí `clip_revisar_subir(cantidad=N)`, subí cada uno con el `curl --fail-with-body` que devuelve y pasá los path a `clip_revisar`. Sin terminal (claude.ai en el navegador): pedile al vendedor que arrastre los archivos al chat. Nunca pegues las URL firmadas en el chat.

`clip_revisar(item_id, paso="final", imagenes=[carátula + 1 fotograma por escena + cierre])` y la consigna `references/revisor-final.md`. Con NO APTO se corrige y se revisa una vez más.
