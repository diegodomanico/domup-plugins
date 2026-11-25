---
name: voces-elevenlabs
description: Genera con el conector de ElevenLabs las voces de un clip de MercadoLibre usando la voz asignada a cada personaje del elenco DomUP (voz_id), con el texto actuado del guion y la duración que entra en cada escena. Usar cuando pidan «hacé las voces», «locución del clip», «grabá las frases con ElevenLabs» o como paso 5 de fabrica-clip.
---

# Voces con ElevenLabs

⛔ **ElevenLabs, solo voces** (Diego, 24-Nov). El conector `elevenlabs` también puede generar imágenes y video, pero en la fábrica se usa SOLO para las voces: las imágenes y los videos salen de Google Flow. Si el vendedor pide imágenes o video con ElevenLabs, primero aclarale que eso gasta SUS créditos de ElevenLabs (los mismos de las voces) y esperá su sí explícito antes de generar nada.

1. `clip_receta` (o `elenco_estado` / `voces_elevenlabs`) → la `voz_id` de cada personaje del guion y la del narrador. Nunca elijas otra voz: la de la ficha es la de la marca. Si un personaje no tiene voz, frená y mandá a completarla en domup.app → Clips → Ver elenco.
2. Con el conector de ElevenLabs, `creative_generate_speech` una toma por frase, con la `voz_id` del personaje, modelo multilingüe, en la variante del país, con el texto **tal como está actuado** en el guion (signos de apertura, «…», muletillas). Los chicos y los animales no tienen voz: sus sonidos son efectos.
3. Bajá cada toma a `voz/e<escena>-<n>.mp3` y medí su duración con ffprobe. Regla de la fábrica: cada frase entra en **3,5 s** (escena de 4 s a ~1,13x); si una toma pasa, se acorta la frase, no se acelera la voz.
4. Escribí `voz/manifest.json`: `[{"escena","personaje","modo":"camara|off","texto","archivo","dur"}]`.
5. El cierre de la marca (frase de cierre de la esencia, 3 s y 8 palabras como máximo) va con la voz del narrador.

Cada toma gasta créditos de ElevenLabs del vendedor: nunca repitas una generación para «probar»; si una sale mal, decí por qué y generá una sola vez más.

Al terminar las voces (o si falla), registrá en domup.app con `clip_registrar_paso(cust_id?, clip_ref, paso="voces", estado="ok"|"error", item_id, detalle={ tomas, dur_max_s, plugin_version, motivo? })` usando el `clip_ref` de `clip-<item>/config.json`. Nunca mandes llaves ni datos personales; si falla el registro, avisá y seguí, nunca frenes el clip por eso.
