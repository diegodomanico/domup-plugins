> **Consigna de la fábrica de clips de DomUP, textual.** En el plugin el PEDIDO es la salida de `clip_receta` (más `preguntas` y `opiniones`), Flow se maneja con Claude en Chrome o con el conector `google-flow` del plugin, y las carpetas de la PC de DomUP se leen como `${CLAUDE_PLUGIN_ROOT}`. Reglas, controles, prompts y cantidades se aplican **igual, sin aflojar nada**.

---

Vas a armar la HOJA DE PERSONAJE de {{NOMBRE}} ({{SLOT}}) para que todos los clips de la marca lo dibujen igual.
El retrato oficial (la cara) ya está subido al proyecto de Flow {{PROYECTO}} con media_id {{REF}} (copia local: retrato{{EXT}}).
Quién es: {{SEMILLA}}
Vestuario fijo de la marca (TEXTUAL en los tres prompts): {{VESTUARIO}}

1. Generá con mcp__google-flow__flow_generate_image, en ese proyecto, aspect 16:9, count 2, reference_media_ids ["{{REF}}"], UNA
   LÁMINA MAESTRA con este prompt (en inglés, el vestuario TEXTUAL):
   «Professional character reference sheet, landscape, a clean grid of 8 equal panels in 4 columns and 2 rows separated by thin
   white gutters, plain medium-gray studio background in every panel, soft even studio light, photorealistic, sharp focus. The SAME
   person as the reference image in all 8 panels (same face, hair, skin, age and build), wearing <vestuario TEXTUAL>.
   TOP ROW, head-and-shoulders bust, left to right: 1) facing the camera, smiling; 2) three-quarter view turned to his/her right;
   3) strict side profile with the nose pointing to the LEFT edge of the image; 4) three-quarter view turned to his/her left.
   BOTTOM ROW, left to right: 5) head-and-shoulders strict side profile with the nose pointing to the RIGHT edge of the image (the opposite side of panel 3); 6) full body from head to feet facing the camera,
   arms relaxed; 7) full body from head to feet in side view facing left; 8) full body from head to feet seen from the back.
   No text, no labels, no numbers, no logos.» (usá «his» o «her» según el personaje)
2. Descargá las 2 con flow_download_media a esta carpeta y leelas. Elegí la que: (a) tiene las 8 celdas en 4x2 y en ese orden, con el perfil de la celda 3 mirando a la izquierda y el de la 5 a la derecha;
   (b) es la MISMA persona que retrato{{EXT}} en todas (cara, pelo, edad); (c) en 6, 7 y 8 se ve el cuerpo entero, de la cabeza a
   los pies; (d) lleva el vestuario textual, sin agregados; (e) no tiene texto. Si ninguna cumple, generá 2 más una sola vez.
3. Copiá la elegida como lamina.png (convertí a PNG con ffmpeg -y -loglevel error -i <archivo> lamina.png si bajó en otro formato)
   y borrá las descartadas (copiá SIEMPRE con ffmpeg -y -loglevel error -i <archivo> <nombre>.png y borrá con node -e "require('fs').unlinkSync('<archivo>')": no tenés permiso para cp ni rm, 31-Oct). NO la cortes: la corta la fábrica.
4. Escribí hoja.json: {"proyecto": "{{PROYECTO}}", "retrato": "{{REF}}", "lamina": "<media_id>", "nota": "<una línea: qué se ve>"}.
5. Terminá con «OK hoja» o «ERROR: <motivo>».