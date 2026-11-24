---
name: animacion-flow
description: Anima en Google Flow (con Claude en Chrome) los 6 cuadros aprobados del storyboard de un clip de MercadoLibre, con los bloques fijos de prompt de la fábrica DomUP (primer cuadro, cámara fija, boca y audio controlados), y pasa los tramos por el revisor. Usar cuando pidan «animá el storyboard», «hacé el video en Flow» o como paso 4 de fabrica-clip.
---

# Animación en Flow (6 tramos de 4 s)
> **Cómo se maneja Flow.** Con el conector `google-flow` del plugin (sesión local), igual que la fábrica: `flow_create_project`, subir con nombre único, `flow_generate_image` / `flow_generate_video`, `flow_download_media`. Sin sesión local, lo mismo a mano en `labs.google/flow` con Claude en Chrome.


Consignas originales: `references/animacion-plan.md` (qué escribe Claude: solo la acción de cada escena) y `references/revisor-animacion.md`. El armado de cada prompt sigue `${CLAUDE_PLUGIN_ROOT}/fabrica/lib/prompt-animacion.mjs` (con sesión local se corre: `node … <carpeta del clip>` escribe los prompts en anim-plan.json): los bloques fijos no se escriben a mano, se copian.

## 1 · El prompt de cada escena, armado así y en este orden

1. `Use the attached image as the FIRST FRAME. Photorealistic, natural motion, no AI look.`
2. `STATIC LOCKED-OFF CAMERA: no zoom, no pan, no push-in, single continuous shot, NO cuts.`
3. La acción de la escena (en inglés, lenta, una sola cosa que pasa, nada que caiga, se suelte o se derrame).
4. Si muestra el producto: `<The product> keeps exactly its size and shape, exactly as in the first frame. Same proportion to the hand as in the first frame.` (sin la frase de la mano si no hay personas).
5. Sin personas: `Nobody is in this shot: NO hands, NO arms, NO people enter the frame at any moment…`
6. Voz: si la escena tiene frase **a cámara**, `<persona> looks straight into the camera and, starting within the first half second, SPEAKS this line in <Argentine Spanish (Rioplatense, voseo) | Mexican Spanish | Chilean Spanish | Colombian Spanish | Uruguayan Spanish (voseo)>, with clear natural lip movement matching every syllable: "<frase>" Then closes the mouth and smiles. AUDIO: only that voice…` Si es **en off**: `Nobody speaks: mouths closed or smiling, no words. AUDIO: NO voice, NO speech, NO music: only soft room ambience.`
7. `Keep the background objects untouched. No text, no captions, no extra logos, no other people.`

La voz y los subtítulos de Flow **no se usan en el clip** (salen mal): la voz real la pone ElevenLabs y los subtítulos el montaje. La frase a cámara se le pide a Flow solo para que mueva los labios.

## 2 · Generar

En el mismo proyecto de Flow del storyboard: video desde el cuadro aprobado como primer cuadro, **4 s**, 9:16, el modelo más barato que dé calidad (Veo Lite ronda 10 créditos por tramo; leé el costo en pantalla antes de cada uno). Una variante por escena; se regenera solo la que el revisor marque. Bajá a `anim/e1.mp4 … e6.mp4`.

## 3 · La puerta

Extraé 3 fotogramas por tramo (inicio, medio, fin) con ffmpeg (en tandas de hasta 12: `clip_revisar_subir(cantidad=N)` con `N <= 12`). Si los cuadros están en archivos (Descargas o la carpeta de trabajo): achicalos a 1080 px de lado largo con ffmpeg, pedí `clip_revisar_subir(cantidad=N)` (hasta 12 por tanda), subí cada uno con el `curl --fail-with-body` que devuelve y pasá los path a `clip_revisar(item_id, paso="escenas", imagenes=[…])`. Sin terminal (claude.ai en el navegador): pedile al vendedor que arrastre los archivos al chat. Nunca pegues las URL firmadas en el chat. Rechazos típicos: el producto cambia de forma o tamaño, aparece texto, una mano de más, cámara que se mueve, labios que no acompañan. Regenerá lo marcado una sola vez y decí el total de créditos gastados.
