// Voces del clip, TODAS de ElevenLabs (Diego, 22-Oct-2026: «todas las voces, todo tiene que salir de Eleven Labs… la calidad
// es un antes y un después»). Script fijo, sin IA:
//   - frase en off  → texto a voz (TTS) con la voz del personaje;
//   - frase a cámara → cambio de voz (STS) sobre el audio que trae el video de Flow, para conservar el movimiento de labios.
//
// RECETA APROBADA — NO CAMBIAR SIN UNA PRUEBA A/B ESCUCHADA POR DIEGO (23-Oct-2026, máscara de bruja: «está duro… el audio está
// roto, deforme»). Los episodios aprobados de Veoquiero (ep00-ep17) se hicieron con:
//   - eleven_multilingual_v2 y los AJUSTES PROPIOS DE CADA VOZ (no se manda voice_settings). Forzar estabilidad 0,45 y estilo
//     0,3 dejó dura la voz de Agustín (Nacho);
//   - cada frase con su CONTEXTO (previous_text / next_text de ElevenLabs): generadas sueltas, cada frase sonaba como si fuera
//     la única, con la entonación cortada.
//   - NO usar eleven_v3 (29-Oct, cierre de VentiMaku): con la misma voz chilena las tomas de v3 sonaron «españolas, no
//     chilenas». v3 no respeta el acento de la voz; v2 sí. La energía se busca con el contexto (previous_text de remate) y, solo
//     para el cierre, con estilo 0,7 y estabilidad 0,28 (toma D, elegida por Diego), que queda grabada como toma de la marca.
// La clave se lee de ELEVENLABS_API_KEY en .env.local de DomUp-Reels (nunca en el repo ni en el chat).
// Uso: node lib/voz.mjs tts <voice_id> "<texto>" <salida.mp3>
//      node lib/voz.mjs sts <voice_id> <entrada.wav> <salida.mp3>
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ENV_LOCAL, RAIZ } from './rutas.mjs';

// UNA VOZ SE PAGA UNA SOLA VEZ (Diego, 18-Nov-2026). Entre el 9 y el 17-Nov la cuenta de ElevenLabs gastó ~84.000 de sus 121.045
// créditos y se quedó sin saldo: cada reintento de la animación volvía a generar TODAS las voces del clip, aunque ya estuvieran
// bien (61 pedidos corrieron la animación 335 veces sin dar un video). Ahora cada toma queda guardada por lo que la define (voz,
// modelo, ajustes, texto o audio de entrada) y, si se vuelve a pedir lo mismo, se copia la guardada sin llamar a ElevenLabs.
export const CACHE_VOZ = process.env.CLIPS_VOZ_CACHE || join(RAIZ, '_voz-cache').replace(/\\/g, '/');
export const huella = (...partes) => createHash('sha256').update(partes.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\u0001')).digest('hex').slice(0, 32);
export function desdeCache(k, salida) {
  const f = join(CACHE_VOZ, `${k}.mp3`);
  if (!existsSync(f)) return false;
  copyFileSync(f, salida);
  return true;
}
export function aCache(k, salida) {
  try { mkdirSync(CACHE_VOZ, { recursive: true }); copyFileSync(salida, join(CACHE_VOZ, `${k}.mp3`)); } catch { /* sin cache no se frena el clip */ }
}
export const vozReusadas = { tts: 0, sts: 0 };

const ENV = ENV_LOCAL;
function clave() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  if (existsSync(ENV)) {
    const m = readFileSync(ENV, 'utf8').match(/^ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1].trim();
  }
  throw new Error('falta ELEVENLABS_API_KEY en .env.local de DomUp-Reels');
}
export const MODELO_TTS = 'eleven_multilingual_v2', MODELO_STS = 'eleven_multilingual_sts_v2';
// La receta con la que se genera cada voz. Queda escrita en voz/manifest.json y el control final la compara con la APROBADA
// (lib/controles.mjs): si alguien cambia algo de acá sin que Diego lo escuche, el clip no sale.
export const RECETA = 'tts=eleven_multilingual_v2|ajustes=C-argentina(0.31/0.63)|G-otros-paises(0.42/0.35)|una-toma-por-personaje(...)|sts=una-pasada-por-personaje|recorte=al-mezclar|cierre=toma-verificada-de-la-marca|off=una-frase-5a10-palabras-voz-de-la-marca';

// RECETA C (Diego, 30-Oct-2026, combo Brinna: las voces «suenan sin vida, apáticas»). Prueba A/B/C escuchada por Diego: eligió
// C (el ajuste expresivo de la toma D del cierre más el texto actuado) «10 % menos acentuado»: estabilidad 0,28 → 0,31 y
// estilo 0,7 → 0,63. Reemplaza a «ajustes propios de la voz» para todas las frases en off.
export const AJUSTES_VOZ = { stability: 0.31, similarity_boost: 0.8, style: 0.63, use_speaker_boost: true };
// Solo Argentina (Diego, 30-Oct): con estilo alto la voz pierde su acento (el cierre chileno de VentiMaku sonaba rioplatense).
// Los demás países van con el ajuste de la toma G que eligió Diego para Valentina, que conserva el acento.
export const AJUSTES_OTROS_PAISES = { stability: 0.42, similarity_boost: 0.9, style: 0.35, use_speaker_boost: true };
export const ajustesDe = (site) => (String(site || 'MLA').toUpperCase().startsWith('MLA') ? AJUSTES_VOZ : AJUSTES_OTROS_PAISES);

// claveFija: toma del mismo texto/voz ya cacheada.
async function fetchEleven(url, init) {
  try { return await fetch(url, init); }
  catch (e) { throw new Error(`No se pudo conectar a api.elevenlabs.io (red bloqueada o sin salida; habilitá api.elevenlabs.io en Configuración o corré en sesión local): ${e?.message || e}`); }
}

// toma: número de toma cuando el que llama quiere una toma NUEVA del mismo texto (ej. la voz en off que no dijo el guion).
export async function tts(voz, texto, salida, { previo = '', siguiente = '', site = 'MLA', toma = 0 } = {}) {
  const cuerpo = { text: texto, model_id: MODELO_TTS, voice_settings: ajustesDe(site) };   // receta C en Argentina, G en el resto (30-Oct)
  if (previo) cuerpo.previous_text = previo;
  if (siguiente) cuerpo.next_text = siguiente;
  const k = huella('tts', voz, cuerpo, toma);
  if (desdeCache(k, salida)) { vozReusadas.tts++; return salida; }
  const r = await fetchEleven(`https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': clave(), 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 200)}`);
  writeFileSync(salida, Buffer.from(await r.arrayBuffer()));
  aCache(k, salida);
  return salida;
}

// claveFija: si el que llama ya sabe qué define la toma (ej. los videos de Flow de donde sale el audio), la pasa y el cambio de
// voz se reusa aunque el audio de entrada difiera en algún byte (los cortes salen de una transcripción que puede variar).
export async function sts(voz, entrada, salida, { claveFija = null } = {}) {
  const k = huella('sts', voz, MODELO_STS, claveFija || createHash('sha256').update(readFileSync(entrada)).digest('hex'));
  if (desdeCache(k, salida)) { vozReusadas.sts++; return salida; }
  const fd = new FormData();
  fd.append('audio', new Blob([readFileSync(entrada)]), 'entrada.wav');
  fd.append('model_id', MODELO_STS);
  fd.append('remove_background_noise', 'true');
  const r = await fetchEleven(`https://api.elevenlabs.io/v1/speech-to-speech/${voz}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': clave() }, body: fd,
  });
  if (!r.ok) throw new Error(`STS ${r.status}: ${(await r.text()).slice(0, 200)}`);
  writeFileSync(salida, Buffer.from(await r.arrayBuffer()));
  aCache(k, salida);
  return salida;
}

if (process.argv[1]?.endsWith('voz.mjs')) {
  const [modo, voz, a, b] = process.argv.slice(2);
  const f = modo === 'tts' ? tts : modo === 'sts' ? sts : null;
  if (!f || !voz || !a || !b) { console.log('Uso: node voz.mjs tts <voz> "<texto>" <salida.mp3> | sts <voz> <entrada.wav> <salida.mp3>'); process.exit(2); }
  f(voz, a, b).then((o) => console.log('ok', o)).catch((e) => { console.log('ERROR', e.message); process.exit(1); });
}
