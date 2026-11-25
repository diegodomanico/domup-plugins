> **Consigna de la fábrica de clips de DomUP, textual.** En el plugin el PEDIDO es la salida de `clip_receta` (más `preguntas` y `opiniones`), Flow se maneja con Claude en Chrome o con el conector `domup-flow` del plugin, y las carpetas de la PC de DomUP se leen como `${CLAUDE_PLUGIN_ROOT}`. Reglas, controles, prompts y cantidades se aplican **igual, sin aflojar nada**.

---

# Hoja de personaje de 8 vistas (4x2, 16:9)

Fuente única de DomUP para generar la lámina maestra de 8 vistas de cada personaje o mascota del elenco a partir de su retrato oficial y el vestuario fijo del kit de marca.

## Datos del personaje
- Personaje: {{NOMBRE}} (`{{SLOT}}`)
- Proyecto de Flow: `{{PROYECTO}}` · referencia subida `media_id` `{{REF}}` (copia local: `retrato{{EXT}}`)
- Quién es (semilla): {{SEMILLA}}
- Vestuario fijo de la marca (TEXTUAL en el prompt): {{VESTUARIO}}

## Prompt para PERSONAS (`mujer`, `hombre`, `mujer_2`, `hombre_2`, `mujer_mayor`, `hombre_mayor`, `nina`, `nino`)

Generá con `mcp__domup-flow__flow_generate_image` en ese proyecto: `aspect 16:9`, `count 2`, `reference_media_ids ["{{REF}}"]`, UNA LÁMINA MAESTRA con este prompt en inglés y el vestuario TEXTUAL:

```text
Professional character reference sheet, landscape, a clean grid of 8 equal panels in 4 columns and 2 rows separated by thin white gutters, plain medium-gray studio background in every panel, soft even studio light, photorealistic, sharp focus. The SAME person as the reference image in all 8 panels (same face, hair, skin, age and build), wearing <vestuario TEXTUAL>.
TOP ROW, head-and-shoulders bust, left to right: 1) facing the camera, smiling; 2) three-quarter view turned to his/her right; 3) strict side profile with the nose pointing to the LEFT edge of the image; 4) three-quarter view turned to his/her left.
BOTTOM ROW, left to right: 5) head-and-shoulders strict side profile with the nose pointing to the RIGHT edge of the image (the opposite side of panel 3); 6) full body from head to feet facing the camera, arms relaxed; 7) full body from head to feet in side view facing left; 8) full body from head to feet seen from the back.
No text, no labels, no numbers, no extra logos (only the logo described in the outfit, if any).
```
*(Usá «his» o «her» según el personaje.)*

## Prompt para MASCOTAS (`perro`, `gato`)

Generá con `mcp__domup-flow__flow_generate_image` en ese proyecto: `aspect 16:9`, `count 2`, `reference_media_ids ["{{REF}}"]`, UNA LÁMINA MAESTRA con este prompt en inglés y el accesorio/collar TEXTUAL (solo collar/pañuelo si corresponde, nunca ropa ni poses humanas):

```text
Professional animal character reference sheet, landscape, a clean grid of 8 equal panels in 4 columns and 2 rows separated by thin white gutters, plain medium-gray studio background in every panel, soft even studio light, photorealistic, sharp focus. ANIMAL ONLY, NO HUMAN, NO PERSON, NO CLOTHES, NO HUMAN POSES: the EXACT SAME animal as the reference image in all 8 panels (same breed, fur coat colors, markings, ears, eye color, muzzle and build), with <collar o accesorio TEXTUAL del kit, sin ropa>.
TOP ROW, head-and-chest close-up, left to right: 1) facing the camera; 2) three-quarter view turned to its right; 3) strict side profile with the nose pointing to the LEFT edge of the image; 4) three-quarter view turned to its left.
BOTTOM ROW, left to right: 5) head-and-chest strict side profile with the nose pointing to the RIGHT edge of the image (the opposite side of panel 3); 6) full body from head to paws and tail in natural standing or sitting animal posture facing the camera; 7) full body from head to paws and tail in natural side view facing left; 8) full body seen from the back showing coat markings and tail.
No clothes, no human posture, no text, no labels, no numbers, no logos.
```

## Criterios de elección (los 5 obligatorios)

Descargá las 2 variantes con `mcp__domup-flow__flow_download_media` a esta carpeta y miralas. Elegí la que cumple los 5 criterios:
1. **(a) 8 celdas en 4x2 y en orden**: fila superior bustos (1=frente, 2=3/4 derecha, 3=perfil mirando al borde IZQUIERDO, 4=3/4 izquierda); fila inferior (5=perfil mirando al borde DERECHO, 6=cuerpo entero de frente, 7=cuerpo entero de costado, 8=cuerpo entero de espaldas).
2. **(b) Misma identidad**: es la MISMA persona o el MISMO animal que `retrato{{EXT}}` en las 8 celdas (cara/hocico, pelo/pelaje, edad/raza, rasgos).
3. **(c) Cuerpo entero en 6, 7 y 8**: de la cabeza a los pies (o de la cabeza a las patas y cola), sin cortes.
4. **(d) Vestuario / collar exacto**: lleva el vestuario (o solo collar/sin ropa en mascotas) textual del kit, sin agregados ni poses humanas en mascotas.
5. **(e) Sin texto**: sin letras, etiquetas, números ni logos extra.

Si ninguna de las 2 cumple los 5 criterios, generá 2 más **una sola vez**.

## Guardado en la fábrica
- Copiá la elegida como `lamina.png` (convertí a PNG con `ffmpeg -y -loglevel error -i <archivo> lamina.png` si bajó en otro formato) y borrá las descartadas (`node -e "require('fs').unlinkSync('<archivo>')"`, no tenés permiso para `cp` ni `rm`). NO la cortes: la corta la fábrica con `cortar_lamina.py`.
- Escribí `hoja.json`: `{"proyecto": "{{PROYECTO}}", "retrato": "{{REF}}", "lamina": "<media_id>", "nota": "<una línea: qué se ve>"}`.
- Terminá con `OK hoja` o `ERROR: <motivo>`.
