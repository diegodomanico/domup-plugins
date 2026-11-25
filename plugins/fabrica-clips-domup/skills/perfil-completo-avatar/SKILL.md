---
name: perfil-completo-avatar
description: Prepara la hoja de personaje de 8 vistas (frente, tres cuartos, perfiles y cuerpo entero) de cada avatar del elenco. Si DomUP ya la generó en clip_receta, la baja y la sube a Flow con flow_upload_image sin regenerar; solo si falta (caso borde) la arma en Google Flow. Usar cuando pidan «hacé el perfil completo de mi avatar», «hoja de personaje», «que mi avatar salga siempre igual» o como paso 2 de fabrica-clip.
---

# Perfil completo del avatar (hoja de personaje)
> **Cómo se maneja Flow.** Con el conector `domup-flow` del plugin (sesión local), igual que la fábrica: `flow_create_project`, `flow_upload_image`, `flow_generate_image` / `flow_generate_video`, `flow_download_media`. Sin sesión local, lo mismo a mano en `labs.google/flow` con Claude en Chrome.

La hoja de 8 vistas la prepara DomUP una vez por avatar. Sin hoja, Flow cambia la cara, la edad o la ropa de un cuadro a otro.

## 1 · Caso normal: usar la hoja hecha por DomUP (desde `clip_receta`)

1. Leé el `elenco` de `clip_receta` (o `mis_avatares`): cada personaje trae `tiene_hoja`, `hoja_url_firmada` (lámina 4x2) y `hoja_vistas_firmadas` (las 8 vistas recortadas).
2. Si `tiene_hoja === true` y trae `hoja_url_firmada`:
   - **No generes ninguna hoja ni gastes créditos.**
   - Bajá `hoja_url_firmada` a `clip-<item>/elenco/<slot>-lamina.png` (y las vistas de `hoja_vistas_firmadas` que use el storyboard a `clip-<item>/elenco/<slot>-v1.png` … `-v8.png`, o recortá la lámina con `${CLAUDE_PLUGIN_ROOT}/fabrica/lib/cortar_lamina.py` si faltara alguna).
   - En el proyecto de Flow del clip (`storyboard-flow`), subilas con `flow_upload_image({ project_id, paths, names })` usando nombres únicos: `elenco-<cust>-<slot>-hoja.png` y las vistas que use cada cuadro (`elenco-<cust>-<slot>-v1.png` …). Flow elige referencias por nombre: nunca repitas nombres.
3. Si `aviso_setup` dice `«hoja en preparación por DomUP (lista en ~N min)»`, no frenes el clip: si todavía no llegó cuando arrancás el storyboard, seguí con el caso borde de abajo o usá el retrato disponible.

## 2 · Caso borde: si `tiene_hoja === false` (la hoja todavía no está en DomUP)

Solo si NO hay `hoja_url_firmada`:
1. `mis_avatares` (o el elenco de `clip_receta`) → nombre, slot, semilla y retrato firmado del personaje. `clip_kit_montaje` → vestuario fijo por slot (en inglés, textual). **Regla de marca (Diego, 24-Nov)**: al menos un avatar adulto de la marca lleva el logo de la marca bordado chico en el pecho (`with the <marca> logo embroidered small on the left chest`) en su vestuario fijo, y la hoja de personaje se genera con ese vestuario textual.
2. Con `domup-flow` (sin sesión local, en `labs.google/flow` con Claude en Chrome): creá un proyecto «Elenco <marca> <slot>» (`flow_create_project`) y subí el retrato con `flow_upload_image({ project_id, paths, names: ["elenco-<cust>-<slot>-retrato.png"] })`.
3. Generá la **lámina maestra** con el prompt textual de `references/hoja-de-personaje.md` (personas o mascotas según el `slot`, 16:9, 2 variantes, el retrato como referencia, el vestuario textual): 8 paneles en 4x2, fila de arriba busto (frente, ¾ derecha, perfil mirando a izquierda, ¾ izquierda), fila de abajo (perfil mirando a derecha, cuerpo entero de frente, cuerpo entero de costado, de espaldas). Sin texto.
4. Bajá las 2 variantes y elegí la que cumple los 5 criterios de `references/hoja-de-personaje.md`. Si ninguna cumple, generá 2 más una sola vez.
5. Guardá la lámina en `clip-<item>/elenco/<slot>-lamina.png` y recortala en 8 vistas con `${CLAUDE_PLUGIN_ROOT}/fabrica/lib/cortar_lamina.py` (`<slot>-v1.png` … `-v8.png`). Si el vendedor quiere que quede guardada en DomUP, ofrecé `guardar_avatar` con `referencia_url` (solo con su OK).

Las mascotas (`perro`, `gato`) y los chicos también llevan hoja (sin voz). En mascotas: solo collar, sin ropa ni poses humanas. Los chicos nunca hablan ni tienen contacto ni pase de objetos con un adulto en las escenas.

Al terminar de preparar las hojas del elenco (o si falla), si estás dentro de un clip con `clip_ref` en `clip-<item>/config.json`, llamá `clip_registrar_paso(cust_id?, clip_ref, paso="inicio", estado="ok"|"error", item_id, detalle={ etapa: "perfil_avatar", plugin_version, motivo? })`. Si falla el registro, avisá y seguí, nunca frenes el clip por eso.
