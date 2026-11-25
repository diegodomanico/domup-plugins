---
name: storyboard-flow
description: Genera en Google Flow, manejado con Claude en Chrome, el storyboard de 6 cuadros 9:16 de un clip de MercadoLibre con el método de la fábrica DomUP (candado de producto con 3 fotos, placas de locación, hojas de personaje, escala sin números) y lo pasa por el revisor. Usar cuando pidan «armá el storyboard», «generá los cuadros en Flow» o como paso 3 de fabrica-clip.
---

# Storyboard en Flow (6 cuadros)
> **Cómo se maneja Flow.** Con el conector `domup-flow` del plugin (sesión local), igual que la fábrica: `flow_create_project`, `flow_upload_image`, `flow_generate_image` / `flow_generate_video`, `flow_download_media`. Sin sesión local, lo mismo a mano en `labs.google/flow` con Claude en Chrome.


Consignas originales, a seguir enteras: `references/storyboard-plan.md` (el plan y los prompts), `references/storyboard.md` (la generación), `references/set.md` (locaciones y placas), y los controles `references/revisor-plan.md` y `references/revisor-storyboard.md`. Diego rechazó el 22-Oct un storyboard sin esto: medidas pésimas, tres productos distintos, sin los 3 ángulos y sin revisores. No se afloja nada.

## 1 · Plan (antes de tocar Flow)

1. De `clip_receta`: bloque `candado_producto` (qué es, forma, colores, partes, lo que NO tiene), `storyboard` y `prompts_flow`; las fotos reales; las locaciones elegidas con sus placas a/b/c y su `lock_en`.
2. Escribí `producto.md` (el candado) y `medidas.md`: frases de escala **sin números** (Flow dibuja cotas si ve números), con el paquete de la ficha como tope.
3. Elegí **3 fotos del producto desde 3 ángulos** (frente, lado o abierto, detalle). Si falta uno real, generalo desde una foto y rotulalo «GENERADA».
4. Armá `plan.json` con los **6 cuadros** (mapeo escena→cuadro), cada uno con: placa que usa, personajes, si muestra el producto, y su prompt en inglés con el bloque PRODUCTO y el SCALE LOCK textuales, el vestuario textual y la cantidad exacta. Nunca el mismo plano en dos cuadros seguidos.
5. Pasá el plan por `references/revisor-plan.md`. Con NO APTO se corrige y se vuelve a pasar.

## 2 · Generar en Flow

1. Con `domup-flow` (sesión local): verificá créditos con `flow_status` y creá el proyecto «Clip <item>» con `flow_create_project`. Sin sesión local: pestaña nueva en `https://labs.google/fx/tools/flow` con Claude en Chrome y leé los créditos.
2. Subí con nombres **únicos** (prefijo `<item>-`) usando `flow_upload_image({ project_id, paths, names })` (hasta 20 por llamada, sin PowerShell): las 3 fotos de ángulos, las vistas de la hoja de cada personaje y las placas usadas (`set-<id>-a.png`…). Flow elige referencias por nombre.
3. Modo manual, nunca el agente de Flow. Modelo de imagen de mayor calidad disponible, formato **9:16**, 2 variantes por cuadro.
4. **Con locaciones**: cada cuadro directo en alta con su placa + 3 fotos del producto + hoja del personaje + el prompt del plan. **Sin locaciones**: primero un lienzo 3x2 con los 6 cuadros y el bloque PRODUCTO + SCALE LOCK; después cada cuadro en alta usando el lienzo como referencia.
5. Elegí la mejor variante de cada cuadro con los criterios de `references/storyboard.md` (mismo producto y escala que las fotos, misma persona que la hoja, placa respetada en lado de cámara y muebles, sin texto, contacto mano-producto creíble). Bajá los 6 a `paneles/c1.png … c6.png`.
6. Armá siempre `storyboard.jpg` sin que te lo pidan: fila de arriba con las 3 fotos del producto rotuladas «PRODUCTO · FRENTE / LADO / DETALLE» (o «GENERADA») y abajo los 6 cuadros en 2 filas de 3, numerados, con la frase de cada escena debajo (ffmpeg o Python con Pillow). Es lo que ve el vendedor en su parada.

## 3 · La puerta

Si los cuadros están en archivos (Descargas o la carpeta de trabajo): achicalos a 1080 px de lado largo con ffmpeg, pedí `clip_revisar_subir(cantidad=N)`, subí cada uno con el `curl --fail-with-body` que devuelve y pasá los path a `clip_revisar`. Sin terminal (claude.ai en el navegador): pedile al vendedor que arrastre los archivos al chat. Nunca pegues las URL firmadas en el chat.

`clip_revisar(item_id, paso="storyboard", imagenes=[los 6])`. Con NO APTO, regenerá solo los cuadros marcados (cambiando su prompt en el plan) y volvé a revisar una vez. Mostrale `storyboard.jpg` al vendedor con la frase de cada escena debajo: es su segunda decisión. Recién con su OK se anima.
