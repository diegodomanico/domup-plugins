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

## Correr (ubicador de producto + montar.py + controles puros)

1. **Ubicar producto antes de montar** (evita que rótulos o subtítulos tapen el producto, usando `${CLAUDE_PLUGIN_ROOT}/fabrica/lib/ubicar-producto-puro.mjs`):
   - Corré `node ${CLAUDE_PLUGIN_ROOT}/fabrica/lib/ubicar-producto-puro.mjs cuadros <carpeta del clip>` → extrae `montaje-cajas/eN.jpg` (720×1280).
   - Mirá cada cuadro con `Read` (o en subagente localizador) y guardá `{ "1": [x0, y0, x1, y1], ... }` en `cajas-tmp.json`, luego corré `node ${CLAUDE_PLUGIN_ROOT}/fabrica/lib/ubicar-producto-puro.mjs guardar <carpeta del clip> cajas-tmp.json`.
2. **Correr `montar.py`** (HyperFrames se resuelve directo sin `shell=True`, sin generar `.ps1`):
   - En Windows: `python ${CLAUDE_PLUGIN_ROOT}/fabrica/montaje/montar.py <carpeta del clip>`
   - En Mac: `~/Documents/Fabrica\ DomUP/.venv/bin/python ${CLAUDE_PLUGIN_ROOT}/fabrica/montaje/montar.py <carpeta del clip>` (o `python3` si tiene `cv2`, `PIL`, `numpy`)
   con las variables de `.env.local` cargadas y `MARCA_JSON` apuntando al `marca.json` que imprimió `marca-auto.mjs`. Sale `entrega/<item>-<pedido>.mp4` y `montaje/linea.json`.
3. **Control puro obligatorio antes de `clip_revisar(paso="final")`**:
   - Corré `node ${CLAUDE_PLUGIN_ROOT}/fabrica/lib/controles-puros.mjs clip <carpeta del clip>` (`controlarClip` puro: verifica receta de voces, huecos ≤ 0,8 s, transcripción del audio final contra el guion, -14 ± 0,5 LUFS, duración 12–18 s en 6 escenas, D008 subtítulo vs voz y nombre de marca dicho). Si sale con código 1, corregí y re-montá antes de pasar a `clip_revisar`.

Lo que el script garantiza (y controla): carátula 0,6 s; todo a 1,13x; aire de 0,3 s entre frases; la voz de Flow nunca entra; subtítulos con su parte de arriba en y=740 (660 si tapa una cara ni pisa producto/logo) y nada debajo de 880; logo en la escena 3-4; efectos HyperFrames del kit; música de la marca con sidechain; cierre animado de 3 a 4,1 s; mezcla a -14 LUFS con true peak de -1,5. Si frena con «quedaría X s congelado», se acorta la frase o se anima esa escena a 6 u 8 s, como dice el mensaje.

**Sin sesión local**: el mismo script corre en la ejecución de código de Claude (con los archivos ya subidos en la sesión) y se entrega el MP4 en el chat, pidiéndole al vendedor que lo descargue desde `claude.ai` en una pestaña o desde la app de escritorio (no desde el panel lateral de Chrome, donde las tarjetas de archivo no descargan). Si en ejecución de código falla o falta HyperFrames, no se improvisa ni se piden zips o comandos: indicá pasar a Claude Code o app de escritorio con su carpeta. Nunca generes scripts `.ps1`.

## Chequeo local de audio obligatorio + Puerta (`clip_revisar` final obligatorio)

**Nunca entregues el MP4 sin pasar `controles-puros.mjs clip` y `clip_revisar(paso="final")` con `APTO`.**

1. `controles-puros.mjs clip <carpeta>` + chequeo `ffprobe` / `ffmpeg ebur128`:
   - Confirmar pista de audio completa (diferencia ≤ 0,5 s respecto al video), música en mezcla (sin silencio largo > 1,5 s) y `-14 ± 0,5 LUFS`.
2. **Cuadros para el revisor**: achicá a 1080 px de lado largo con ffmpeg (carátula + 1 fotograma por escena + cierre), subí con `clip_revisar_subir(cantidad=N, clip_ref?, item_id?, paso="final")` (`curl --fail-with-body`) o pasá URL pública `https` / base64 a `clip_revisar`. Sin terminal (`claude.ai` en el navegador): pedile al vendedor que arrastre los archivos al chat. Nunca pegues URL firmadas en el chat.
3. Llamá `clip_revisar(item_id, paso="final", imagenes=[carátula + 1 fotograma por escena + cierre], notas="audio_ok=<true|false>; dur_video=<s>; dur_audio=<s>; lufs=<I>; musica_en_mezcla=<true|false>; silencios_largos=<N>; logo_px=<WxH>", clip_ref=...)`. El revisor final rechaza como **bloqueante**: audio cortado, falta de música, logo pixelado o falta de animaciones HyperFrames. Con NO APTO se corrige y se revisa una vez más.

**Regla obligatoria de trazabilidad**: al terminar el montaje (o si falla/hay aviso), llamá a `clip_registrar_paso(cust_id?, clip_ref, paso="montaje", estado="ok"|"error"|"aviso", item_id, detalle={ duracion_s, lufs, archivo_final, plugin_version, motivo? })` usando el `clip_ref` de `clip-<item>/config.json`, y al entregar el MP4 final aprobado llamá a `clip_registrar_paso(cust_id?, clip_ref, paso="entregado", estado="ok", item_id, detalle={ duracion_s, lufs, archivo_final, creditos_flow, caracteres_elevenlabs, plugin_version })`. **Importante**: `archivo_final` debe ser SOLO el nombre de archivo o una ruta relativa a la carpeta del clip (ej. `"entrega/<item>-<pedido>.mp4"`), NUNCA una ruta absoluta (`C:\Users\...`, `/Users/...`, `/home/...`), porque el servidor la rechaza. Si falla el registro, avisá y seguí, nunca frenes el clip por eso.
