---
name: animacion-flow
description: Anima en Google Flow los 6 cuadros aprobados del storyboard de un clip de MercadoLibre, con los bloques fijos de prompt en inglés de la fábrica DomUP (primer cuadro, cámara fija, boca y audio controlados), usando las vistas de la hoja de personaje y las fotos elegidas cuando haga falta, y pasa los tramos por el revisor. Usar cuando pidan «animá el storyboard», «hacé el video en Flow» o como paso 4 de fabrica-clip.
---

# Animación en Flow (6 tramos de 4 s)
> **Cómo se maneja Flow.** Con el conector `domup-flow` del plugin (sesión local), igual que la fábrica: `flow_create_project`, `flow_upload_image`, `flow_generate_image` / `flow_generate_video`, `flow_download_media`. Sin sesión local, lo mismo a mano en `labs.google/flow` con Claude en Chrome.

Consignas originales: `references/animacion-plan.md` (qué escribe Claude: solo la acción de cada escena) y `references/revisor-animacion.md`. El armado de cada prompt sigue `${CLAUDE_PLUGIN_ROOT}/fabrica/lib/prompt-animacion.mjs` (con sesión local se corre internamente: `node … <carpeta del clip>` escribe los prompts en inglés en `anim-plan.json`, sin pedirle comandos al alumno): los bloques fijos no se escriben a mano, se copian.

## 1 · El prompt de cada escena (SIEMPRE en inglés), armado así y en este orden

1. `Use the attached image as the FIRST FRAME. Photorealistic, natural motion, no AI look.`
2. `STATIC LOCKED-OFF CAMERA: no zoom, no pan, no push-in, single continuous shot, NO cuts.`
3. La acción de la escena (en inglés, lenta, una sola cosa que pasa, nada que caiga, se suelte o se derrame).
4. Si muestra el producto: `<The product> keeps exactly its size and shape, exactly as in the first frame. Same proportion to the hand as in the first frame.` (sin la frase de la mano si no hay personas).
5. Sin personas: `Nobody is in this shot: NO hands, NO arms, NO people enter the frame at any moment…`
6. Voz: si la escena tiene frase **a cámara**, `<persona> looks straight into the camera and, starting within the first half second, SPEAKS this line in <Argentine Spanish (Rioplatense, voseo) | Mexican Spanish | Chilean Spanish | Colombian Spanish | Uruguayan Spanish (voseo)>, with clear natural lip movement matching every syllable: "<frase>" Then closes the mouth and smiles. AUDIO: only that voice…` Si es **en off**: `Nobody speaks: mouths closed or smiling, no words. AUDIO: NO voice, NO speech, NO music: only soft room ambience.`
7. `Keep the background objects untouched. No text, no captions, no extra logos, no other people.`

La voz y los subtítulos de Flow **no se usan en el clip** (salen mal): la voz real la pone ElevenLabs y los subtítulos el montaje. La frase a cámara se le pide a Flow solo para que mueva los labios.

## 2 · Generar (uno por vez y revisar antes del siguiente)

En el mismo proyecto de Flow del storyboard (donde ya están subidas las vistas de la hoja del personaje y las 3 `producto.fotos_elegidas`): video desde el cuadro aprobado (`paneles/cN.png`) como primer cuadro, **4 s**, 9:16, con `family="omni"` y `resolution` según `clip-<item>/config.json` (720p con plan pago de Google, 360p sin plan; si falta, preguntá «¿Tenés un plan pago de Google?»). Leé el costo en pantalla antes de cada tramo (en la clase: 12 créditos en 720p).

Generá **de a un tramo por vez**: bajá `anim/eN.mp4` (`flow_download_media`) y extraé 3 fotogramas (inicio, medio, fin) para revisarlo visualmente **antes** de pedir el tramo siguiente (e1 → mirar → e2 → mirar → … e6). Una variante por escena; se regenera solo la que falle.

Si Flow bloquea un tramo por «personas destacadas», reescribí el prompt en inglés presentando al personaje como ficticio de la marca (`fictional character, not a real person`) sin nombres de famosos, y reintentá una vez.

## 3 · La puerta (en tanda al final)

Cada tramo se **baja** a `anim/eN.mp4` apenas termina (`flow_download_media` con el conector, o el botón Descargar de Flow en Chrome, que lo deja en Descargas). **Nunca se revisa en el visor de Flow.** Con los archivos: extraé 3 fotogramas por tramo con ffmpeg (inicio, medio, fin), achicalos a 1080 px de lado largo con ffmpeg, pedí `clip_revisar_subir(cantidad=N, clip_ref?, item_id?, paso="escenas")` (en tandas de hasta 12: `N <= 12`), subí cada tanda con el `curl --fail-with-body` que devuelve y pasá los path a `clip_revisar(item_id, paso="escenas", imagenes=[…], clip_ref=...)`. La voz y los labios se chequean con `ffprobe` (que haya audio) y, como escuchando no se puede, se avisa al vendedor qué mirar. Sin terminal (claude.ai en el navegador): pedile al vendedor que arrastre los archivos al chat. Nunca pegues las URL firmadas en el chat. Rechazos típicos: el producto cambia de forma o tamaño, aparece texto, una mano de más, cámara que se mueve, labios que no acompañan. Regenerá lo marcado una sola vez y decí el total de créditos gastados.

Al terminar las 6 animaciones (o si falla Flow), registrá con `clip_registrar_paso(cust_id?, clip_ref, paso="animacion", estado="ok"|"error", item_id, detalle={ cuadros: 6, creditos_flow, modelo, resolucion, plugin_version, motivo? })` usando el `clip_ref` de `clip-<item>/config.json`. Si falla el registro, avisá y seguí, nunca frenes el clip por eso.
