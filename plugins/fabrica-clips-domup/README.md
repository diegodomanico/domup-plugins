# Fábrica de clips DomUP

La fábrica de clips de DomUP, la misma que corre para los clientes, en el Claude de cada vendedor: guion desde virales, preguntas y reseñas; perfil completo de cada avatar; storyboard de 6 cuadros y animación en Google Flow manejado desde Chrome; voces de ElevenLabs; montaje con carátula, subtítulos, logo y cierre; revisores en cada paso; y la galería de fotos que sale del clip.

## Habilidades

| Habilidad | Qué hace |
|---|---|
| `fabrica-clip` | Orquesta los 8 pasos con su puerta. Empezá por acá: «haceme el clip de MLA…» |
| `guion-viral` | Relevamiento de virales (YouTube, TikTok, Meta) + preguntas + reseñas → 3 guiones de 6 escenas |
| `perfil-completo-avatar` | Hoja de personaje de 8 vistas por avatar |
| `storyboard-flow` | 6 cuadros 9:16 en Flow con 3 fotos del producto, placas y hojas |
| `animacion-flow` | 6 tramos de 4 s en Flow con los bloques fijos de la fábrica |
| `voces-elevenlabs` | Las frases con la voz de cada personaje |
| `montaje-clip` | El MP4 final con las reglas de montaje de la fábrica |
| `galeria-desde-clip` | Fotos 2 a 12 y portada B para el Laboratorio |
| `instalar-fabrica` | Deja lista tu computadora (ffmpeg, Python, Node, HyperFrames y el conector local `domup-flow`) y verifica cada pieza |
| `subir-fotos-publicacion` | Carga las fotos de su Flow directo en la publicación, con respaldo y deshacer |

⛔ ElevenLabs se usa solo para voces. Imágenes o video con ElevenLabs gastan tus créditos: Claude te avisa y espera tu sí.

## Qué hace falta

1. **Conector DomUP** (`https://mcp.domup.app/api/mcp`), con la cuenta vinculada y el setup de Clips completo en domup.app: esencia, elenco, voces y 2 locaciones.
2. **Conector completo de ElevenLabs** (`https://api.elevenlabs.io/v1/mcp`) con la API key cargada en domup.app → Clips → Tus cuentas.
3. **Claude en Chrome** instalado y **Google Flow** abierto con tu cuenta de Google (`labs.google/flow`). Créditos: 50 gratis por día; Google AI Pro suma 1.000 por mes.
4. **Ejecución de código** activada en Ajustes → Capacidades (para ffmpeg).

Las consignas de cada paso (`references/`) son las de la fábrica, textuales.
