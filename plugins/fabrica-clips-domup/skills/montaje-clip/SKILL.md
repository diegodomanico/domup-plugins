---
name: montaje-clip
description: Monta el clip final de MercadoLibre con el script de montaje de la fábrica DomUP (montar.py) — carátula, cortes por voz, 1,13x, subtítulos en zona segura, logo a mitad del clip, efectos HyperFrames, cierre de marca y -14 LUFS — y lo pasa por el revisor final. Usar cuando pidan «editá el clip», «montá el video», «armá el final» o como paso 6 de fabrica-clip.
---

## ⛔ Procedimiento obligatorio

- **Siempre con el kit de la fábrica y HyperFrames**: se monta con `clip_kit_montaje(cust_id?, clip_ref?, item_id?)` + `${CLAUDE_PLUGIN_ROOT}/fabrica/montaje/montar.py` (y su plantilla `build-vq.mjs` con las animaciones de HyperFrames: logo a mitad del clip, rótulos/efectos, subtítulos y cierre animado de marca, más la pista de música de la marca), nunca sin animaciones ni sin música, y nunca con un proyecto inventado de HyperFrames o Remotion.
- **Con sesión local** (Claude Code o app de escritorio con carpeta): Claude corre todo él mismo y deja el MP4 en la carpeta del clip (`entrega/<item>-<pedido>.mp4`).
- **Sin sesión local** (`claude.ai` en el navegador o el panel lateral de Chrome): el render corre en la ejecución de código de Claude y se entrega el MP4 en el chat. **Prohibido pasarle al vendedor zips o bloques de comandos.** Si falta HyperFrames o el entorno en ejecución de código y falla, no se improvisa un proyecto ni se piden zips o comandos: se le indica abrir **Claude Code** o la **app de escritorio** con su carpeta y se sigue ahí.
- **Panel lateral de Chrome**: desde el panel lateral de Chrome los archivos del chat no se descargan; si se entrega el MP4 en el chat, pedile al vendedor que lo baje desde la **app de escritorio** o desde **`claude.ai` en una pestaña**.
- **Subtítulos**: la palabra clave cambia solo de color, nunca de tamaño (si se agranda, pisa la palabra vecina).
- **Logo sin pixelar**: si `marca-auto.mjs` avisa que el logo original mide menos de 512 px (`logo_chico: true`), no lo escales por encima de su tamaño original; si se ve pixelado en el revisor final, pedí cargar un logo de mejor resolución en domup.app o usá el de la tienda oficial. Prohibido pedirle el logo al alumno si `clip_kit_montaje` o `clip_receta` ya devolvió `logo_url`.

# Montaje (el mismo script de la fábrica)

El montaje es `${CLAUDE_PLUGIN_ROOT}/fabrica/montaje/montar.py`, el mismo que corre en DomUP: no hay criterio, son reglas en código. Si falta algo para correrlo, usá la habilidad `instalar-fabrica` («instalá la fábrica de clips»).

## Entradas (en la carpeta del clip, como en la fábrica)

| Archivo | De dónde sale |
|---|---|
| `pedido.json` | `clip_receta` (lo armó `fabrica-clip`) |
| `kit-montaje.json` | salida de `clip_kit_montaje(cust_id?, clip_ref?, item_id?)` |
| `plan.json`, `paneles/manifest.json` | `storyboard-flow` |
| `anim-plan.json`, `anim/e1.mp4 … e6.mp4` | `animacion-flow` |
| `voz/manifest.json` y las tomas | `voces-elevenlabs` |
| identidad de la marca (`MARCA_JSON`) | `node ${CLAUDE_PLUGIN_ROOT}/fabrica/lib/marca-auto.mjs --pedido <clip>/pedido.json --kit <clip>/kit-montaje.json --out <clip>` (usa `logo_url` y `musica_url_firmada` de `clip_kit_montaje` sin gastar ElevenLabs extra; si falta `musica_url_firmada`, genera música con `ELEVENLABS_API_KEY`) |

## Correr

- En Windows: `python ${CLAUDE_PLUGIN_ROOT}/fabrica/montaje/montar.py <carpeta del clip>`
- En Mac: `~/Documents/Fabrica\ DomUP/.venv/bin/python ${CLAUDE_PLUGIN_ROOT}/fabrica/montaje/montar.py <carpeta del clip>` (o `python3` si tiene `cv2`, `PIL`, `numpy`)
con las variables de `.env.local` cargadas y `MARCA_JSON` apuntando al `marca.json` que imprimió `marca-auto.mjs`. Sale `entrega/<item>-<pedido>.mp4` y `montaje/linea.json`.

Lo que el script garantiza (y hay que comprobar al final): carátula 0,6 s; todo a 1,13x; aire de 0,3 s entre frases; la voz de Flow nunca entra; subtítulos con su parte de arriba en y=740 (660 si tapa una cara) y nada debajo de 880; logo en la escena 3-4; efectos HyperFrames del kit; música de la marca con sidechain; cierre animado de 3 a 4,1 s; mezcla a -14 LUFS con true peak de -1,5. Si frena con «quedaría X s congelado», se acorta la frase o se anima esa escena a 6 u 8 s, como dice el mensaje.

**Sin sesión local**: el mismo script corre en la ejecución de código de Claude (con los archivos ya subidos en la sesión) y se entrega el MP4 en el chat, pidiéndole al vendedor que lo descargue desde `claude.ai` en una pestaña o desde la app de escritorio (no desde el panel lateral de Chrome, donde las tarjetas de archivo no descargan). Si en ejecución de código falla o falta HyperFrames, no se improvisa ni se piden zips o comandos: indicá pasar a Claude Code o app de escritorio con su carpeta.

## Chequeo local de audio obligatorio + Puerta (`clip_revisar` final obligatorio)

**Nunca entregues el MP4 sin pasar por `clip_revisar(paso="final")` y obtener `APTO`.**

1. **Verificación local obligatoria de audio y música** antes de llamar a `clip_revisar(paso="final")`:
   - Verificá con `ffprobe` que exista pista de audio y que su duración coincida con la del video (diferencia ≤ 0,5 s, sin audio cortado):
     `ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,codec_name,duration -of json <entrega.mp4>`
   - Medí sonoridad y confirmá que la música entró en la mezcla (especialmente en el cierre, sin silencio largo > 1,5 s):
     `ffmpeg -i <entrega.mp4> -af ebur128,silencedetect=noise=-45dB:d=1.5 -f null -`
   - Si falta audio, está cortado, o no entró música, corregí y re-montá antes de revisar.
2. **Cuadros para el revisor**: achicá a 1080 px de lado largo con ffmpeg (carátula + 1 fotograma por escena + cierre), pedí `clip_revisar_subir(cantidad=N, clip_ref?, item_id?, paso="final")`, subí cada uno con el `curl --fail-with-body` que devuelve y pasá los path a `clip_revisar`. Sin terminal (`claude.ai` en el navegador): pedile al vendedor que arrastre los archivos al chat. Nunca pegues las URL firmadas en el chat.
3. Llamá `clip_revisar(item_id, paso="final", imagenes=[carátula + 1 fotograma por escena + cierre], notas="audio_ok=<true|false>; dur_video=<s>; dur_audio=<s>; lufs=<I>; musica_en_mezcla=<true|false>; silencios_largos=<N>; logo_px=<WxH>", clip_ref=...)`. El revisor final rechaza como **bloqueante**: audio cortado, falta de música, logo pixelado o falta de animaciones HyperFrames. Con NO APTO se corrige y se revisa una vez más.

Al terminar el montaje (o si falla), registrá con `clip_registrar_paso(cust_id?, clip_ref, paso="montaje", estado="ok"|"error", item_id, detalle={ duracion_s, lufs, plugin_version, motivo? })` usando el `clip_ref` de `clip-<item>/config.json`, y con `paso="entregado"` al entregar el MP4 final aprobado. Si falla el registro, avisá y seguí, nunca frenes el clip por eso.
