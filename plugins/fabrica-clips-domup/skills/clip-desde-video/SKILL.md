---
name: clip-desde-video
description: Arma un clip de MercadoLibre a partir de un video crudo del producto que el vendedor grabó en su compu o celular (extrae 1 cuadro cada 0,5 s descartando el sonido, arma hojas de contacto numeradas, limpia las 5 mejores fotos en su Google Flow, escribe uso.md y 3 guiones, y sigue con storyboard-flow hasta el montaje final). Usar cuando el vendedor pasa un archivo de video MP4/MOV y pide «armame el clip desde este video», «sacá el producto de este video» o «clip desde mi video».
---

# Clip desde tu video crudo (híbrido)

Seguí la consigna textual de la fábrica en `references/extraer-producto.md` y después seguí con `storyboard-flow`, `animacion-flow`, `voces-elevenlabs` y `montaje-clip`. El video del vendedor es **solo referencia visual**: el sonido se descarta, las 5 fotos limpias del producto reemplazan las de la publicación como los 3 ángulos del candado (`angulos/a1.jpg..a3.jpg`, sumándose a las de ML sin borrarlas), y el clip final se anima con el elenco de la marca en Google Flow.

## Paso 1 · Receta y validación del video (5 a 60 s)

1. Llamá `clip_receta(item_id, cust_id)` para traer la ficha verificada, marca, elenco y locaciones (si falta el setup, frená y guiá a completarlo). Guardá `clip-<item>/pedido.json` con `"fuente": "video"`.
2. Validá el archivo de video local con `ffprobe` (sin audio, duración entre 5 y 60 s):
   ```bash
   ffprobe -v error -show_entries stream=codec_type,width,height -show_entries format=duration -of json "<video>"
   ```
   - Si no tiene pista de video o no abre → avisá en palabras llanas y pedí otro MP4/MOV.
   - Si dura `< 5 s` o `> 60 s` → avisá en palabras llanas y pedí uno de 15 a 30 s.

## Paso 2 · Cuadros cada 0,5 s y hojas de contacto numeradas

Extraé 1 cuadro cada 0,5 s descartando el audio (`-an`), y armá hojas de contacto numeradas 5×4 **antes** de mirar cuadros sueltos:

```bash
mkdir -p clip-<item>/cuadros-video clip-<item>/hojas-contacto clip-<item>/producto-video clip-<item>/angulos
ffmpeg -y -loglevel error -i "<video>" -an -vf "fps=2,scale=1080:-2:flags=lanczos" clip-<item>/cuadros-video/frame_%03d.png
```

Armá las hojas de contacto numeradas (`#001 (0.0s)`, `#002 (0.5s)`…) en `clip-<item>/hojas-contacto/hoja_01.png`, etc., miralas primero y abrí en tamaño completo solo los cuadros candidatos.

## Paso 3 · 5 fotos limpias en tu Flow y `uso.md`

Seguí `references/extraer-producto.md`:
1. Elegí los 5 mejores cuadros del producto (`frente`, `costado`, `detalle`, `en_uso`, `lejano`) y descartá los que muestren otra cosa. Si el producto no se distingue claramente, frená y avisale al vendedor en palabras llanas.
2. Escribí `clip-<item>/uso.md` con los pasos concretos que se ven hacer con el producto en el video (sin inventar).
3. En tu Google Flow (conector `domup-flow` o Claude en Chrome, **modo manual, imagen**), pasá cada cuadro elegido como edición con el prompt exacto:
   `same exact product, isolated on a clean neutral background, no hands, no other objects, no text`
4. Guardá las fotos limpias en `clip-<item>/producto-video/v1.png` ... `v5.png`.
5. Mostráselas al vendedor para que confirme cuáles van (`va / no va`; tiene que dejar al menos 1). Copiá las 3 mejores confirmadas a `clip-<item>/angulos/a1.jpg`, `a2.jpg`, `a3.jpg` (completá con fotos reales de ML si quedaron menos de 3) y anteponé todas a `fotos_de_referencia` sin borrar las de la publicación.

## Paso 4 · 3 guiones desde `uso.md` y puerta de parada 2

1. Escribí 3 guiones de **6 escenas** usando `uso.md`, la ficha verificada, `voz-comprador.md` y todas las reglas de `guion-viral` (`references/revisor-sentido.md`), con el elenco de la marca.
2. Pasalos por el revisor de sentido y mostráselos al vendedor junto con las fotos limpias confirmadas para que elija 1 de los 3 guiones.

## Paso 5 · Seguir con la fábrica

Con las fotos limpias en `angulos/a1.jpg..a3.jpg` y el guion elegido, seguí directo con **`storyboard-flow`**, **`animacion-flow`**, **`voces-elevenlabs`** y **`montaje-clip`** (pasando cada tanda por `clip_revisar`).
