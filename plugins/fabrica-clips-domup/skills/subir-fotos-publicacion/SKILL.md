---
name: subir-fotos-publicacion
description: Carga las fotos que el vendedor hizo en su propio Flow (las 12 del carrusel de la fábrica, 01 a 12) directo en su publicación de MercadoLibre, desde su Chrome, con respaldo de las fotos de hoy, comparación antes/después, su OK y deshacer. Usar con «subí mis fotos a la publicación», «cargá la galería», «poné las fotos nuevas», «volvé a las fotos de antes», o como último paso de galeria-desde-clip.
---

# Subir mis fotos a la publicación

Las fotos salen del Flow del vendedor y entran a su publicación sin pasar por otro lado. Nada se cambia sin respaldo,
sin mostrar hoy contra después y sin el OK del vendedor para esa publicación. Si algo falla a la mitad, se vuelve al respaldo.

> **Por qué esta habilidad y no `fotos_subir`.** `fotos_subir` y `fotos_restaurar` del conector DomUP trabajan con los
> carruseles que genera la fábrica de DomUP (piden cupo). Las fotos hechas en el Flow del vendedor van por acá: se cargan
> desde su Chrome, en la pantalla «Modificar» de su publicación, con su sesión de MercadoLibre.

## 0 · Qué necesitás antes

| | |
|---|---|
| **Publicación** | El link o el ID (`MLA…`, `MLM…`, `MLC…`, `MCO…`, `MLU…`). |
| **Fotos** | La carpeta del carrusel: `01.jpg` a `12.jpg` (y `01b.jpg` de reserva), 9:16 a 1125x2000, con el revisor de fotos en APTO. |
| **Chrome** | Claude en Chrome conectado al Chrome donde el vendedor está logueado en MercadoLibre con esa cuenta. |

Si falta el revisor de fotos, correlo antes (`galeria-desde-clip`, paso de control con `references/revisor-fotos.md`). Una foto NO APTA no se sube.

## 1 · Controlar la publicación

1. Leé la publicación con el conector DomUP (`item`). Anotá: título, cuenta, cantidad de fotos de hoy y sus links, y si tiene catálogo.
2. **Si está vinculada a un producto de catálogo, frená.** El comprador ve las fotos del catálogo, no las de la publicación:
   subirlas acá no cambia lo que se ve. Decíselo en una línea y ofrecé seguir solo si es una tradicional sin catálogo.
3. Confirmá que la publicación es de la cuenta que está logueada en Chrome (el apodo arriba a la derecha en MercadoLibre). Si no coincide, frená.

## 2 · Controlar las fotos

1. Listá la carpeta y verificá que estén `01` a `12` en ese orden, sin huecos. Con terminal:
   `python3 -c "from PIL import Image;import glob;[print(f, Image.open(f).size) for f in sorted(glob.glob('carrusel/*.jpg'))]"`.
   Sin terminal, abrilas y contalas.
2. Las 12 tienen que ser 1125x2000. Una distinta se rehace en Flow, no se estira.
3. La `01` es la portada CON el avatar; la `01b` (solo producto) no se sube salvo que el vendedor la elija como portada.
4. Si la categoría acepta menos fotos que 12 (MercadoLibre lo avisa al cargar), se suben las primeras en orden y se dice cuáles quedaron afuera.

## 3 · Mostrar hoy contra después y pedir el OK

Armá una tabla con una fila por posición: foto de hoy (link) → foto nueva (nombre del archivo y qué muestra, una línea).
Abajo: «Se guarda un respaldo de las N fotos de hoy. Si no te gusta, se vuelve atrás con "volvé a las fotos de antes"».
**Esperá un sí claro para esa publicación.** Un OK no vale para otra publicación.

## 4 · Respaldo, antes de tocar nada

1. Creá `respaldos/<item>-<AAAAMMDD-HHMM>/` junto a la carpeta del carrusel.
2. Bajá ahí cada foto de hoy desde su link, con su posición en el nombre (`01.jpg`, `02.jpg`…), y guardá `fotos.json` con
   los links originales en orden. Con terminal, `curl -sSL -o 01.jpg '<link>'` por cada una; sin terminal, desde Chrome.
3. Contá los archivos bajados. **Si no están todas, no sigas**: sin respaldo completo no hay deshacer.

## 5 · Cargar en MercadoLibre desde Chrome

Seguí la habilidad de Claude en Chrome (pestaña nueva, nunca una del vendedor).

1. Abrí `https://www.mercadolibre.com.<dominio>/publicaciones/<item>/modificar` (dominio por el prefijo: MLA `ar`, MLM `mx`,
   MLC `cl`, MCO `co`, MLU `uy`, MLB `br`). Buscá la sección de fotos.
2. Subí las nuevas con la carga de archivos (`file_upload`) en el orden `01` → `12`.
3. Sacá las fotos viejas que queden y dejá el orden final: `01` primera.
4. Antes del botón de guardar, sacá una captura de la sección de fotos y mostrásela. **Guardá recién con su OK** (es el clic que publica el cambio).
5. Si MercadoLibre rechaza una foto (tamaño, peso, texto encima), anotá el mensaje textual, no reintentes en ráfaga y decí cuál fue.

## 6 · Verificar el efecto

1. Esperá un minuto y volvé a leer la publicación con `item`: cantidad de fotos y que la primera sea la nueva.
2. Abrí la publicación pública (`Ver`) y confirmá a ojo la portada.
3. Reportá en una línea: «✅ <item> · 12 fotos nuevas · respaldo en respaldos/<carpeta>». Si algo no coincide, decí qué y ofrecé deshacer.

## Deshacer: «volvé a las fotos de antes»

1. Buscá el último respaldo de esa publicación en `respaldos/` (o el que nombre el vendedor) y mostrá qué va a quedar.
2. Con su OK, repetí el paso 5 con los archivos del respaldo, en el orden de `fotos.json`.
3. Verificá como en el paso 6. El respaldo no se borra.

## Reglas

- Una publicación por vez, con su OK. Nunca en lote sin que el vendedor vea cada comparación.
- Nunca se borra un respaldo.
- Nada de llaves, contraseñas ni códigos: si MercadoLibre pide iniciar sesión o un código, lo hace el vendedor.
