---
name: animacion-flow
description: Anima en Google Flow los 6 cuadros aprobados del storyboard de un clip de MercadoLibre, con los bloques fijos de prompt en inglés de la fábrica DomUP (primer cuadro, cámara fija, boca y audio controlados), usando las vistas de la hoja de personaje y las fotos elegidas cuando haga falta, y pasa los tramos por el revisor. Usar cuando pidan «animá el storyboard», «hacé el video en Flow» o como paso 4 de fabrica-clip.
---

# Animación en Flow (6 tramos de 4 s)
> **Cómo se maneja Flow.** Con el conector `domup-flow` del plugin (sesión local), igual que la fábrica: `flow_create_project`, `flow_upload_image`, `flow_generate_image` / `flow_generate_video`, `flow_download_media`. Sin sesión local, lo mismo a mano en `labs.google/flow` con Claude en Chrome.

Consignas originales: `references/animacion-plan.md` (qué escribe Claude: solo la acción de cada escena) y `references/revisor-animacion.md`. El armado de cada prompt sigue `${CLAUDE_PLUGIN_ROOT}/fabrica/lib/prompt-animacion.mjs` (con sesión local se corre internamente: `node ${CLAUDE_PLUGIN_ROOT}/fabrica/lib/prompt-animacion.mjs <carpeta>` y **obligatoriamente antes de tocar Flow**, `node ${CLAUDE_PLUGIN_ROOT}/fabrica/lib/guardia-animacion.mjs <carpeta>` — si sale con error 1, no gastes créditos y corregí `anim-plan.json`): los bloques fijos no se escriben a mano, se copian.

Regla `ep09` (menores con adultos): si en una escena aparecen un adulto y un chico (`nina` o `nino` — nunca los saques del guion ni del elenco), prohibido el contacto físico o pase de objetos en el prompt (`hands`, `passes`, `gives`, `hugs`, `holds hand`, etc.). Ejemplo correcto: *"The adult sets the bottle on the table while the child smiles beside her without touching."* Prohibido generar scripts `.ps1`.

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

Mantené estado por escena en `anim/manifest.json` (`{ proyecto, imagenes, escenas: { [n]: { archivo, mediaId, prompt, panel_archivo, panel_sha1, bloque_texto, creditos_antes, creditos_despues } } }`): nunca pagues dos veces una escena ya generada con el mismo prompt y el mismo cuadro de `paneles/manifest.json`; si cambió el prompt, el cuadro o `bloque_texto`, se regenera solo esa escena.

En el mismo proyecto de Flow del storyboard (donde ya están subidas las vistas de la hoja del personaje y las 3 `producto.fotos_elegidas`): leé el saldo de créditos antes de animar (`creditos_flow_antes`, con `flow_status` o en pantalla). Video desde el cuadro aprobado (`paneles/cN.png`) como primer cuadro, **4 s**, 9:16, con `family="omni"` y `resolution` según `clip-<item>/config.json` (720p con plan pago de Google, 360p sin plan; si falta, preguntá «¿Tenés un plan pago de Google?»). Leé el costo en pantalla antes de cada tramo (en la clase: 12 créditos en 720p).

- **Escenas con chicos (`nina`/`nino`) o bloqueo `PUBLIC_ERROR_MINOR`/`MINORS`/`UNSAFE_GENERATION`/`PROMINENT_PEOPLE_FILTER_FAILED`**: llamá a `flow_generate_video` con `retry_with_agent: true` (tope 15 créditos y vuelve automático a modo manual al terminar). Nunca saques a los chicos del elenco para esquivar el filtro.
- Generá **de a un tramo por vez**: bajá `anim/eN.mp4` (`flow_download_media`) y extraé 3 fotogramas (inicio, medio, fin) para revisarlo visualmente **antes** de pedir el tramo siguiente (e1 → mirar → e2 → mirar → … e6). Una variante por escena; se regenera solo la que falle.

## 3 · La puerta (en tanda al final)

Cada tramo se **baja** a `anim/eN.mp4` apenas termina (`flow_download_media` con el conector, o el botón Descargar de Flow en Chrome, que lo deja en Descargas). **Nunca se revisa en el visor de Flow.** Con los archivos: extraé 3 fotogramas por tramo con ffmpeg (inicio, medio, fin), achicalos a 1080 px de lado largo con ffmpeg, subilos con `clip_revisar_subir(cantidad=N, clip_ref?, item_id?, paso="escenas")` (`curl --fail-with-body`) o pasá sus URL públicas `https` / base64 a `clip_revisar(item_id, paso="escenas", imagenes=[…], clip_ref=...)` en tandas de hasta 12. Sin terminal (`claude.ai` en el navegador): pedile al vendedor que arrastre los archivos al chat. Nunca pegues URL firmadas propias en el chat y nunca generes archivos `.ps1`. Rechazos típicos: el producto cambia de forma o tamaño, aparece texto, una mano de más, cámara que se mueve, labios que no acompañan. Regenerá lo marcado una sola vez y decí el total de créditos gastados (comparando saldo antes y después).

**Regla obligatoria de trazabilidad**: al terminar las 6 animaciones (o si falla/hay aviso en Flow), leé el saldo final en Flow (`creditos_flow_despues`), calculá el gasto real `creditos_flow = max(0, creditos_flow_antes - creditos_flow_despues)` y llamá a `clip_registrar_paso(cust_id?, clip_ref, paso="animacion", estado="ok"|"error"|"aviso", item_id, detalle={ cuadros: 6, creditos_flow, creditos_flow_antes, creditos_flow_despues, modelo, resolucion, plugin_version, motivo? })` usando el `clip_ref` de `clip-<item>/config.json`. Nunca mandes llaves ni rutas locales; si falla el registro, avisá y seguí, nunca frenes el clip por eso.
