---
name: perfil-completo-avatar
description: Arma en Google Flow la hoja de personaje de 8 vistas (frente, tres cuartos, perfiles y cuerpo entero) de cada avatar del elenco de una marca, para que todos los clips lo dibujen igual. Usar cuando pidan «hacé el perfil completo de mi avatar», «hoja de personaje», «que mi avatar salga siempre igual» o como paso 2 de fabrica-clip.
---

# Perfil completo del avatar (hoja de personaje)
> **Cómo se maneja Flow.** Con el conector `google-flow` del plugin (sesión local), igual que la fábrica: `flow_create_project`, subir con nombre único, `flow_generate_image` / `flow_generate_video`, `flow_download_media`. Sin sesión local, lo mismo a mano en `labs.google/flow` con Claude en Chrome.


Es lo que la fábrica arma antes de cualquier storyboard: sin hoja, Flow cambia la cara, la edad o la ropa de un cuadro a otro.

1. `mis_avatares` (o el elenco de `clip_receta`) → nombre, slot, semilla y retrato firmado de cada personaje del guion elegido. `clip_kit_montaje` → vestuario fijo por slot (en inglés, textual).
2. Con Claude en Chrome, en `labs.google/flow`: creá un proyecto «Elenco <marca> <slot>» y subí el retrato con un nombre único (`elenco-<cust>-<slot>-retrato.png`). Flow elige referencias por nombre: nunca dos archivos con el mismo nombre.
3. Generá la **lámina maestra** con el prompt textual de `references/hoja-de-personaje.md` (16:9, 2 variantes, el retrato como referencia, el vestuario textual): 8 paneles en 4x2, fila de arriba busto (frente, ¾ derecha, perfil izquierdo, ¾ izquierda), fila de abajo (perfil derecho, cuerpo entero de frente, cuerpo entero de costado, de espaldas). Sin texto.
4. Bajá las 2 y elegí la que cumple los 5 criterios: (a) 8 celdas en ese orden, con los perfiles hacia el lado pedido; (b) la misma persona que el retrato en todas; (c) cuerpo entero de la cabeza a los pies en 6, 7 y 8; (d) el vestuario textual, sin agregados; (e) sin texto. Si ninguna cumple, generá 2 más una sola vez.
5. Guardá la lámina en la carpeta del clip (`elenco/<slot>-lamina.png`) y recortala en 8 vistas con código (`elenco/<slot>-v1.png` … `-v8.png`). Si el vendedor quiere que quede en DomUP, `guardar_avatar` con `referencia_url` o `subir_retrato_avatar` (solo con su OK).

Las mascotas y los chicos también llevan hoja (sin voz). Los chicos nunca hablan ni tienen contacto ni pase de objetos con un adulto en las escenas.
