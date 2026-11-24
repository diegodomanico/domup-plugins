---
name: montaje-clip
description: Monta el clip final de MercadoLibre con el script de montaje de la fábrica DomUP (montar.py) — carátula, cortes por voz, 1,13x, subtítulos en zona segura, logo a mitad del clip, efectos HyperFrames, cierre de marca y -14 LUFS — y lo pasa por el revisor final. Usar cuando pidan «editá el clip», «montá el video», «armá el final» o como paso 6 de fabrica-clip.
---

# Montaje (el mismo script de la fábrica)

El montaje es `${CLAUDE_PLUGIN_ROOT}/fabrica/montaje/montar.py`, el mismo que corre en DomUP: no hay criterio, son reglas en código. Si falta algo para correrlo, usá la habilidad `instalar-fabrica`.

## Entradas (en la carpeta del clip, como en la fábrica)

| Archivo | De dónde sale |
|---|---|
| `pedido.json` | `clip_receta` (lo armó `fabrica-clip`) |
| `plan.json`, `paneles/manifest.json` | `storyboard-flow` |
| `anim-plan.json`, `anim/e1.mp4 … e8.mp4` | `animacion-flow` |
| `voz/manifest.json` y las tomas | `voces-elevenlabs` |
| identidad de la marca (`MARCA_JSON`) | `node ${CLAUDE_PLUGIN_ROOT}/fabrica/lib/marca-auto.mjs` con el logo y la esencia de `clip_kit_montaje`: logo, color con contraste 4,5:1, música de ElevenLabs y «TIENDA OFICIAL <MARCA>» |

## Correr

`python ${CLAUDE_PLUGIN_ROOT}/fabrica/montaje/montar.py <carpeta del clip>` con las variables de `.env.local` cargadas y `MARCA_JSON` apuntando a la identidad. Sale `entrega/<item>-<pedido>.mp4` y `montaje/linea.json`.

Lo que el script garantiza (y hay que comprobar al final): carátula 0,6 s; todo a 1,13x; aire de 0,3 s entre frases; la voz de Flow nunca entra; subtítulos con su parte de arriba en y=740 (660 si tapa una cara) y nada debajo de 880; logo en la escena 3-4; cierre de 3 a 4,1 s; mezcla a -14 LUFS con true peak de -1,5. Si frena con «quedaría X s congelado», se acorta la frase o se anima esa escena a 6 u 8 s, como dice el mensaje.

**Sin sesión local**: el mismo script corre en la ejecución de código de Claude (subí la carpeta del clip). Si ahí no hay HyperFrames, avisá que salen sin los carteles animados y seguí con lo demás igual.

## Puerta

`clip_revisar(item_id, paso="final", imagenes=[carátula + 1 fotograma por escena + cierre])` y la consigna `references/revisor-final.md`. Con NO APTO se corrige y se revisa una vez más.
