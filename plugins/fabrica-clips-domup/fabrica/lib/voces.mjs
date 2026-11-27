// Arma todas las voces del clip con ElevenLabs y las verifica transcribiéndolas (script fijo, sin IA).
//   - frase en off    → texto a voz (TTS) con la voz del personaje;
//   - frase a cámara  → cambio de voz (STS) sobre lo que dijo Flow, para conservar los labios; si al transcribirla cambió una
//                       palabra (22-Oct: «¡Mirá lo que llegó hoy!» salió «¡Mirá lo que se ve hoy!»), se reemplaza por TTS.
//   - toda frase se transcribe y se compara con el texto del plan; si no coincide, se reintenta y después se frena.
// Entrada: <dir>/anim-plan.json, <dir>/pedido.json, <dir>/anim/e<N>.mp4 (para las frases a cámara).
// Salida: <dir>/voz/f<escena>-<i>.mp3 y <dir>/voz/manifest.json.
// Uso: node lib/voces.mjs <dir>
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tts, sts, RECETA, huella, CACHE_VOZ, vozReusadas } from './voz.mjs';
import { ENV_LOCAL } from './rutas.mjs';
const AQUI = join(import.meta.dirname, '..');   // scripts/clips-worker

// Voces de repuesto de DomUP verificadas en ElevenLabs (25-Nov-2026) por si la voz asignada cayó (voice_not_found) o quedó vacía.
export const VOZ_REPUESTO = {
  mujer: 'bN1bDXgDIGX5lw0rtY2B',        // Melanie - Warm, Clear and Professional (AR)
  hombre: '5da4nOCHLuswM3TyAUSo',       // Diego - Casual & Friendly (AR)
  mujer_2: 'oq8K6jJPiW08295EbH2y',      // Martina - Warm and Easygoing (AR)
  hombre_2: 'kulszILr6ees0ArU8miO',     // Franco - Argentino de Córdoba (AR)
  mujer_mayor: 'nAFxIJGj7iSTeltygOfB',  // Nieve - Argentinian Grandmother (AR)
  hombre_mayor: 'rnELj0bXbbIF5nf5Rz3q', // Raul - Meta Colecciones - Argentino (AR)
};
export const VOZ_REPUESTO_DEFAULT = 'bN1bDXgDIGX5lw0rtY2B';
export const vozRepuestoDe = (slot) => VOZ_REPUESTO[slot] || VOZ_REPUESTO_DEFAULT;
export const esVozNoEncontrada = (err) => {
  const m = String(err?.message || err || '');
  return /voice_not_found/i.test(m) || (/\b(400|404)\b/.test(m) && /not_found|voice.*not found/i.test(m));
};

const ENV = ENV_LOCAL;
const elevenKey = () => process.env.ELEVENLABS_API_KEY
  || (existsSync(ENV) && (readFileSync(ENV, 'utf8').match(/^ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m) || [])[1]?.trim())
  || '';
const groqKey = () => process.env.GROQ_API_KEY
  || (existsSync(ENV) && (readFileSync(ENV, 'utf8').match(/^GROQ_API_KEY\s*=\s*"?([^"\r\n]+)"?/m) || [])[1]?.trim())
  || '';

const SITE_A_PAIS = { MLA: 'AR', MLC: 'CL', MLM: 'MX', MCO: 'CO', MLU: 'UY', MPE: 'PE' };
const ACENTO_POR_PAIS = {
  AR: /argentin|rioplatense/i,
  CL: /chile/i,
  MX: /mexic/i,
  CO: /colomb/i,
  UY: /argentin|uruguay|rioplatense/i,
  PE: /peruv/i,
};

export function evaluarAcentoVoz(labels, site = 'MLA') {
  const s = String(site || 'MLA').trim().toUpperCase().slice(0, 3);
  const pais = SITE_A_PAIS[s] || null;
  if (!pais || !labels || typeof labels !== 'object') return { ok: true, pais, site: s };
  const accent = String(labels.accent || '').trim();
  const language = String(labels.language || '').trim().toLowerCase();
  if (language && !/^(es|spa|spanish|español|espanol)$/i.test(language)) {
    return {
      ok: false,
      pais,
      site: s,
      accent: accent || null,
      language,
      motivo: `idioma "${language}" distinto de español para ${pais} (${s})`,
    };
  }
  const re = ACENTO_POR_PAIS[pais];
  const generico = !accent || /^(latin\s*american|neutral|standard|castilian|spanish|español)$/i.test(accent);
  if (re && (generico || !re.test(accent))) {
    return {
      ok: false,
      pais,
      site: s,
      accent: accent || null,
      language: language || null,
      motivo: accent
        ? `acento "${accent}" no coincide con ${pais} (${s})`
        : `sin acento de país en ElevenLabs para ${pais} (${s})`,
    };
  }
  return { ok: true, pais, site: s, accent: accent || null, language: language || null };
}

async function obtenerLabelsVoz(voiceId, cache) {
  if (!voiceId) return null;
  if (cache.has(voiceId)) return cache.get(voiceId);
  const k = elevenKey();
  if (!k) { cache.set(voiceId, null); return null; }
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
      headers: { 'xi-api-key': k },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) { cache.set(voiceId, null); return null; }
    const j = await r.json();
    const labels = j?.labels && typeof j.labels === 'object' ? j.labels : null;
    cache.set(voiceId, labels);
    return labels;
  } catch {
    cache.set(voiceId, null);
    return null;
  }
}
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(Boolean);
const dur = (f) => +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();

export async function transcribir(archivo) {
  const k = groqKey();
  if (k) {
    const fd = new FormData();
    fd.append('file', new Blob([readFileSync(archivo)]), 'a.mp3');
    fd.append('model', 'whisper-large-v3'); fd.append('language', 'es');
    fd.append('response_format', 'verbose_json'); fd.append('timestamp_granularities[]', 'word');
    for (let i = 0; i < 4; i++) {
      const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${k}` }, body: fd });
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 15000 * (i + 1))); continue; }
      if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const d = await r.json();
      return { texto: d.text || '', palabras: (d.words || []).map((w) => ({ t: w.word.trim(), s: w.start, e: w.end })) };
    }
    throw new Error('Groq: demasiados pedidos seguidos');
  }
  const ek = elevenKey();
  if (!ek) throw new Error('falta GROQ_API_KEY o ELEVENLABS_API_KEY en .env.local');
  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(archivo)]), 'a.mp3');
  fd.append('model_id', 'scribe_v1');
  fd.append('language_code', 'spa');
  fd.append('timestamps_granularity', 'word');
  for (let i = 0; i < 4; i++) {
    let r;
    try {
      r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': ek }, body: fd });
    } catch (e) {
      throw new Error(`No se pudo conectar a api.elevenlabs.io (red bloqueada o sin salida; habilitá api.elevenlabs.io en Configuración o corré en sesión local): ${e?.message || e}`);
    }
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 15000 * (i + 1))); continue; }
    if (!r.ok) throw new Error(`ElevenLabs STT ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    const palabras = (d.words || [])
      .filter((w) => !w.type || w.type === 'word')
      .map((w) => ({ t: String(w.text || w.word || '').trim(), s: w.start, e: w.end }))
      .filter((w) => w.t);
    return { texto: d.text || '', palabras };
  }
  throw new Error('ElevenLabs STT: demasiados pedidos seguidos');
}

// Números a palabras (0 a 9999): whisper escribe «144» lo que la voz dijo «ciento cuarenta y cuatro» (22-Oct, falso rechazo).
const U = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidos', 'veintitres', 'veinticuatro', 'veinticinco',
  'veintiseis', 'veintisiete', 'veintiocho', 'veintinueve'];
const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function enLetras(n) {
  if (n < 30) return U[n];
  if (n < 100) return D[Math.floor(n / 10)] + (n % 10 ? ' y ' + U[n % 10] : '');
  if (n === 100) return 'cien';
  if (n < 1000) return C[Math.floor(n / 100)] + (n % 100 ? ' ' + enLetras(n % 100) : '');
  const m = Math.floor(n / 1000);
  return (m === 1 ? 'mil' : enLetras(m) + ' mil') + (n % 1000 ? ' ' + enLetras(n % 1000) : '');
}
// «%» se lee «por ciento» (31-Oct: whisper escribe «1%» y la voz dice «uno por ciento»; frenaba el clip de VentiMaku f4d1697b).
const conSimbolos = (s) => String(s).replace(/%/g, ' por ciento ');
export const palabrasEnLetras = (s) => norm(conSimbolos(s).replace(/\d{1,4}/g, (x) => ' ' + enLetras(+x) + ' '));
const plano = (s) => norm(conSimbolos(s).replace(/\d{1,4}/g, (x) => ' ' + enLetras(+x) + ' ')).join('');

// Coincide si la voz dijo el texto del plan, sin mirar espacios ni cómo escribe whisper los números («VeoQuiero» = «Veo
// Quiero», «144» = «ciento cuarenta y cuatro»). Whisper escribe mal los nombres propios («Mili» → «Milly», «Mealy», 23-Oct):
// se toleran hasta 15 % de letras distintas. Una frase corta no tiene tolerancia (sigue frenando «Tu IA» → «Tu guía»).
function distancia(a, b) {
  const f = Array.from({ length: b.length + 1 }, (_, k) => k);
  for (let x = 1; x <= a.length; x++) {
    let prev = f[0]; f[0] = x;
    for (let y = 1; y <= b.length; y++) { const t = f[y]; f[y] = Math.min(f[y] + 1, f[y - 1] + 1, prev + (a[x - 1] === b[y - 1] ? 0 : 1)); prev = t; }
  }
  return f[b.length];
}
// En español la b y la v, la k y la c dura, la z y la s suenan igual: whisper elige una cualquiera (29-Oct: «Ventimáku» se
// escribió «Bentimacu»). Se comparan por cómo suenan.
const fon = (s) => s.replace(/v/g, 'b').replace(/k/g, 'c').replace(/qu/g, 'c').replace(/z/g, 's').replace(/ll/g, 'y').replace(/h/g, '');
export function coincide(plan, oido) {
  const a = fon(plano(plan)), b = fon(plano(oido));
  return distancia(a, b) <= Math.floor(a.length * 0.15);
}

// Tramo con voz dentro del audio de Flow: primer y último sonido por encima de -35 dB.
function tramoVoz(wav) {
  const r = spawnSync('ffmpeg', ['-i', wav, '-af', 'silencedetect=noise=-35dB:d=0.25', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const total = dur(wav);
  const ini = [...r.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const fin = [...r.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const a = ini[0] === 0 || (ini.length && ini[0] < 0.05) ? fin[0] : 0;
  const ultimoSilencio = ini.filter((x) => x > a).pop();
  const b = ultimoSilencio && !fin.some((x) => x > ultimoSilencio) ? ultimoSilencio : total;
  return { a: Math.max(0, a - 0.05), b: Math.min(total, b + 0.05) };
}

// Dónde empieza y termina la voz dentro del archivo, SIN tocar el audio (23-Oct: recortar y volver a codificar le comía el
// arranque y el final a las palabras y dejaba la voz dura). El montaje usa estos tiempos para recortar al mezclar.
function medirVoz(mp3) {
  const r = spawnSync('ffmpeg', ['-i', mp3, '-af', 'silencedetect=noise=-50dB:d=0.08', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const total = dur(mp3);
  const ini = [...r.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const fin = [...r.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const a = ini.length && ini[0] < 0.02 && fin.length ? fin[0] : 0;
  const ultimo = ini.filter((x) => x > a + 0.1).pop();
  const b = ultimo && !fin.some((x) => x > ultimo) ? ultimo : total;
  return { ini: Math.max(0, a - 0.04), fin: Math.min(total, b + 0.12) };
}

// Cómo se DICE la marca. «pronunciacion» a veces es la grafía («Puertas Ícas») y a veces una explicación («Chans, como en
// inglés: una sola sílaba…»). Se toma lo que va antes de la primera coma, dos puntos, punto y coma, paréntesis o « como »; si
// queda algo largo (más de 4 palabras), es una explicación sin grafía y se usa el nombre tal cual. (27-Oct, CHAN'S: la voz del
// cierre leyó la explicación entera en vez de la marca.)
export function marcaDicha(es = {}) {
  // Solo cuenta la oración que habla de la MARCA (29-Oct, Grupo Alterna: la esencia arrancaba con «Philco se dice FIL-co» —una
  // marca que vende— y el cierre dijo «Filco» en lugar de «Grupo Alterna»). Si ninguna oración nombra la marca, va como se escribe.
  const n = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
  const marca = n(es.nombre_marca);
  const oraciones = String(es.pronunciacion || '').split(/(?<=[.;])\s+|\n+/);
  const pr = marca ? (oraciones.find((o) => n(o).includes(marca) || n(o).replace(/ /g, '').includes(marca.replace(/ /g, ''))) || '') : String(es.pronunciacion || '');
  if (!pr) return es.nombre_marca || '';
  // 29-Oct, VentiMaku: «VentiMaku se pronuncia ven-ti-MÁ-ku… (para la voz escribir 'Ventimáku')» → la voz dijo la frase entera.
  // 1) lo que la esencia indica escribir para la voz; 2) lo que sigue a «se pronuncia / se dice / se lee»; 3) el criterio de antes.
  const paraVoz = pr.match(/para la voz[^'"«“]*['"«“]([^'"»”]+)['"»”]/i);
  if (paraVoz) return paraVoz[1].trim();
  // hasta 4 palabras después de «se dice» («Puertas ICAS se dice Puertas Ícas» → «Puertas Ícas»; «ven-ti-MÁ-ku» → «Ventimáku»)
  const sePron = pr.match(/se (?:pronuncia|dice|lee)\s+["'«“]?([^,.;("'»”]+)/i);
  if (sePron && sePron[1].trim().split(/\s+/).length <= 4) {
    return sePron[1].trim().split(/\s+/).map((w) => { const x = w.replace(/-/g, '').toLowerCase(); return x.charAt(0).toUpperCase() + x.slice(1); }).join(' ');
  }
  const p = pr.split(/[,:;(]|\s+como\s+/i)[0].trim().replace(/[.«»"]+$/g, '').trim();
  return p && p.split(/\s+/).length <= 4 && !/\bse (pronuncia|dice|lee)\b/i.test(p) ? p : (es.nombre_marca || '');
}

export async function voces(dir, log = console.log) {
  const plan = JSON.parse(readFileSync(join(dir, 'anim-plan.json'), 'utf8'));
  const pedido = JSON.parse(readFileSync(join(dir, 'pedido.json'), 'utf8'));
  const elenco = Object.fromEntries(pedido.elenco.map((e) => [e.slot, e]));
  mkdirSync(join(dir, 'voz'), { recursive: true });
  // La marca se escribe como figura y se pronuncia como dice la esencia (ICAS: «Puertas Ícas»).
  const es = pedido.esencia || {};
  const dicha = marcaDicha(es);
  const decir = (t) => es.nombre_marca && dicha ? t.split(es.nombre_marca).join(dicha) : t;
  // Un plan viejo puede traer como cierre la INSTRUCCIÓN de la esencia en vez de la frase (10-Nov, bolso de Racer 77cbf6d3: la voz
  // leía «Cierra con el nombre de la tienda RACER BIKES y el logo, sin frases institucionales» y el montaje lo escribía en pantalla).
  // Si el cierre es una instrucción, se dice y se escribe solo el nombre de la marca, y el plan queda corregido en el archivo.
  if (plan.cierre_voz?.texto && es.nombre_marca) {
    const tc = plan.cierre_voz.texto.trim().toLowerCase();
    if (['cierra ', 'cerrar ', 'termina ', 'terminar ', 'que cierre ', 'usar ', 'usá ', 'decir ', 'decí '].some((v) => tc.startsWith(v)) || tc.includes('sin frases')) {
      log(`cierre: el plan traía la instrucción de la esencia («${plan.cierre_voz.texto.slice(0, 60)}…»); queda «${es.nombre_marca}.»`);
      plan.cierre_voz = { personaje: plan.cierre_voz.personaje, texto: `${es.nombre_marca}.` };
      writeFileSync(join(dir, 'anim-plan.json'), JSON.stringify(plan, null, 1));
    }
  }
  // 11-Nov (TecnoTienda): el vendedor cambió el cierre de su marca («Encuéntralo en nuestra tienda RORMI…» → «Pídelo hoy y te llega
  // rápido.») y 7 planes ya aprobados seguían con el viejo: el clip se montaba entero y lo frenaba el control final. El cierre no
  // toca ninguna escena animada: si la esencia trae una frase y el plan tiene otra, se dice la de la esencia y el plan queda corregido.
  {
    const lim = (t) => String(t || '').replace(/[.!¡¿?]/g, '').trim().toLowerCase();
    const ec = String(es.cierre || '').trim().toLowerCase();
    const instr = ['cierra ', 'cerrar ', 'termina ', 'terminar ', 'que cierre ', 'usar ', 'usá ', 'decir ', 'decí '].some((v) => ec.startsWith(v)) || ec.includes('sin frases');
    if (plan.cierre_voz?.texto && es.cierre && !instr && !pedido.cierre_audio?.texto && lim(plan.cierre_voz.texto) !== lim(es.cierre)) {
      log(`cierre: el plan decía «${plan.cierre_voz.texto.slice(0, 60)}» y la marca ahora cierra con «${es.cierre.slice(0, 60)}»; se usa el de la marca`);
      plan.cierre_voz = { personaje: plan.cierre_voz.personaje, texto: es.cierre };
      writeFileSync(join(dir, 'anim-plan.json'), JSON.stringify(plan, null, 1));
    }
  }
  const out = [], fallas = [];
  // El cierre de la marca va como una «escena» más (n = 'cierre'): se dice sobre la placa final.
  const items = [...plan.escenas, ...(plan.cierre_voz ? [{ n: 'cierre', frases: [{ ...plan.cierre_voz, modo: 'off' }] }] : [])];
  // RECETA DE LOS EPISODIOS APROBADOS (ep16/ep17, 23-Oct-2026): la voz en off de cada personaje sale de UNA sola llamada con
  // todas sus frases separadas por « ... », para que ElevenLabs las diga como un relato y no como frases sueltas de robot
  // («habla como un robot de antes», Diego, v2 de la máscara). Después se corta en los silencios entre frases.
  // Las frases a cámara de cada personaje van juntas, con 1 s de silencio entre una y otra, en UNA sola pasada de cambio de voz.
  const todas = items.flatMap((e) => (e.frases || []).map((f, i) => ({ e, f, i })));
  const tramosPorSilencio = (mp3, n) => {
    const r = spawnSync('ffmpeg', ['-i', mp3, '-af', 'silencedetect=noise=-45dB:d=0.22', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const total = dur(mp3);
    const ini = [...r.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
    const fin = [...r.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
    const sil = ini.map((a, k) => [a, fin[k] ?? total]);
    const internos = sil.filter(([a, b]) => a > 0.05 && b < total - 0.05).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0])).slice(0, n - 1)
      .sort((x, y) => x[0] - y[0]);
    if (internos.length !== n - 1) return null;
    const bordes = [sil[0] && sil[0][0] < 0.05 ? sil[0][1] : 0, ...internos.flat(), (sil.at(-1) && sil.at(-1)[1] >= total - 0.05) ? sil.at(-1)[0] : total];
    return Array.from({ length: n }, (_, k) => ({ ini: Math.max(0, bordes[2 * k] - 0.04), fin: Math.min(total, bordes[2 * k + 1] + 0.12) }));
  };
  // Corte de una toma por su transcripción (24-Oct, máscara de payaso: cortar por los silencios más largos falló porque la coma de
  // «Nacho se la calzó atrás, sin ruido» hizo una pausa más larga que el final de otra frase). Se recorren las palabras de
  // whisper y cada frase toma las que cubren sus letras; el corte va a mitad de camino entre la última de una y la primera de la otra.
  const tramosPorPalabras = async (mp3, textos) => {
    const t = await transcribir(mp3), ws = t.palabras || [];
    if (!ws.length) return null;
    const letras = (s) => palabrasEnLetras(s).join('').length;
    const out = []; let k = 0;
    const son = (s) => fon(plano(s));
    for (let j = 0; j < textos.length; j++) {
      const tx = textos[j];
      const meta = letras(tx); let acc = 0; const ini = k;
      while (k < ws.length && acc < meta - 1) { acc += letras(ws[k].t); k++; }
      if (k === ini) return null;
      // 14-Nov (burbujero de Veoquiero 3f94e33a): whisper escribió una frase con otras letras («lucirse» → «Si Puyamae»), la cuenta de
      // letras se corrió dos palabras y TODAS las frases siguientes quedaron cortadas en la escena de al lado. La cuenta de letras
      // propone la frontera; la decide el parecido: entre 4 palabras antes y 4 después, queda el corte que más se parece a la frase.
      if (j < textos.length - 1) {
        const quedan = textos.length - 1 - j;
        let mejor = k, dm = Infinity;
        for (let e = Math.max(ini + 1, k - 4); e <= Math.min(ws.length - quedan, k + 4); e++) {
          const d = distancia(son(tx), son(ws.slice(ini, e).map((w) => w.t).join(' ')));
          if (d < dm || (d === dm && Math.abs(e - k) < Math.abs(mejor - k))) { dm = d; mejor = e; }
        }
        k = mejor;
      }
      out.push({ a: ws[ini].s, b: ws[k - 1].e, pri: ini, ult: k - 1 });
    }
    const total = dur(mp3);
    // Las palabras dicen QUÉ frontera es; el silencio real dice DÓNDE cortar (24-Oct, máscara de zombie: whisper estiró
    // «sillón.» hasta 2,42 s tragándose la pausa y le dio a «Giró» 2,42-2,46; el corte a mitad de camino se comió el «Giró»).
    // Se busca el silencio más largo entre el comienzo de la última palabra de una frase y el final de la primera de la otra.
    const r = spawnSync('ffmpeg', ['-i', mp3, '-af', 'silencedetect=noise=-45dB:d=0.12', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const sIni = [...r.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
    const sFin = [...r.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
    const sil = sIni.map((a, j) => [a, sFin[j] ?? total]);
    const fronteras = out.slice(0, -1).map((x, i) => {
      const desde = ws[out[i].ult].s, hasta = ws[out[i + 1].pri].e;
      const c = sil.filter(([a, b]) => b > desde && a < hasta).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
      return c ? { fin: c[0] + 0.12, ini: c[1] - 0.04 } : { fin: (x.b + out[i + 1].a) / 2, ini: (x.b + out[i + 1].a) / 2 };
    });
    return out.map((x, i) => ({
      ini: Math.max(0, i ? fronteras[i - 1].ini : x.a - 0.08),
      fin: Math.min(total, i < out.length - 1 ? fronteras[i].fin : x.b + 0.15),
    }));
  };
  const resultado = new Map();   // clave e.n-i → { via, archivo, ini, fin, inicio, palabras, oido }
  const clave = (x) => `${x.e.n}-${x.i}`;
  const siteCuenta = String(pedido.site || pedido.item?.id || 'MLA').trim().toUpperCase().slice(0, 3);
  const labelsCache = new Map();
  const acentosRevisados = new Set();
  const acentosAviso = new Map(); // slot → { slot, nombre, voice_id, pais, site, accent, language, motivo, mensaje }
  const controlarAcento = async (slot, vId) => {
    const k = `${slot}:${vId}`;
    if (!vId || acentosRevisados.has(k)) return;
    acentosRevisados.add(k);
    const labels = await obtenerLabelsVoz(vId, labelsCache);
    const ev = evaluarAcentoVoz(labels, siteCuenta);
    if (!ev.ok) {
      const nom = elenco[slot]?.nombre || slot;
      const mensaje = `⚠️ la voz de ${nom} (${slot}) tiene ${ev.motivo}; revisá el acento en Elenco`;
      log(mensaje);
      acentosAviso.set(slot, { slot, nombre: nom, voice_id: vId, ...ev, mensaje });
    }
  };
  const repuestosUsados = new Map(); // slot → { slot, nombre, voz_original, voz_repuesto, motivo }
  const ejecutarConVoz = async (slot, fn) => {
    const pSlot = elenco[slot] || { slot, nombre: slot, voz_id: null };
    const repuestoId = vozRepuestoDe(slot);
    const anotarRepuesto = (motivo) => {
      if (!repuestosUsados.has(slot)) {
        log(`voz de ${pSlot.nombre || slot} (${slot}): ${motivo === 'vacia' ? 'sin voz_id' : 'voice_not_found en ElevenLabs'} → uso repuesto ${repuestoId}`);
        repuestosUsados.set(slot, {
          slot,
          nombre: pSlot.nombre || slot,
          voz_original: pSlot.voz_id || null,
          voz_repuesto: repuestoId,
          motivo,
        });
      }
    };
    const yaRep = repuestosUsados.get(slot);
    const inicial = yaRep ? yaRep.voz_repuesto : pSlot.voz_id;
    if (!inicial) {
      anotarRepuesto('vacia');
      await controlarAcento(slot, repuestoId);
      return await fn(repuestoId);
    }
    try {
      await controlarAcento(slot, inicial);
      return await fn(inicial);
    } catch (err) {
      if (!esVozNoEncontrada(err) || inicial === repuestoId) throw err;
      anotarRepuesto('voice_not_found');
      await controlarAcento(slot, repuestoId);
      return await fn(repuestoId);
    }
  };

  // 0. Cierre de la marca: si hay una toma verificada (Veoquiero: la de Vero del ep14, reusada desde el ep17), se usa esa y no se
  //    regenera (23-Oct: el cierre generado de nuevo salió mal dicho).
  const cierreX = todas.find((x) => x.e.n === 'cierre');
  // Marca sin toma verificada (10-Nov, Racer Bikes: 4 clips terminados frenados porque el cierre «RACER BIKES.» se generaba de nuevo
  // en cada clip y la máquina lo oía «Ráter de Baikas»). Se prueban hasta 4 formas de escribirla para la voz; la primera que se oye
  // bien queda guardada como EL cierre de la marca (sets/marcas/<cuenta>/cierre.json) y se reusa en todos sus clips, igual en todos.
  // Queda anotado que falta que Diego la escuche. Si ninguna se oye bien, sigue como antes (el clip frena y lo ve el equipo).
  if (cierreX && es.nombre_marca && !(pedido.cierre_audio?.archivo && existsSync(pedido.cierre_audio.archivo))) {
    try {
      const T = cierreX.f.texto, tienda = pedido.official_store_id ?? pedido.item?.official_store_id ?? 0;
      const titulo = es.nombre_marca.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const formas = [...new Set([dicha, titulo, String(dicha || '').normalize('NFD').split('').filter((c) => c.charCodeAt(0) < 768 || c.charCodeAt(0) > 879).join(''), es.nombre_marca].filter(Boolean))];
      if (T.includes(es.nombre_marca)) {
        const carpeta = join(dir, '..', '..', '_marcas', `${pedido.cust_id}-${tienda}`, 'cierre-tomas');
        mkdirSync(carpeta, { recursive: true });
        for (const [k, forma] of formas.entries()) {
          const mp3 = join(carpeta, `auto-${k + 1}.mp3`);
          // con la última frase del clip como contexto, para que el cierre no suene suelto (10-Nov, Diego: «suenan robóticos»)
          const previoC = String(plan.escenas.at(-1)?.frases?.at(-1)?.texto || '');
          await ejecutarConVoz(cierreX.f.personaje, (vId) => tts(vId, T.split(es.nombre_marca).join(forma), mp3, { site: String(pedido.item_id || '').slice(0, 3), previo: previoC }));
          const oidoC = await transcribir(mp3);
          const bien = coincide(T, oidoC.texto) || coincide(T.split(es.nombre_marca).join(dicha || es.nombre_marca), oidoC.texto);
          log(`cierre de la marca, forma ${k + 1} («${forma}»): se oye «${String(oidoC.texto).trim()}» ${bien ? '✓' : '✗'}`);
          if (!bien) continue;
          const wav = join(carpeta, '..', 'cierre-marca.wav');
          spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3, '-ac', '1', '-ar', '44100', wav]);
          const reg = { ...(tienda ? { official_store_id: tienda } : {}), archivo: wav.split(String.fromCharCode(92)).join('/'), texto: T,
            origen: `${new Date().toISOString().slice(0, 10)}: toma automática de ${elenco[cierreX.f.personaje]?.nombre || cierreX.f.personaje}, escrita «${forma}»; pasó el control de oído de la máquina, falta que Diego la escuche` };
          // 10-Nov, Diego escuchó las dos primeras tomas automáticas (Racer y Lemirk): «suenan robóticos, malísimos». Una toma
          // automática NO queda como el cierre de la marca: vale solo para este clip. El cierre fijo lo elige Diego a oído entre
          // tomas hechas para eso (sets/marcas/<cuenta>/cierre.json), como en VentiMaku.
          writeFileSync(join(carpeta, 'ultima-automatica.json'), JSON.stringify(reg, null, 1) + String.fromCharCode(10));
          pedido.cierre_audio = { archivo: reg.archivo, texto: T };
          // también en pedido.json: el control del clip lo lee de ahí para saber que la marca ya está verificada (10-Nov)
          writeFileSync(join(dir, 'pedido.json'), JSON.stringify(pedido, null, 1), 'utf8');
          log(`cierre de la marca para este clip (toma automática, la marca todavía no tiene una elegida por Diego): ${reg.archivo}`);
          break;
        }
      }
    } catch (e) { log(`cierre automático de la marca: ${e.message}`); }
  }
  if (cierreX && pedido.cierre_audio?.archivo && existsSync(pedido.cierre_audio.archivo)) {
    const destino = join(dir, 'voz', 'cierre-marca.wav');
    if (/\.wav$/i.test(pedido.cierre_audio.archivo)) copyFileSync(pedido.cierre_audio.archivo, destino);
    else spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', pedido.cierre_audio.archivo, '-ac', '1', '-ar', '44100', destino]);
    resultado.set(clave(cierreX), { via: 'toma-verificada', archivo: 'voz/cierre-marca.wav', ini: 0, fin: dur(destino), inicio: null });
    log(`cierre: toma verificada de la marca («${pedido.cierre_audio.texto}»)`);
  }

  // 1. Frases a cámara: una pasada de cambio de voz por personaje.
  const porCam = {};
  todas.filter((x) => x.f.modo === 'camara' && existsSync(join(dir, 'anim', `e${x.e.n}.mp4`))).forEach((x) => (porCam[x.f.personaje] ||= []).push(x));
  for (const [slot, xs] of Object.entries(porCam)) {
    const partes = [], tramos = [];
    const salida = join(dir, 'voz', `cam-${slot}.mp3`);
    // Una sola vez (18-Nov): la toma de cambio de voz queda definida por la voz del personaje, los videos de Flow de donde sale
    // el audio y lo que dice cada frase. Si ya se hizo, se reusan la toma y los cortes guardados y no se llama a ElevenLabs.
    const xsHashes = xs.map((x) => [createHash('sha256').update(readFileSync(join(dir, 'anim', `e${x.e.n}.mp4`))).digest('hex'), x.f.texto]);
    const fijaDe = (vId) => huella('cam', vId, xsHashes);
    const vInicial = repuestosUsados.get(slot)?.voz_repuesto || elenco[slot]?.voz_id || null;
    const rutaTramos = vInicial ? join(CACHE_VOZ, `${fijaDe(vInicial)}.tramos.json`) : null;
    if (rutaTramos && existsSync(rutaTramos)) {
      try {
        const guardados = JSON.parse(readFileSync(rutaTramos, 'utf8'));
        await ejecutarConVoz(slot, (vId) => sts(vId, null, salida, { claveFija: fijaDe(vId) }));
        for (const g of guardados) {
          const x = xs.find((y) => clave(y) === g.clave);
          if (x) resultado.set(clave(x), { via: 'sts', archivo: `voz/cam-${slot}.mp3`, ini: g.ini, fin: g.fin, inicio: g.inicio });
        }
        log(`voz a cámara de ${elenco[slot].nombre}: toma ya hecha, se reusa (no se gasta ElevenLabs)`);
        continue;
      } catch (e) { log(`voz a cámara de ${elenco[slot].nombre}: no pude reusar la toma guardada (${e.message}), se hace de nuevo`); }
    }
    for (const x of xs) {
      const wav = join(dir, 'voz', `f${x.e.n}-${x.i + 1}-flow.wav`);
      spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, 'anim', `e${x.e.n}.mp4`), '-vn', '-ac', '1', '-ar', '44100', wav]);
      // Dónde habla en el video de Flow: por las palabras de la transcripción, no por el volumen (25-Oct, micrófono: el
      // ambiente de la escena 6 hizo que el volumen marcara voz desde el segundo 0 cuando Nacho arranca en el 0,8; el
      // montaje no pudo correr el video y la voz quedó desfasada de los labios). El volumen queda de respaldo.
      const tw = await transcribir(wav).catch(() => null), ws = tw?.palabras || [], dwav = dur(wav);
      // Si Flow dijo de más (29-Oct, Grupo Alterna: «…doña Lupita. Doña Lupita.»), se corta en la última palabra del guion.
      const nGuion = palabrasEnLetras(x.f.texto).length;
      const ult = ws.length > nGuion + 1 ? ws[nGuion - 1] : ws.at(-1);
      const t = ws.length ? { a: Math.max(0, ws[0].s - 0.08), b: Math.min(dwav, ult.e + 0.25) } : tramoVoz(wav);
      const rec = wav.replace('.wav', '-voz.wav');
      spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ss', String(t.a), '-to', String(t.b), rec]);
      partes.push(rec); tramos.push({ x, t, dur: dur(rec) });
    }
    const junto = join(dir, 'voz', `cam-${slot}-flow.wav`);
    // orden de entradas: parte0, sil0, parte1, sil1, ... (concat las toma en ese orden)
    const orden = []; partes.forEach((pp, k) => { orden.push('-i', pp); if (k < partes.length - 1) orden.push('-f', 'lavfi', '-t', '1', '-i', 'anullsrc=r=44100:cl=mono'); });
    const n = partes.length * 2 - 1;
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...orden, '-filter_complex', Array.from({ length: n }, (_, k) => `[${k}:a]`).join('') + `concat=n=${n}:v=0:a=1[o]`, '-map', '[o]', '-ac', '1', '-ar', '44100', junto]);
    await ejecutarConVoz(slot, (vId) => sts(vId, junto, salida, { claveFija: fijaDe(vId) }));
    // El cambio de voz respeta los tiempos: cada frase está donde estaba en el archivo de entrada.
    let cur = 0;
    const aGuardar = [];
    for (const { x, t, dur: d } of tramos) {
      resultado.set(clave(x), { via: 'sts', archivo: `voz/cam-${slot}.mp3`, ini: cur, fin: cur + d, inicio: t.a });
      aGuardar.push({ clave: clave(x), ini: cur, fin: cur + d, inicio: t.a });
      cur += d + 1;
    }
    const vUsada = repuestosUsados.get(slot)?.voz_repuesto || elenco[slot]?.voz_id;
    const rutaTramosFinal = vUsada ? join(CACHE_VOZ, `${fijaDe(vUsada)}.tramos.json`) : null;
    try { if (rutaTramosFinal) { mkdirSync(CACHE_VOZ, { recursive: true }); writeFileSync(rutaTramosFinal, JSON.stringify(aGuardar)); } } catch { /* sin cache no se frena */ }
  }

  // 2. Voz en off: una llamada por personaje con todas sus frases.
  const porOff = {};
  todas.filter((x) => !resultado.has(clave(x))).forEach((x) => (porOff[x.f.personaje] ||= []).push(x));
  for (const [slot, xs] of Object.entries(porOff)) {
    const salida = join(dir, 'voz', `off-${slot}.mp3`);
    let tr = null;
    for (let intento = 0; intento < 3 && !tr; intento++) {
      const texto = xs.map((x) => decir(intento && x.f.decir ? x.f.decir : x.f.texto)).join(' ... ');
      await ejecutarConVoz(slot, (vId) => tts(vId, texto, salida, { site: String(pedido.item_id || '').slice(0, 3), toma: intento }));
      tr = (await tramosPorPalabras(salida, xs.map((x) => x.f.texto))) || tramosPorSilencio(salida, xs.length);
      if (!tr) { log(`voz en off de ${elenco[slot].nombre}: no pude separar las ${xs.length} frases por sus silencios → reintento`); continue; }
      // 14-Nov (burbujero de Veoquiero 3f94e33a): la voz agregó palabras que no estaban («Si bien me dice abracadabra…») y el clip
      // entero frenaba en la verificación. Una toma así se pide de nuevo (hasta 2 veces más) antes de darla por buena.
      if (intento < 2) {
        const malas = [];
        for (let k = 0; k < xs.length; k++) {
          const tmp = join(dir, 'voz', `_prueba-${slot}-${k}.mp3`);
          spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', salida, '-ss', String(tr[k].ini), '-to', String(tr[k].fin), tmp]);
          const o = await transcribir(tmp).catch(() => null);
          rmSync(tmp, { force: true });
          if (o && !coincide(xs[k].f.texto, o.texto)) malas.push(`«${xs[k].f.texto}» salió «${o.texto.trim()}»`);
        }
        if (malas.length) { log(`voz en off de ${elenco[slot].nombre}: la toma no dice el guion (${malas.join(' | ').slice(0, 300)}) → se pide de nuevo`); tr = null; }
      }
    }
    if (!tr) { fallas.push(`voz en off de ${elenco[slot].nombre}: no se pudieron separar las frases`); continue; }
    xs.forEach((x, k) => resultado.set(clave(x), { via: 'tts', archivo: `voz/off-${slot}.mp3`, ini: tr[k].ini, fin: tr[k].fin, inicio: null }));
  }

  // 3. Verificación frase por frase: se transcribe el tramo de cada una y tiene que decir el guion.
  for (const x of todas) {
    const r = resultado.get(clave(x)); if (!r) continue;
    const p = elenco[x.f.personaje], tramo = join(dir, 'voz', `f${x.e.n}-${x.i + 1}.mp3`);
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, r.archivo), '-ss', String(r.ini), '-to', String(r.fin), tramo]);
    let oido = await transcribir(tramo);
    // Frase a cámara que Flow dijo con otras palabras: se reemplaza por texto a voz con la voz del personaje (lo que prometía el
    // encabezado y no estaba hecho; 29-Oct, Grupo Alterna: «…ya no da miedo» salió «O sea, … ya no da nada» y el clip frenaba).
    if (!coincide(x.f.texto, oido.texto) && r.via === 'sts') {
      const reemplazo = join(dir, 'voz', `f${x.e.n}-${x.i + 1}-tts.mp3`);
      await ejecutarConVoz(x.f.personaje, (vId) => tts(vId, decir(x.f.decir || x.f.texto), reemplazo, { site: String(pedido.item_id || '').slice(0, 3) }));
      const oido2 = await transcribir(reemplazo);
      if (coincide(x.f.texto, oido2.texto)) {
        log(`escena ${x.e.n}: Flow dijo «${oido.texto.trim()}»; va con texto a voz`);
        Object.assign(r, { via: 'tts-reemplazo', archivo: `voz/f${x.e.n}-${x.i + 1}-tts.mp3`, ini: 0, fin: dur(reemplazo) });
        copyFileSync(reemplazo, tramo);
        oido = oido2;
      }
    }
    // La toma del cierre que Diego eligió a oído ya está verificada por una persona: Whisper oye mal la marca (31-Oct, «VentiMaku»
    // salió «en de a 20 mac o») y frenaba un clip terminado. Mismo criterio que el chequeo de marca de controles.mjs.
    if (!coincide(x.f.texto, oido.texto) && r.via !== 'toma-verificada') fallas.push(`escena ${x.e.n}: «${x.f.texto}» se oye «${oido.texto.trim()}»`);
    const ult = (oido.palabras || []).at(-1);
    if (r.via === 'sts' && ult && r.ini + ult.e + 0.35 < r.fin) r.fin = r.ini + ult.e + 0.35;   // ruido de fondo después de la frase
    const d = +(r.fin - r.ini).toFixed(3);
    const rep = repuestosUsados.get(x.f.personaje);
    const acAv = acentosAviso.get(x.f.personaje);
    out.push({ escena: x.e.n, i: x.i + 1, personaje: x.f.personaje, nombre: p.nombre, modo: x.f.modo, texto: x.f.texto, via: r.via,
      inicio_en_escena: r.inicio, receta: RECETA, archivo: r.archivo, voz_ini: +r.ini.toFixed(3), dur: d,
      palabras_por_seg: +(x.f.texto.split(/\s+/).length / d).toFixed(2), palabras: oido.palabras || [],
      ...(rep && r.via !== 'toma-verificada' ? { voz_repuesto: true, voz_id_usada: rep.voz_repuesto, voz_repuesto_motivo: rep.motivo } : {}),
      ...(acAv && r.via !== 'toma-verificada' ? { voz_acento_aviso: acAv.mensaje } : {}) });
  }
  writeFileSync(join(dir, 'voz', 'manifest.json'), JSON.stringify(out, null, 1));
  log(`${out.length} frases · ${out.filter((x) => x.via === 'sts').length} con cambio de voz · ${fallas.length} fallas${repuestosUsados.size ? ` · repuesto: ${[...repuestosUsados.keys()].join(', ')}` : ''}${acentosAviso.size ? ` · acento aviso: ${[...acentosAviso.keys()].join(', ')}` : ''} · reusadas sin gastar ElevenLabs: ${vozReusadas.tts} de texto a voz y ${vozReusadas.sts} de cambio de voz`);
  return { ok: !fallas.length, fallas, frases: out, repuestos: [...repuestosUsados.values()], acentos_aviso: [...acentosAviso.values()] };
}

if (process.argv[1]?.endsWith('voces.mjs')) {
  voces(process.argv[2]).then((r) => { for (const x of r.fallas) console.log('✗', x); process.exit(r.ok ? 0 : 1); })
    .catch((e) => { console.log('ERROR', e.message); process.exit(1); });
}
