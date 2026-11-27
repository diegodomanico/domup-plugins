---
name: voces-elevenlabs
description: Genera con el conector de ElevenLabs las voces de un clip de MercadoLibre usando la voz asignada a cada personaje del elenco DomUP (voz_id), con el texto actuado del guion y la duración que entra en cada escena. Usar cuando pidan «hacé las voces», «locución del clip», «grabá las frases con ElevenLabs» o como paso 5 de fabrica-clip.
---

# Voces con ElevenLabs

⛔ **ElevenLabs, solo voces** (Diego, 24-Nov). El conector `elevenlabs` también puede generar imágenes y video, pero en la fábrica se usa SOLO para las voces (y la música local de marca con `marca-auto.mjs` cuando falta `musica_url_firmada`); las imágenes y los videos salen de Google Flow. Las claves quedan en `.env.local` del cliente (el MCP nunca devuelve llaves). Si `api.elevenlabs.io` está bloqueado en red (`claude.ai`), habilitá el dominio o corré el paso en sesión local.

1. Llamá a `clip_receta` (o `elenco_estado`) y `clip_kit_montaje(cust_id?, clip_ref?, item_id?)` → anotá `voz_id` de cada personaje del elenco y verificá si `kit.cierre.cierre_audio_url_firmada` viene informada.
   - Si viene `cierre_audio_url_firmada`, **descargala antes** a `cierre-marca.wav` (o `.mp3`) dentro de la carpeta del clip y guardá en `pedido.json`: `"cierre_audio": { "archivo": "<carpeta>/cierre-marca.wav", "texto": "<texto del cierre>" }` antes de correr el script.
2. En sesión local corrés el script de la fábrica:
   - `node ${CLAUDE_PLUGIN_ROOT}/fabrica/lib/voces.mjs <carpeta del clip>`
   Usa TTS + STS con la receta aprobada (`RECETA`), caché de tomas (`_voz-cache/`), control de acento por país, repuesto automático ante `voice_not_found`, y transcripción Groq con respaldo automático a ElevenLabs `scribe_v1` si falta `GROQ_API_KEY`.
   - Para música faltante, `marca-auto.mjs` corre local usando `ELEVENLABS_API_KEY` de `.env.local`. Nunca generes scripts `.ps1` ni pidas comandos al alumno.
3. Sin sesión local: generá una toma por frase con `creative_generate_speech` (`eleven_multilingual_v2`, en el acento del país), bajalas a `voz/e<escena>-<n>.mp3`, medí con ffprobe (≤ 3,5 s por escena) y armá `voz/manifest.json`. Los chicos (`nina`/`nino`) y los animales (`perro`/`gato`) no tienen voz.

Cada toma gasta créditos de ElevenLabs del vendedor: nunca repitas una generación para «probar»; si una sale mal, decí por qué y generá una sola vez más.

**Regla obligatoria de trazabilidad**: al terminar las voces (o si falla/hay aviso), sumá los caracteres reales enviados a ElevenLabs en todas las tomas (`caracteres_elevenlabs`) y llamá a `clip_registrar_paso(cust_id?, clip_ref, paso="voces", estado="ok"|"error"|"aviso", item_id, detalle={ tomas, dur_max_s, caracteres_elevenlabs, plugin_version, motivo? })` usando el `clip_ref` de `clip-<item>/config.json`. Nunca mandes llaves ni rutas locales; si falla el registro, avisá y seguí, nunca frenes el clip por eso.
