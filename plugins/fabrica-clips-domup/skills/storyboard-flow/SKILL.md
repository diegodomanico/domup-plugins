---
name: storyboard-flow
description: Genera en Google Flow el storyboard de 6 cuadros 9:16 de un clip de MercadoLibre con el método de la fábrica DomUP (candado de producto con las 3 fotos elegidas, placas de locación, vistas de la hoja de personaje, escala sin números) y lo pasa por el revisor. Usar cuando pidan «armá el storyboard», «generá los cuadros en Flow» o como paso 3 de fabrica-clip.
---

# Storyboard en Flow (6 cuadros)
> **Cómo se maneja Flow.** Con el conector `domup-flow` del plugin (sesión local), igual que la fábrica: `flow_create_project`, `flow_upload_image`, `flow_generate_image` / `flow_generate_video`, `flow_download_media`. Sin sesión local, lo mismo a mano en `labs.google/flow` con Claude en Chrome.

Consignas originales, a seguir enteras: `references/storyboard-plan.md` (el plan y los prompts), `references/storyboard.md` (la generación), `references/set.md` (locaciones y placas), y los controles `references/revisor-plan.md` y `references/revisor-storyboard.md`. Diego rechazó el 22-Oct un storyboard sin esto: medidas pésimas, tres productos distintos, sin los 3 ángulos y sin revisores. No se afloja nada.

## 1 · Plan (antes de tocar Flow)

1. De `clip_receta`: bloque `candado_producto` (qué es, forma, colores, partes, lo que NO tiene), `storyboard` y `prompts_flow`; **`producto.fotos_elegidas`** (las 3 URLs elegidas para el candado); el `elenco` con **`hoja_url_firmada` y `hoja_vistas_firmadas`**; y las locaciones elegidas con sus placas a/b/c y su `lock_en`. Además llamá a `clip_kit_montaje` para obtener `logo_url` de la marca antes de subir referencias (si ni `clip_receta` ni `clip_kit_montaje` traen `logo_url`, anotá «sin logo cargado» y seguí; **prohibido pedirle el logo al alumno si alguno ya devolvió `logo_url`**). Si estás en `claude.ai` con dominios bloqueados, llamá `clip_receta(..., incluir_imagenes=true)` / `clip_kit_montaje(..., incluir_imagenes=true)` para recibir las imágenes directo del MCP.
2. Escribí `producto.md` (el candado) y `medidas.md`: frases de escala **sin números** (Flow dibuja cotas si ve números), con el paquete de la ficha como tope.
3. Bajá **`producto.fotos_elegidas`** a `angulos/a1.jpg`, `a2.jpg`, `a3.jpg` (son las 3 vistas del producto: frente, lado/abierto, detalle). Si venís de **`clip-desde-video`** (`pedido.json` con `"fuente": "video"`), conservá las fotos limpias confirmadas que ya dejaste en `angulos/` y completá solo las que falten hasta 3 con `producto.fotos_elegidas` / `fotos_de_referencia`. Solo si el producto real no tiene 3 ángulos distintos en `fotos_elegidas` ni en `fotos_de_referencia`, generá la vista que falta y rotulala «GENERADA».
4. Armá `plan.json` con los **6 cuadros** (mapeo escena→cuadro), cada uno con: placa que usa, personajes, si muestra el producto, y su **prompt SIEMPRE en inglés** con el bloque PRODUCTO y el SCALE LOCK textuales, el vestuario textual y la cantidad exacta. Si la marca tiene `logo_url`, al menos **un cuadro** tiene que mostrar el logo real de la marca en un objeto de la locación que tenga sentido ahí (bolsa, caja, taza, cuaderno, cartel chico en la pared), nunca sobre el producto ni tapando una cara, con `"logo": "locacion"` (o `"ambos"` si un personaje también lo lleva en la ropa) y el prompt `the brand logo from the reference image, printed small and exactly as in the reference; no text, no letters, no captions, no extra logos`. Nunca el mismo plano en dos cuadros seguidos.
5. Pasá el plan por `references/revisor-plan.md`. Con NO APTO se corrige y se vuelve a pasar.

## 2 · Generar en Flow (una imagen por vez)

1. Con `domup-flow` (sesión local): verificá créditos con `flow_status` y creá el proyecto «Clip <item>» con `flow_create_project`. Sin sesión local: pestaña nueva en `https://labs.google/fx/tools/flow` con Claude en Chrome y leé los créditos.
2. Descargá `logo_url` (de `clip_kit_montaje`, si tiene) y subí con nombres **únicos** (prefijo `<item>-` / `elenco-<cust>-`) usando `flow_upload_image({ project_id, paths, names })` (hasta 20 por llamada, sin comandos del alumno):
   - las 3 fotos de `angulos/a1.jpg..a3.jpg`,
   - la lámina (`elenco-<cust>-<slot>-hoja.png`) **y SIEMPRE las vistas de la hoja de cada personaje** (`elenco-<cust>-<slot>-v1.png` … `-v8.png`) según la postura de cada cuadro (no solo el retrato),
   - las placas usadas (`set-<id>-a.png`…) y el logo de la marca (`<item>-logo.png`, si tiene `logo_url`).
   Flow elige referencias por nombre.
3. Modo manual, nunca el agente de Flow. Modelo de imagen de mayor calidad disponible, formato **9:16**, 2 variantes por cuadro.
4. **Una imagen por vez y se revisa antes de la siguiente (regla de Diego, 24-Nov)**: generá el cuadro 1, descargalo (`flow_download_media`) y miralo visualmente con los criterios de `references/storyboard.md` (mismo producto y escala que `fotos_elegidas`, misma persona y vestuario que las vistas de su hoja, placa respetada en lado de cámara y muebles, sin texto, contacto mano-producto creíble) **antes** de pedir el cuadro 2. Repetí uno por uno del 1 al 6 (`paneles/c1.png … c6.png`).
   - **Con locaciones**: cada cuadro directo en alta con su placa + las 3 fotos de `fotos_elegidas` + la vista correspondiente de la hoja del personaje (además de la lámina/retrato) + `<item>-logo.png` en los cuadros con `"logo": "locacion"` o `"ambos"` + el prompt en inglés del plan.
   - **Sin locaciones**: primero un lienzo 3x2 con los 6 cuadros y el bloque PRODUCTO + SCALE LOCK; después cada cuadro en alta (uno por vez, mirando cada cuadro antes del siguiente) usando el lienzo + `fotos_elegidas` + las vistas de la hoja del personaje (+ `<item>-logo.png` en los cuadros con `"logo": "locacion"` o `"ambos"`) como referencia.
5. Armá siempre `storyboard.jpg` sin que te lo pidan: fila de arriba con las 3 fotos de `angulos/` rotuladas «PRODUCTO · FRENTE / LADO / DETALLE» (o «GENERADA») y abajo los 6 cuadros en 2 filas de 3, numerados, con la frase de cada escena debajo (internamente con ffmpeg o Python, sin pedirle comandos al alumno). Es lo que ve el vendedor en su parada.

## 3 · La puerta (una sola tanda al final)

Achicá los 6 cuadros a 1080 px de lado largo con ffmpeg, pedí `clip_revisar_subir(cantidad=6, clip_ref?, item_id?, paso="storyboard")`, subí los 6 juntos con el `curl --fail-with-body` que devuelve y pasá los 6 path en **una sola tanda** a `clip_revisar(item_id, paso="storyboard", imagenes=[los 6], clip_ref=...)` (para cuidar el tope de 30 revisiones/día). Sin terminal (claude.ai en el navegador): pedile al vendedor que arrastre los archivos al chat. Nunca pegues las URL firmadas en el chat.

Con NO APTO, regenerá solo los cuadros marcados (de a uno, cambiando su prompt en inglés en el plan) y volvé a revisar una vez. Mostrale `storyboard.jpg` al vendedor con la frase de cada escena debajo: es su segunda decisión. Recién con su OK se anima.

Al terminar el storyboard (o si falla Flow), registrá con `clip_registrar_paso(cust_id?, clip_ref, paso="storyboard", estado="ok"|"error", item_id, detalle={ cuadros: 6, creditos_flow, modelo, plugin_version, motivo? })` usando el `clip_ref` de `clip-<item>/config.json`. Si falla el registro, avisá y seguí, nunca frenes el clip por eso.
