// Controles puros de guiones y clip terminado: sin dependencia de claude.mjs, saber.mjs ni revisiones.mjs.
// Compartido entre la fábrica (lib/controles.mjs) y el plugin fabrica-clips-domup (guion-viral y montaje-clip).
// Uso CLI:
//   node lib/controles-puros.mjs guiones <dir>
//   node lib/controles-puros.mjs clip <dir>
import { fraseEnumera } from './guardia-animacion.mjs';
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROHIBIDO = /(\$\s?\d|precio|promo|descuento|env[ií]o|cuotas?|https?:\/\/|seguinos|s[ií]guenos|garant[ií]a)/i;

const leerJson = (ruta, errores) => {
  if (!existsSync(ruta)) { errores.push(`falta ${ruta.split(/[\\/]/).pop()}`); return null; }
  try { return JSON.parse(readFileSync(ruta, 'utf8')); } catch (e) { errores.push(`${ruta.split(/[\\/]/).pop()} no es JSON válido: ${e.message}`); return null; }
};

// Cuadros por clip (12-Nov, Diego: «probemos 6 cuadros»): 6 por defecto; escenas-por-cuenta.json en la raíz del repo
// ({"default":6,"<cust_id>":6}) lo cambia por cuenta, para los guiones NUEVOS. Plan, storyboard y animación siguen al guion.
export function escenasDe(cust) {
  try { const j = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'escenas-por-cuenta.json'), 'utf8')); const n = Number(j[String(cust)] ?? j.default); return [6, 8].includes(n) ? n : 6; } catch { return 6; }
}

// Lo que se arregla solo no gasta una vuelta (09-Nov, foco e39 de Grupo Alterna, 435017fc: tres corridas y USD 8 frenadas por
// (a) urls de virales que el redactor inventó y (b) el campo «hook» distinto de la frase que se dice en la escena 1; las dos cosas
// tienen una sola respuesta correcta). Se corrige en el archivo antes de controlar y queda anotado en arreglos-solos.txt.
export function arreglarGuionesSolos(dir) {
  const notas = [];
  try {
    const rv = join(dir, 'virales.json'), rc = join(dir, 'virales-crudo.json'), rg = join(dir, 'guiones.json');
    if (existsSync(rv) && existsSync(rc) && existsSync(rg)) {
      const virales = JSON.parse(readFileSync(rv, 'utf8')), crudo = JSON.parse(readFileSync(rc, 'utf8')), guiones = JSON.parse(readFileSync(rg, 'utf8'));
      const reales = new Set(Object.values(crudo.fuentes || {}).flatMap((x) => (Array.isArray(x) ? x : x?.items || []).map((y) => y.url)));
      const usadas = new Set((Array.isArray(guiones) ? guiones : []).map((g) => g.viral));
      if (Array.isArray(virales) && reales.size) {
        const quedan = virales.filter((v) => reales.has(v.url) || usadas.has(v.url));   // la que usa un guion no se saca: ese error se muestra
        if (quedan.length < virales.length) { writeFileSync(rv, JSON.stringify(quedan, null, 1), 'utf8'); notas.push(`virales: saqué ${virales.length - quedan.length} url(s) que no estaban en el relevamiento`); }
      }
    }
    if (existsSync(rg)) {
      const guiones = JSON.parse(readFileSync(rg, 'utf8')); let toco = false;
      const plano = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9ñ ]/g, '').replace(/\s+/g, ' ').trim();
      (Array.isArray(guiones) ? guiones : []).forEach((g) => {
        const t = g?.escenas?.[0]?.texto || '';
        // primera frase DICHA: «…» que no viene de un rótulo, cartel, chip o texto en pantalla
        // (con «» las comillas de adentro no cortan la frase; los ladridos y maullidos no son el gancho)
        const dicha = [...t.matchAll(/([^.«»]*?)[:,]\s*(?:«([^»]{3,})»|“([^”]{3,})”|"([^"]{3,})")/g)].map((m) => [m[1], m[2] || m[3] || m[4]])
          .find(([antes, fr]) => !/r[óo]tulo|cartel|chip|placa|texto|tilde|pantalla|letrero/i.test(antes) && fr.trim().split(/\s+/).length >= 3 && !/^[¡!\s]*(guau|miau|grr|ruf|wof)/i.test(fr))?.[1];
        if (!dicha || !g.hook) return;
        const h = plano(g.hook), d = plano(dicha);
        if (h === d || h.includes(d) || d.includes(h)) return;   // «¡Karla! ¿…?» contra «¿…?»: es la misma frase con o sin el vocativo
        notas.push(`${g.id}: el hook decía «${g.hook}» y en la escena 1 se dice «${dicha}»; queda el de la escena`);
        if (g.gancho && typeof g.gancho === 'object' && g.gancho.verbal && plano(g.gancho.verbal) === h) g.gancho.verbal = dicha;
        g.hook = dicha; toco = true;
      });
      if (toco) writeFileSync(rg, JSON.stringify(guiones, null, 1), 'utf8');
    }
    if (notas.length) appendFileSync(join(dir, 'arreglos-solos.txt'), `${new Date().toISOString()} guiones\n- ${notas.join('\n- ')}\n`, 'utf8');
  } catch { /* si algo no se puede leer, lo dicen los controles de abajo */ }
  return notas;
}

export function controlarGuionesForma(dir, pedido) {
  const errores = [];
  arreglarGuionesSolos(dir);
  const esVideo = pedido?.fuente === 'video';
  const rutaVirales = join(dir, 'virales.json');
  const virales = esVideo && !existsSync(rutaVirales) ? [] : leerJson(rutaVirales, errores);
  const guiones = leerJson(join(dir, 'guiones.json'), errores);
  if ((!esVideo && !virales) || !guiones) return { ok: false, errores };
  // Si el relevamiento no trajo nada ni con la búsqueda general, alcanza con los moldes de la casa (29-Oct, foco de Grupo Alterna:
  // los guiones estaban bien armados sobre «mision» y «confesionario» y se tiraban por no tener virales).
  if (!esVideo) {
    const conMoldes = Array.isArray(guiones) && guiones.length && guiones.every((g) => g.molde && !String(g.molde).startsWith('viral:'));
    // 10-Nov (gabinetes a prueba de vapor de Grupo Alterna 101235c3): el relevamiento trajo 20 videos y ninguno era del producto; los
    // tres guiones salieron sobre moldes de la casa y el control los tiró igual. Con los tres guiones sobre moldes de la casa, los
    // virales no son obligatorios, haya traído lo que haya traído el relevamiento.
    if (!Array.isArray(virales) || (virales.length < 3 && !conMoldes)) errores.push(`virales.json tiene ${virales.length ?? 0} referencias (mínimo 3)`);
    // Ninguna url inventada: todas tienen que venir del relevamiento del script (virales-crudo.json).
    const crudo = existsSync(join(dir, 'virales-crudo.json')) ? leerJson(join(dir, 'virales-crudo.json'), []) : null;
    if (crudo) {
      const reales = new Set(Object.values(crudo.fuentes || {}).flatMap((f) => (Array.isArray(f) ? f : f?.items || []).map((x) => x.url)));
      (virales || []).forEach((v) => { if (!reales.has(v.url)) errores.push(`virales.json: ${v.url} no está en el relevamiento (inventada)`); });
    }
  }
  const urlsVirales = new Set((virales || []).map((v) => v.url));
  const elencoLista = Array.isArray(pedido?.elenco) ? pedido.elenco : [];
  const slots = new Set(elencoLista.map((a) => a.slot));
  // Chicos y animales no hablan (23-Oct: ElevenLabs no tiene voces de chicos; la máscara de bruja salió con «Benja grita: «¡Mamá!»»).
  const mudos = elencoLista.filter((a) => ['perro', 'gato', 'nina', 'nino'].includes(a.slot)).map((a) => ({ ...a, animal: ['perro', 'gato'].includes(a.slot) }));
  const hablan = new Set(elencoLista.filter((a) => !['perro', 'gato', 'nina', 'nino'].includes(a.slot)).map((a) => a.slot));
  if (!Array.isArray(guiones) || guiones.length < 2 || guiones.length > 3) errores.push(`guiones.json tiene ${guiones.length ?? 0} guiones (tienen que ser 3; 2 solo si se sacó uno que no pasó)`);
  // Uno solo recomendado, con su porqué (25-Oct: la app lo muestra con «⭐ Recomendado»).
  const recs = (guiones || []).filter((g) => g.recomendado === true);
  if (recs.length !== 1) errores.push(`hay ${recs.length} guiones recomendados: tiene que haber exactamente uno`);
  else if (!String(recs[0].por_que || '').trim()) errores.push(`el guion recomendado (${recs[0].id}) no dice por qué`);
  const usados = new Set();
  (guiones || []).forEach((g, i) => {
    const q = `guion ${i + 1}`;
    const camposOblig = esVideo ? ['id', 'titulo', 'hook', 'escenas', 'personajes'] : ['id', 'titulo', 'hook', 'escenas', 'personajes', 'viral'];
    for (const k of camposOblig) if (g[k] == null) errores.push(`${q}: falta ${k}`);
    const nEsc = escenasDe(pedido?.cust_id);
    if (!Array.isArray(g.escenas) || g.escenas.length !== nEsc) errores.push(`${q}: ${g.escenas?.length ?? 0} escenas (tienen que ser ${nEsc})`);
    (g.personajes || []).forEach((s) => { if (!slots.has(s)) errores.push(`${q}: el personaje «${s}» no está en el elenco`); });
    if (!(g.personajes || []).some((s) => hablan.has(s))) errores.push(`${q}: ningún personaje que hable`);
    // Personajes fuera del elenco nombrados en el texto (23-Oct, máscara de payaso: el g1 metió «la suegra» y la lista de
    // personajes no la tenía). Si el rol existe en el elenco del pedido, se acepta; si no, el guion vuelve.
    const ROLES = { suegra: ['mujer_mayor'], suegro: ['hombre_mayor'], abuela: ['mujer_mayor'], abuelo: ['hombre_mayor'], vecina: ['mujer_2'],
      vecino: ['hombre_2'], amiga: ['mujer_2'], amigo: ['hombre_2'], hermana: ['mujer_2'], hermano: ['hombre_2'], 'tía': ['mujer_2'], 'tío': ['hombre_2'],
      prima: ['mujer_2'], primo: ['hombre_2'], novia: ['mujer_2'], novio: ['hombre_2'], 'bebé': [], cartero: [], repartidor: [], 'chicos del barrio': [], 'los pibes': [] };
    const texto6 = (g.escenas || []).map((e) => e.texto || '').join(' ').toLowerCase();
    Object.entries(ROLES).forEach(([rol, slots2]) => {
      if (new RegExp(`(^|[^\\p{L}])${rol}([^\\p{L}]|$)`, 'u').test(texto6) && !slots2.some((x) => slots.has(x)))
        errores.push(`${q}: aparece «${rol}», que no está en el elenco del pedido (nunca inventar personajes)`);
    });
    (g.escenas || []).forEach((e, idxE) => mudos.forEach((m) => {
      const linea = new RegExp(`(?<!\\ba\\s)\\b${m.nombre}\\b(?:\\s*\\([^)]{0,90}\\))?[^.«(]{0,25}:\\s*[«"']([^«"'»]{0,80})`, 'i').exec(e.texto || '');
      const sonido = linea && m.animal && /^[\s¡!¿?.,…-]*((gu+a+[uf]+|w+[oa]+[fu]+|a+r+f+|ru+f+|a+u+u+|miau+|mia+u+|m+r+[ar]*u*|pr+r+|f+s+h*|ff+|grr+|ji+|ñam+|\(?(ladr|maull|ronrone|bufid|gru[ñn]|aull|gemid)[a-záéíóú]*\)?)[\s¡!¿?.,…-]*)+$/i.test(linea[1]);
      if (linea && !sonido) errores.push(`${q} escena ${idxE + 1}: habla ${m.nombre}; los chicos y los animales no hablan (lo dice un adulto o reacciona sin palabras)`);
    }));
    const nombres = elencoLista.filter((a) => a.nombre).map((a) => a.nombre);
    const e1 = g.escenas?.[0]?.texto || '';
    const confesor = nombres.map((n) => [n, e1.search(new RegExp(`\\b${n}\\b`, 'i'))]).filter(([, p]) => p >= 0).sort((a, b) => a[1] - b[1])[0]?.[0];
    (g.escenas || []).forEach((e, idxE) => {
      for (const [, quien, frase] of (e.texto || '').matchAll(/(\p{L}+)\s*\([^)]*\boff\b[^)]*\)\s*:\s*«([^»]+)»/giu)) {
        if (/^encontr/i.test(frase.trim())) continue;
        if (new RegExp(`\\b${quien}\\b`, 'i').test(frase)) errores.push(`${q} escena ${idxE + 1}: ${quien} en off se nombra a sí misma («${frase}»)`);
        if (confesor && confesor.toLowerCase() !== quien.toLowerCase() && /(^|[^\p{L}])(me|mi|mis|yo|conmigo)([^\p{L}]|$)/iu.test(frase))
          errores.push(`${q} escena ${idxE + 1}: ${quien} en off habla en primera persona («${frase}») pero el que confiesa es ${confesor}`);
      }
    });
    (g.escenas || []).forEach((e, idxE) => {
      mudos.forEach((m) => { if (new RegExp(`\\b${m.nombre}\\b[^.;]{0,30}\\bcant(a|ó|ando)\\b`, 'i').test(e.texto || '') && !/en silencio|sin sonido|sin voz/i.test(e.texto || ''))
        errores.push(`${q} escena ${idxE + 1}: ${m.nombre} canta; los chicos y los animales no tienen voz (ni hablan ni cantan)`); });
      const ficha = JSON.stringify(pedido?.item?.atributos || pedido?.producto?.atributos || {}) + (pedido?.item?.titulo || pedido?.producto?.titulo || '');
      if (/\b(cancela\w*|sin ruido|solo (se escucha|su voz)|a[ií]sla\w*|filtra\w* el ruido|ruido de fondo)\b/i.test(e.texto || '') && !/NOISE|ruido|cancel/i.test(ficha))
        errores.push(`${q} escena ${idxE + 1}: promete aislar o cancelar ruido y la ficha no lo dice`);
      if (/\b(se (le |les )?ca(e|en)|suelta (las|los|el|la|una|un)(?! (reacci|frase|l[ií]nea|pregunta|risa|carcajada|broma|chiste|palabra|respuesta|maullido|ladrido|gru[ñn]ido|ronroneo|bufido|aullido|suspiro|grito|gemido|resoplido|bostezo))|tira (las|los|el|la|una|un)(?! (reacci|frase|l[ií]nea|pregunta|broma|chiste|onda|idea))|arroja|derrama|vuelca|deja caer|se le resbala)\b/i.test(e.texto || ''))
        errores.push(`${q} escena ${idxE + 1}: algo cae, se suelta o se tira; Flow no lo hace creíble. La reacción va con el cuerpo (se tapa la boca, retrocede)`);
      for (const [, frase] of (e.texto || '').matchAll(/\([^)]*\boff\b[^)]*\)\s*:\s*«([^»]+)»/giu)) {
        if (/^encontr/i.test(frase.trim())) continue;
        const lista = fraseEnumera(frase);
        if (lista) errores.push(`${q} escena ${idxE + 1}: «${frase}» ${lista}`);
      }
    });
    const texto = [g.titulo, g.hook, ...(g.escenas || []).map((e) => e.texto)].join(' ');
    const m = texto.match(PROHIBIDO); if (m) errores.push(`${q}: dice «${m[0]}» (prohibido en ML)`);
    if (g.viral?.url && !urlsVirales.has(g.viral.url)) errores.push(`${q}: el viral no está en virales.json`);
    if (g.viral?.url) { if (usados.has(g.viral.url)) errores.push(`${q}: repite el viral de otro guion`); usados.add(g.viral.url); }
  });
  return { ok: errores.length === 0, errores, guiones, virales };
}

export function controlarGuiones(dir, pedido) {
  return controlarGuionesForma(dir, pedido);
}

// Receta de voz aprobada por Diego (23-Oct-2026).
export const RECETA_VOZ_APROBADA = 'tts=eleven_multilingual_v2|ajustes=C-argentina(0.31/0.63)|G-otros-paises(0.42/0.35)|una-toma-por-personaje(...)|sts=una-pasada-por-personaje|recorte=al-mezclar|cierre=toma-verificada-de-la-marca|off=una-frase-5a10-palabras-voz-de-la-marca';

// Palabras del guion que se oyen en orden (la subsecuencia común más larga).
export function coincideFlojo(a, b) {
  if (!a.length) return true;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length] / a.length >= 0.85;
}

export async function controlarClip(dir, pedido) {
  const errores = [];
  const vozMan = existsSync(join(dir, 'voz', 'manifest.json')) ? JSON.parse(readFileSync(join(dir, 'voz', 'manifest.json'), 'utf8')) : [];
  const otras = [...new Set(vozMan.map((f) => f.receta || 'sin receta'))].filter((r) => r !== RECETA_VOZ_APROBADA);
  if (otras.length) errores.push(`las voces se generaron con una receta que Diego no aprobó (${otras.join(' / ')}): volver a la aprobada o hacerle escuchar una prueba A/B antes`);
  const { transcribir, coincide, palabrasEnLetras, marcaDicha } = await import('./voces.mjs');
  const plan = leerJson(join(dir, 'anim-plan.json'), errores);
  const linea = leerJson(join(dir, 'montaje', 'linea.json'), errores);
  const itemId = pedido?.item?.id || pedido?.item_id || pedido?.producto?.id;
  const out = itemId && pedido?.id
    ? join(dir, 'entrega', `${itemId}-${pedido.id}.mp4`)
    : (() => {
        try {
          const mp4s = readdirSync(join(dir, 'entrega')).filter((f) => f.endsWith('.mp4') && !f.startsWith('_'));
          return mp4s.length ? join(dir, 'entrega', mp4s[0]) : join(dir, 'entrega', `${itemId || 'clip'}.mp4`);
        } catch { return join(dir, 'entrega', `${itemId || 'clip'}.mp4`); }
      })();
  if (!existsSync(out)) errores.push('no está el MP4 de la entrega');
  if (!existsSync(join(dir, 'montaje', 'caratula.png'))) errores.push('falta la carátula (producto + logo + pregunta) como primer cuadro');
  if (errores.length) return { ok: false, errores, temprano: true };
  const huecoMax = Math.max(0, ...linea.huecos);
  if (huecoMax > 0.8) errores.push(`hay un silencio de ${huecoMax} s entre frases; el máximo es 0,8 s (narración permanente)`);
  const mp3 = join(dir, 'entrega', '_final.mp3');
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-vn', '-ac', '1', '-b:a', '96k', mp3]);
  const oido = await transcribir(mp3);
  const esperado = plan.escenas.flatMap((e) => (e.frases || []).map((f) => f.texto)).join(' ');
  if (!coincide(esperado, oido.texto.replace(/\s+/g, ' ')) && !coincideFlojo(palabrasEnLetras(esperado), palabrasEnLetras(oido.texto)))
    errores.push(`el audio final no dice el guion: se oye «${oido.texto.trim().slice(0, 300)}»`);
  const st = spawnSync('ffmpeg', ['-i', out, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const lufs = +((st.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop() || '').replace(/[^-\d.]/g, '');
  if (!(Math.abs(lufs + 14) <= 0.5)) errores.push(`volumen ${lufs} LUFS; tiene que ser -14 ± 0,5`);
  const d = +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout.trim();
  if (d > 60) errores.push(`dura ${d.toFixed(1)} s; un clip de ML va hasta 60 s`);
  if ((plan.escenas || []).length === 6) { const c = d - 4.7; if (c < 12 || c > 18.5) errores.push(`el contenido dura ${c.toFixed(1)} s sin carátula ni cierre; con 6 escenas va de 12 a 18 s (acortar o alargar frases)`); }
  try {
    const W = JSON.parse(readFileSync(join(dir, 'montaje', 'edicion', 'words.json'), 'utf8'));
    const vozSola = join(dir, 'montaje', 'voz.wav');
    let oidoSub = oido, reloj;
    if (existsSync(vozSola)) {
      const vmp3 = join(dir, 'entrega', '_voz.mp3');
      spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', vozSola, '-ac', '1', '-ar', '16000', '-b:a', '64k', vmp3]);
      try { oidoSub = await transcribir(vmp3); reloj = (t) => t; } catch { oidoSub = oido; }
    }
    if (!reloj) { const v = linea.reel / Math.max(0.1, d - 0.6 - (linea.outro || 4.1)); reloj = (t) => (v > 0.9 && v < 1.5 ? 0.6 + t / v : 0.6 + t); }
    const norma = (t) => palabrasEnLetras(String(t)).join('');
    let j = 0, peor = null;
    for (let iw = 0; iw < W.length; iw++) {
      const w = W[iw];
      const k = (oidoSub.palabras || []).findIndex((o, i) => i >= j && i < j + 4 && norma(o.t) === norma(w.t));
      if (k < 0) continue;
      j = k + 1;
      const adelanto = oidoSub.palabras[k].s - reloj(w.s) - (iw < 2 ? 0.4 : 0);
      if (adelanto > 0.5) {
        const sig = W[iw + 1];
        const conf = sig && (oidoSub.palabras || []).slice(k + 1, k + 3).some((o) => norma(o.t) === norma(sig.t));
        if (!conf) continue;
      }
      if (!peor || adelanto > peor.adelanto) peor = { palabra: w.t, adelanto, en: reloj(w.s) };
    }
    if (peor && peor.adelanto > 0.5) errores.push(`subtítulo adelantado: «${peor.palabra}» aparece en ${peor.en.toFixed(2)} s y se dice ${peor.adelanto.toFixed(2)} s después (D008)`);
  } catch { /* sin words.json no se mide */ }
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-vf', `fps=8/${d.toFixed(2)},scale=240:-1,tile=8x1`, '-frames:v', '1', join(dir, 'entrega', 'hoja-8-cuadros.jpg')]);
  const marca = marcaDicha(pedido?.esencia || {});
  const sonido = (t) => palabrasEnLetras(t).map((w) => w.replace(/ce$/, 's').replace(/v/g, 'b').replace(/k/g, 'c').replace(/z/g, 's')).join('');
  const sm = sonido(marca || ''), so = sonido(oido.texto);
  const sinVocalFinal = sm.length >= 7 && /[aeiou]$/.test(sm) && so.includes(sm.slice(0, -1));
  const cierreAprobado = pedido?.cierre_audio?.archivo && existsSync(pedido.cierre_audio.archivo);
  const planLaDice = sonido([esperado, plan.cierre_voz?.texto || ''].join(' ')).includes(sm);
  if (marca && planLaDice && !so.includes(sm) && !sinVocalFinal && !cierreAprobado)
    errores.push(`la marca «${marca}» no se oye bien dicha en el audio final`);
  writeFileSync(join(dir, 'entrega', 'controles.json'), JSON.stringify({ lufs, duracion: d, hueco_max: huecoMax, oido: oido.texto, errores }, null, 1));
  return { ok: !errores.length, errores, out, lufs, duracion: d, hueco_max: huecoMax, oido: oido.texto };
}

if (process.argv[1]?.endsWith('controles-puros.mjs')) {
  const [modo, dir = '.'] = process.argv.slice(2);
  let pedido = {};
  try { const p = JSON.parse(readFileSync(join(dir, 'pedido.json'), 'utf8')); pedido = p.pedido || p; } catch { /* */ }
  const run = async () => {
    if (modo === 'guiones') return controlarGuionesForma(dir, pedido);
    if (modo === 'clip') return controlarClip(dir, pedido);
    console.error('Uso: node controles-puros.mjs <guiones|clip> <dir>');
    process.exit(2);
  };
  run().then((r) => {
    for (const x of r.errores || []) console.log('✗', x);
    console.log(r.ok ? `✓ ${modo} OK` : `✗ ${(r.errores || []).length} fallas`);
    process.exit(r.ok ? 0 : 1);
  }).catch((e) => { console.error('ERROR', e.message); process.exit(1); });
}
