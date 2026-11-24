---
name: galeria-desde-clip
description: Arma con Google Flow (Claude en Chrome) la galería de fotos 2 a 12 y una portada alternativa de una publicación de MercadoLibre a partir del storyboard del clip, con el método de la fábrica DomUP, y la deja lista para probar en el Laboratorio de domup.app. Usar cuando pidan «hacé las fotos desde el clip», «galería de la publicación», «portada para el laboratorio» o como paso 7 de fabrica-clip.
---

# Galería desde el clip
> **Cómo se maneja Flow.** Con el conector `google-flow` del plugin (sesión local), igual que la fábrica: `flow_create_project`, subir con nombre único, `flow_generate_image` / `flow_generate_video`, `flow_download_media`. Sin sesión local, lo mismo a mano en `labs.google/flow` con Claude en Chrome.


Consignas originales: `references/fotos-plan.md`, `references/fotos.md` y el control `references/revisor-fotos.md`.

1. Reusá lo que ya está aprobado: el candado de producto, las 3 fotos de ángulos, las placas y las hojas de personaje. Así la galería es el mismo producto y la misma marca que el clip.
2. Plan de 11 fotos (2 a 12) con el pack de la fábrica: uso real, escala con persona, detalle de material, qué trae, medidas sin números, antes/después, ambiente de cada locación. Todas en 9:16 vertical a 1125x2000 (nunca cuadradas ni 16:9), fondo y luz según la esencia, como manda `references/fotos.md`. La 01 es la portada CON el avatar y la 01b, de reserva, solo el producto.
3. Generá en el mismo proyecto de Flow, 2 variantes por foto, con las 3 fotos del producto como referencia en cada una. Elegí con el revisor de fotos.
4. **Portada B**: una alternativa de portada para medir. Antes de proponerla, `laboratorio_candidatas`: si la publicación es de catálogo oficial, tiene menos de 100 impresiones por día o más de un SKU, no se prueba. Si califica, `laboratorio_probar_portada` solo con el OK del vendedor.
5. Para cargar las fotos en la publicación: si salieron de su propio Flow, `subir-fotos-publicacion` (respaldo, hoy contra después, su OK y deshacer). Si el carrusel lo generó la fábrica de DomUP, `fotos_subir` con su OK.
