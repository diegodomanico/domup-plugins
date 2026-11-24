---
name: guion-viral
description: Escribe 3 guiones de 8 escenas para el clip de una publicación de MercadoLibre con el método de la fábrica DomUP, a partir de un relevamiento de videos virales (YouTube, TikTok y la biblioteca de anuncios de Meta) más las preguntas y las reseñas reales de esa publicación. Usar cuando pidan «armá el guion del clip», «buscá virales para mi producto» o como paso 1 de fabrica-clip.
---

# Guion desde virales + preguntas + reseñas

La consigna completa de la fábrica está en `references/guiones.md` y el control en `references/revisor-sentido.md`. Leelas enteras antes de escribir. Este archivo dice cómo correrlas en la cuenta del vendedor.

## 1 · La materia prima

1. `clip_receta(item_id)` → producto, ficha verificada, elenco, marca y `guion_base` (objeción y decisión creativa).
2. `preguntas(item_id)` de los últimos 90 días y `opiniones(item_id)` → armá `voz-comprador.md`: las 3 dudas que más se repiten, los 3 elogios que más se repiten (con cuántas veces) y las objeciones de las reseñas bajas. Si no hay preguntas, la objeción típica de la categoría va como «ASUMÍ: …».
3. `guion_video(item_id, avatar)` → el storyboard base y el bloque maestro de la fábrica, para tener el mismo punto de partida.

## 2 · El relevamiento de virales (con Claude en Chrome)

Buscá con 2 o 3 frases que describan el producto como lo buscaría un comprador (sin marca). En una pestaña nueva por fuente:

| Fuente | Dónde | Métrica que se copia tal cual |
|---|---|---|
| YouTube (cortos) | `https://www.youtube.com/results?search_query=<frase>&sp=EgIYAQ%253D%253D` | vistas |
| TikTok | `https://www.tiktok.com/search/video?q=<frase>` (los «me gusta» se ven con sesión iniciada) | me gusta |
| Meta | `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=<AR\|CL\|MX\|CO\|UY>&media_type=video&q=<frase>&search_type=keyword_unordered` | «En circulación desde»: cuanto más tiempo al aire, mejor le funciona al anunciante |

Leé las páginas con `get_page_text` o `read_page`. Anotá en `virales-crudo.json` url, título, fuente y métrica **exactamente como figuran**. No inventes urls ni números. El método original, con los selectores exactos, está en `${CLAUDE_PLUGIN_ROOT}/fabrica/lib/virales.mjs`.

## 3 · Los 3 guiones

Seguí `references/guiones.md` al pie de la letra: 6 a 12 virales elegidos con su **molde** (gancho, beats, recurso, sirve_para), 3 guiones de **exactamente 8 escenas** de 3 a 4 s, cada uno sobre un molde distinto (biblioteca de la casa en `${CLAUDE_PLUGIN_ROOT}/fabrica/moldes/` o el molde de un viral), triple gancho, lo que se nombra se ve, al menos 2 lugares, texto actuado, una misión por video, variedad de elenco y las prohibiciones. Uno solo va como recomendado, con su porqué en una línea.

## 4 · La puerta

Pasá los 3 por `references/revisor-sentido.md` y reescribí lo que marque antes de mostrarlos. Mostralos como 3 fichas cortas (título, gancho visual/verbal/texto, las 8 escenas en una línea cada una, personajes, molde y el viral que lo inspira con su métrica). El vendedor elige uno: es su primera de 3 decisiones.

Guardá `virales.json`, `voz-comprador.md` y `guiones.json` en la carpeta del clip.
