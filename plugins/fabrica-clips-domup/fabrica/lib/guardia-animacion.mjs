// Guardia del plan de animación: frena anim-plan.json ANTES de gastar créditos de Flow y de ElevenLabs.
// Cada regla viene de una falla vista en un resultado (Diego, 22-Oct-2026: «atacar en el origen lo que se ve en el resultado»):
//   - clip v1 del set de arte: «muy seco» → narración permanente, una frase por escena como mínimo;
//   - «todas las voces de Eleven Labs» → solo habla un personaje con voz_id; los chicos y los animales no hablan;
//   - placas «VERO · 32 / LA DE LAS SOLUCIONES» → solo el nombre;
//   - la voz de Flow quedó en dos escenas → el prompt pide «No music» y ninguna otra voz.
// Uso: node lib/guardia-animacion.mjs <dir>   (sale con 1 si hay fallas)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { armarPrompts } from './prompt-animacion.mjs';
import { SKILL_SCRIPTS } from './rutas.mjs';
const PREVUELO = join(SKILL_SCRIPTS, 'prevuelo.py');

const PROHIBIDO = /\b(precio|\$|promo|oferta|descuento|env[ií]o|cuotas|garant[ií]a|https?:|www\.|seguinos|seguí|instagram|tiktok|whatsapp)/i;
const FIN = /No music\. No other speech or voices: only soft room ambience\. The product stays exactly as in the first frame\. No text, no letters, no captions\.\s*$/;
const palabras = (t) => t.trim().split(/\s+/).filter(Boolean).length;
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// La frase en off cuenta, no enumera (24-Oct, máscara de zombie: «Látex, cabeza entera, con ventilación adentro» y «Giró la cara:
// un zombie realista» sonaron como palabras sueltas; Diego: «va enumerando cosas y no es un texto fluido»). Se exige una oración
// que se lea de corrido: sin «:», «;» ni punto en el medio, como mucho una coma y lo que sigue a la coma con al menos 3 palabras.
export function fraseEnumera(texto) {
  const t = texto.trim().replace(/[.!?…]+$/, '');
  if (/[:;]|\.\s|…/.test(t)) return 'corta la oración en dos («:», «;» o punto en el medio): tiene que ser UNA oración que se lea de corrido';
  const partes = t.split(',').map((s) => s.trim()).filter(Boolean);
  if (partes.length > 2) return 'enumera con comas (suena a lista de características): contalo como una oración con verbo, «Es de látex y le tapa toda la cabeza»';
  if (partes.length === 2 && palabras(partes[1]) < 3) return `termina en «, ${partes[1]}», un pedazo suelto después de la coma: integralo a la oración`;
  return null;
}

export function guardiaAnimacion(dir) {
  const malos = [];
  const leer = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  if (!existsSync(join(dir, 'anim-plan.json'))) return ['no está anim-plan.json'];
  let a, plan, pedido;
  try { armarPrompts(dir); a = leer('anim-plan.json'); plan = leer('plan.json'); pedido = leer('pedido.json'); }
  catch (e) { return [`no se pudo leer el plan: ${e.message}`]; }
  const elenco = Object.fromEntries((pedido.elenco || []).map((e) => [e.slot, e]));
  const esencia = pedido.esencia || {};
  const nunca = (esencia.nunca_decir || []).map(norm);
  const esc = a.escenas || [];

  const nCuadros = (plan.cuadros || []).length || 8;
  if (esc.length !== nCuadros) malos.push(`tiene ${esc.length} escenas: tienen que ser ${nCuadros}, una por cuadro`);
  // Sin narrador fijo (todas las marcas menos Veoquiero), hablan los personajes (27-Oct, sillas de CHAN'S: el plan cambió los
  // diálogos del guion por un off que relataba «Diego trae el pack…», «Diego la abre…»; Diego: «parece que relata lo que hace»).
  if (!pedido.estilo?.narrador_off) {
    const nombresElenco = (pedido.elenco || []).map((x) => x.nombre).filter(Boolean).map(norm);
    esc.forEach((e, i) => (e.frases || []).forEach((f) => {
      const primera = norm(String(f.texto || '').trim().split(/\s+/)[0] || '').replace(/[^a-zñ]/g, '');
      if (f.modo === 'off' && nombresElenco.includes(primera)) malos.push(`escena ${i + 1}: «${f.texto}» es un narrador que relata lo que hace ${f.texto.split(/\s+/)[0]}; en esta marca hablan los personajes (su línea del guion, a cámara o en off con su voz)`);
    }));
    try {
      const gs = JSON.parse(readFileSync(join(dir, 'guiones.json'), 'utf8'));
      const g = gs.find((x) => x.id === pedido.guion_elegido) || gs[0];
      const k = (t) => norm(String(t || '')).replace(/[^a-z0-9ñ ]/g, '').replace(/\s+/g, ' ').trim();
      const e1 = (esc[0]?.frases || []).map((f) => k(f.texto)).join(' ');
      if (g?.hook && !e1.includes(k(g.hook))) malos.push(`escena 1: no dice el gancho del guion aprobado «${g.hook}» (el vendedor eligió ese guion por su gancho)`);
    } catch { /* sin guiones.json no se controla */ }
  }
  const todas = [];
  esc.forEach((e, i) => {
    const n = i + 1, cuadro = (plan.cuadros || [])[i] || {};
    if (e.n !== n) malos.push(`escena ${i + 1}: n=${e.n}, tiene que ir en orden`);
    if (![4, 6, 8].includes(e.duracion)) malos.push(`escena ${n}: duración ${e.duracion}; Flow anima 4, 6 u 8 s`);
    if (!e.accion) malos.push(`escena ${n}: falta «accion»`);
    // Pieza sacada o guardada sin decir de qué compartimento (23-Oct: marcador sacado de la bandeja de acuarelas).
    if (/\b(takes?|picks?|pulls?|removes?|grabs?|puts?|returns?|places?) (out |up |back )?(a|an|one|the|some|two|three)? ?\w* ?(marker|crayon|pencil|brush|tube|piece|pen|color|watercolou?r)s?\b/i.test(e.accion || '') && !/\b(from|into|back in|in) the [\w ]*(row|tray|compartment|slot|section|level|base)\b/i.test(e.accion || ''))
      malos.push(`escena ${n}: alguien saca o guarda una pieza y la acción no dice de qué compartimento (según producto.md)`);
    // Objetos que caen, se tiran o se vuelcan: Flow no los hace creíbles (24-Oct, máscara de zombie: las bolsas que Vero soltaba
    // aparecían ya en el piso y no caían). La reacción va con el cuerpo (se tapa la boca, retrocede), no con objetos en el aire.
    const accionSinRespiro = (e.accion || '').replace(/\b((light|shadow|sunlight|daylight) falls|rises? and falls?|nothing (falls|drops)|(never|does not|doesn't|no \w+) (falls?|drops?))\b/gi, '');
    if (/\b(falls?|falling|drops?|dropping|releases?|releasing|throws?|throwing|toss(es|ing)?|spills?|pours?|tumbles?|slips? (out|from|off))\b/i.test(accionSinRespiro))
      malos.push(`escena ${n}: algo cae, se suelta o se tira; Flow no lo hace creíble. Reacción con el cuerpo (taparse la boca, retroceder), sin objetos en el aire`);
    if (/\b(camera|zoom|pan|push-in|music|voice|speaks?|says|audio)\b/i.test(e.accion || '')) malos.push(`escena ${n}: la acción habla de cámara, audio o voz; eso lo pone el programa (dejá solo lo que pasa)`);
    // Lint del método manual sobre el prompt FINAL (el que va a Flow): obligatorios y prohibidos de prevuelo --tipo animacion.
    const l = spawnSync('python', [PREVUELO, '--lint', e.prompt || '', '--tipo', 'animacion'], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    if (l.status !== 0) (l.stdout || l.stderr || '').trim().split('\n').filter(Boolean).forEach((x) => malos.push(`escena ${n} (prevuelo): ${x.replace(/^✗\s*/, '')}`));
    const fr = e.frases || [];
    if (!fr.length) malos.push(`escena ${n}: sin frase. La narración es permanente (Diego, 22-Oct: «muy seco»)`);
    if (fr.length > 2) malos.push(`escena ${n}: ${fr.length} frases; hasta 2 por escena`);
    // Narración de los episodios aprobados (23-Oct): una frase en off por escena, de 5 a 10 palabras, con la voz de la marca.
    const off = fr.filter((f) => f.modo === 'off');
    if (off.length > 1) malos.push(`escena ${n}: ${off.length} frases en off; una por escena (frases sueltas cortas suenan a robot)`);
    off.forEach((f) => {
      const k = palabras(f.texto || '');
      if (k < 5) malos.push(`escena ${n}: «${f.texto}» tiene ${k} palabras; la frase en off va de 5 a 10 (más corta suena a robot)`);
      const lista = fraseEnumera(f.texto || '');
      if (lista) malos.push(`escena ${n}: «${f.texto}» ${lista}`);
      if (pedido.estilo?.narrador_off && f.personaje !== pedido.estilo.narrador_off) malos.push(`escena ${n}: la voz en off es de «${f.personaje}»; en esta marca narra «${pedido.estilo.narrador_off}» (la voz de la marca)`);
    });
    const camara = fr.filter((f) => f.modo === 'camara');
    // La voz no puede durar más que el video de la escena (22-Oct, set de arte: 6,6 s de voz sobre 4 s de video = imagen
    // congelada 3 s). Medido con Melanie: ~11 letras por segundo. Tope: 10 letras por segundo de escena; si no entra, la
    // escena pide 6 u 8 s o se acorta la frase.
    const letras = fr.reduce((n, f) => n + (f.texto || '').replace(/[^\p{L}\d]/gu, '').length, 0);
    if (letras > (e.duracion || 4) * 10) malos.push(`escena ${n}: ${letras} letras de voz para ${e.duracion} s de video (máximo ${(e.duracion || 4) * 10}); acortar o pedir duracion 6 u 8`);
    if (camara.length > 1) malos.push(`escena ${n}: más de una frase a cámara`);
    // Frase a cámara + frase en off en la misma escena: la off arranca cuando termina la de cámara, y las dos tienen que entrar en el
    // video usable (~0,7 s menos que la duración). 31-Oct, Mamá Coxis 79fc7bbd: 28 + 29 letras en 6 s → 6,31 s de voz sobre 5,30 de
    // video y el montaje falló ya animado. Ritmos medidos ese día: a cámara ~8 letras/s (Flow), en off ~11 (ElevenLabs), + 0,5 s de pausa.
    if (camara.length && off.length) {
      const L = (xs) => xs.reduce((k, f) => k + (f.texto || '').replace(/[^\p{L}\d]/gu, '').length, 0);
      const est = L(camara) / 8 + L(off) / 11 + 0.5, usable = (e.duracion || 4) - 0.7;
      if (est > usable) malos.push(`escena ${n}: frase a cámara + frase en off ≈ ${est.toFixed(1)} s de voz para ${usable.toFixed(1)} s de video usable; acortar o sacar la off, o pedir duracion 8`);
    }
    fr.forEach((f) => {
      const p = elenco[f.personaje];
      if (!p) malos.push(`escena ${n}: «${f.personaje}» no está en el elenco`);
      else if (!p.voz_id) malos.push(`escena ${n}: habla ${p.nombre}, que no tiene voz de ElevenLabs (chicos y animales no hablan; lo narra un adulto)`);
      if (!['off', 'camara'].includes(f.modo)) malos.push(`escena ${n}: modo «${f.modo}», tiene que ser off o camara`);
      if (palabras(f.texto || '') > 10) malos.push(`escena ${n}: «${f.texto}» tiene ${palabras(f.texto)} palabras; hasta 10`);
      if (PROHIBIDO.test(f.texto || '')) malos.push(`escena ${n}: «${f.texto}» promete o deriva afuera (precio, envío, redes…)`);
      if (nunca.some((x) => x && norm(f.texto || '').includes(x))) malos.push(`escena ${n}: «${f.texto}» dice algo de esencia.nunca_decir`);
      if (f.modo === 'camara') {
        if (!(cuadro.personajes || []).includes(f.personaje)) malos.push(`escena ${n}: ${p?.nombre || f.personaje} habla a cámara y no está en el cuadro ${n}`);
        if (!(e.prompt || '').includes(f.texto)) malos.push(`escena ${n}: la frase a cámara «${f.texto}» no está textual en el prompt (sin eso no hay labios)`);
      }
      todas.push(f);
    });
    // ep09: Flow rechazó dos escenas por menores cuando un adulto y un chico se tocaban o se pasaban algo.
    const adulto = (cuadro.personajes || []).some((x) => /^(mujer|hombre)/.test(x)), chico = (cuadro.personajes || []).some((x) => /^(nina|nino)/.test(x));
    if (adulto && chico && /\b(hands? (it|the|her|him)|passes|gives|handing|hugs?|kiss|touch(es|ing)?|holds? (her|his) hand|on (her|his) shoulder|strok(es|ing) (her|his) (hair|head|back|cheek))/i.test(e.prompt || ''))
      malos.push(`escena ${n}: adulto y chico con contacto o pase de objetos en el prompt; Flow la rechaza (ep09)`);
    if (!camara.length && /\bsays\b/i.test(e.prompt || '')) malos.push(`escena ${n}: el prompt hace hablar a alguien y la escena no tiene frase a cámara`);
  });
  // El cierre de la marca va aparte y se dice sobre la placa final (ICAS 20-Oct; ep16c/d a REEL + 0,25).
  const cv = a.cierre_voz;
  const limpio = (t) => String(t || '').replace(/[.!¡¿?]/g, '').trim();
  if (esencia.cierre && (!cv || limpio(cv.texto) !== limpio(esencia.cierre))) malos.push(`falta cierre_voz con el cierre de la marca textual: «${esencia.cierre}»`);
  if (cv && !elenco[cv.personaje]?.voz_id) malos.push(`cierre_voz: «${cv.personaje}» no tiene voz de ElevenLabs`);
  if (cv && pedido.cierre_audio?.texto && limpio(cv.texto) !== limpio(pedido.cierre_audio.texto)) malos.push(`cierre_voz: tiene que ser textual la toma verificada «${pedido.cierre_audio.texto}»`);
  // Voseo (07-Oct): imperativo con pronombre pegado sin tilde en lo que va a la voz → ElevenLabs lo lee en tuteo.
  const VOSEO = /\b(encontr|sum|mir|prob|us|llev|compr|regal|pon|guard|arm|prend|abr|elegi|cambi|prepar|disfrut|aprovech)(a|e|i)(lo|la|los|las|le|les|me|te|nos)\b/i;
  [...todas, ...(cv ? [cv] : [])].forEach((f) => {
    const voz = f.decir || f.texto || '';
    // (23-Oct) La tilde del voseo ya no se exige: la receta aprobada genera el texto tal cual y usa "decir" solo si la voz sale
    // en tuteo (voces.mjs lo detecta con la transcripción). Exigirla siempre deformaba «Encontralo».
    void VOSEO; void voz;
    if (f.decir && f.decir.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() !== (f.texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())
      malos.push(`«${f.texto}»: "decir" solo puede cambiar tildes, no palabras («${f.decir}»)`);
  });
  // Carátula (Diego, 23-Oct: «te falta la primera imagen… con el producto, el logo y la pregunta»).
  const car = a.caratula;
  if (!car) malos.push('falta la carátula (cuadro, pregunta, foto y nombre)');
  else {
    const q = String(car.pregunta || '');
    if (!/^¿/.test(q) || !/\?$/.test(q)) malos.push(`carátula: «${q}» tiene que ser una pregunta, de ¿ a ?`);
    q.split('|').forEach((l) => { if (l.length > 14) malos.push(`carátula: el renglón «${l}» pasa de 14 letras`); });
    if (q.split('|').length > 2) malos.push('carátula: hasta 2 renglones');
    const cu = (plan.cuadros || [])[car.cuadro - 1];
    if (!cu || !cu.muestra_producto || !(cu.personajes || []).length) malos.push(`carátula: el cuadro ${car.cuadro} tiene que mostrar el producto y a los personajes`);
    if (!car.foto || !existsSync(join(dir, car.foto))) malos.push(`carátula: no está la foto «${car.foto}»`);
    if (!car.nombre || car.nombre.length > 28) malos.push('carátula: falta el nombre o pasa de 28 caracteres');
  }
  const placas = a.placas || [];
  if (placas.length > 2) malos.push(`${placas.length} placas; como máximo 2`);
  // Una placa por persona y en la escena donde aparece por primera vez (Diego, 30-Oct: «no reiteremos, estamos poniendo el
  // nombre en cualquier lado»): el nombre presenta, no decora.
  const vistas = new Set();
  placas.forEach((p) => { if (vistas.has(p.personaje)) malos.push(`placa de ${elenco[p.personaje]?.nombre || p.personaje} repetida: una sola por persona`); vistas.add(p.personaje);
    const primera = (plan.cuadros || []).findIndex((c) => (c.personajes || []).includes(p.personaje)) + 1;
    if (primera && p.escena !== primera) malos.push(`placa de ${elenco[p.personaje]?.nombre || p.personaje} en la escena ${p.escena}: va en la ${primera}, donde aparece por primera vez`); });
  placas.forEach((p) => {
    if (!elenco[p.personaje]) malos.push(`placa de «${p.personaje}»: no está en el elenco`);
    const cuadro = (plan.cuadros || [])[p.escena - 1] || {};
    if (!(cuadro.personajes || []).includes(p.personaje)) malos.push(`placa de ${elenco[p.personaje]?.nombre || p.personaje} en la escena ${p.escena}, donde no aparece`);
    if (Object.keys(p).some((k) => !['escena', 'personaje'].includes(k))) malos.push(`placa de ${p.personaje}: lleva solo escena y personaje (el nombre sale del elenco; sin edad ni rol)`);
  });
  (a.chips || []).forEach((c) => {
    if (c.big && String(c.txt).split(/<br\s*\/?>/).some((l) => l.length > 14)) malos.push(`chip «${c.txt}»: más de 14 letras por renglón`);
    if (PROHIBIDO.test(c.txt)) malos.push(`chip «${c.txt}»: promete o deriva afuera`);
  });
  if ((a.chips || []).length > 7) malos.push('más de 7 chips');
  // Capa de TEXTO del triple gancho (30-Oct, espejo de Lemirk: el plan la omitió y la frenó el revisor de sentido al final).
  { const c1 = (a.chips || []).find((c) => c.escena === 1);
    if (!c1 || !c1.big) malos.push('escena 1: falta el chip «big» del gancho (capa de texto: 3 a 7 palabras que afilan la primera frase sin repetirla)');
    else { const n = String(c1.txt).replace(/<br\s*\/?>/g, ' ').trim().split(/\s+/).length; if (n < 2 || n > 7) malos.push(`chip del gancho «${c1.txt}»: ${n} palabras; van de 3 a 7`); } }
  (a.chips || []).forEach((c) => { if (String(c.txt).replace(/<br\s*\/?>/g, ' ').length > 20) malos.push(`chip «${c.txt}»: más de 20 caracteres (ep04)`); });
  const porEscena = {}; (a.chips || []).forEach((c) => { porEscena[c.escena] = (porEscena[c.escena] || 0) + 1; });
  Object.entries(porEscena).forEach(([n, k]) => { if (k > 1) malos.push(`escena ${n}: ${k} chips; uno por escena`); });
  const conChip = new Set((a.chips || []).map((c) => c.escena));
  (a.placas || []).forEach((p) => { if (conChip.has(p.escena)) malos.push(`escena ${p.escena}: chip y placa a la vez (con el subtítulo son tres textos; uno de los dos va en otra escena)`); });
  // Efectos de misión, uno por escena (Diego, 29-Oct: «mínimo 6 efectos, 1 por escena»).
  {
    const TIPOS = { paso: ['n', 'txt'], checks: ['items'], contador: ['hasta', 'txt'], sello: ['txt'], timer: ['desde', 'txt'], brillo: ['txt'], sacudida: [], punch: [],
      flecha: ['txt'], palabra: ['txt'], barra: ['txt', 'pct'], versus: ['antes', 'despues'], reloj: ['txt'], bateria: ['txt'], marcador: ['txt', 'nota'], ondas: [] };
    const ef = a.efectos || [];
    const nEsc = (a.escenas || []).length;
    // 30-Oct (Diego: «muy poquitas las animaciones, necesito gráficas»): 2 o 3 por escena y al menos 8 tipos distintos en el clip.
    for (let n = 1; n <= nEsc; n++) { const k = ef.filter((f) => f.escena === n).length; if (k < 2 || k > 3) malos.push(`escena ${n}: ${k} efectos; van 2 o 3 por escena`); }
    const distintos = new Set(ef.map((f) => f.tipo)).size;
    if (nEsc >= 8 && distintos < 8) malos.push(`solo ${distintos} tipos de efecto distintos; al menos 8 (que no se repita la misma gráfica)`);
    const cuenta = {};
    ef.forEach((f) => {
      if (!TIPOS[f.tipo]) { malos.push(`efecto de la escena ${f.escena}: tipo «${f.tipo}» no existe (${Object.keys(TIPOS).join(', ')})`); return; }
      cuenta[f.tipo] = (cuenta[f.tipo] || 0) + 1;
      TIPOS[f.tipo].forEach((k) => { if (f[k] == null || f[k] === '' || (Array.isArray(f[k]) && !f[k].length)) malos.push(`efecto ${f.tipo} de la escena ${f.escena}: falta «${k}»`); });
      const textos = [f.txt, f.antes, f.despues, f.nota, ...(f.items || [])].filter(Boolean).join(' ');
      if (textos && PROHIBIDO.test(textos)) malos.push(`efecto ${f.tipo} de la escena ${f.escena}: promete o deriva afuera`);
      if (f.tipo === 'sello' && String(f.txt || '').length > 12) malos.push(`sello «${f.txt}»: más de 12 letras`);
      if (f.tipo === 'palabra' && String(f.txt || '').length > 12) malos.push(`palabra «${f.txt}»: más de 12 letras`);
      if (f.tipo === 'flecha' && String(f.txt || '').length > 18) malos.push(`flecha «${f.txt}»: más de 18 caracteres`);
      if (f.tipo === 'barra' && !(f.pct >= 10 && f.pct <= 100)) malos.push(`barra de la escena ${f.escena}: «pct» entre 10 y 100`);
      if (f.tipo === 'versus' && (String(f.antes).length > 18 || String(f.despues).length > 18)) malos.push(`versus de la escena ${f.escena}: hasta 18 caracteres por lado`);
      if (f.tipo === 'contador' && !(f.hasta >= 2 && f.hasta <= 9)) malos.push(`contador de la escena ${f.escena}: «hasta» entre 2 y 9`);
      if ((f.items || []).length > 3) malos.push(`checks de la escena ${f.escena}: más de 3 ítems`);
    });
    Object.entries(cuenta).forEach(([t, k]) => { if (k > 2) malos.push(`${k} efectos «${t}»: no más de 2 del mismo tipo`); });
  }
  const conAlgo = new Set([...(a.chips || []).map((c) => c.escena), ...(a.placas || []).map((p) => p.escena)]);
  const minAlgo = Math.ceil(((a.escenas || []).length || 6) * 2 / 3);
  if (conAlgo.size < minAlgo) malos.push(`solo ${conAlgo.size} escenas llevan chip o placa; al menos ${minAlgo} («el espacio vacío también trabaja»)`);
  const o = a.outro || {};
  if (!o.titulo || !(o.puntos || []).length) malos.push('falta el outro (titulo y puntos)');
  // 22-Oct, set de arte: «Marcadores, crayones y acuarelas» (32) salió cortado en el cierre; «144 piezas en un estuche rígido» (31) entró.
  (o.puntos || []).forEach((t) => { if (t.length > 38) malos.push(`outro: el punto «${t}» tiene ${t.length} caracteres; hasta 38 (el montaje achica la letra, pero más largo ya no se lee en el celular)`); });
  if ((o.puntos || []).length > 3) malos.push('outro: hasta 3 puntos');
  if ((o.eyebrow || '').length > 34) malos.push(`outro: el eyebrow «${o.eyebrow}» pasa de 34 caracteres`);
  String(o.titulo || '').split(/<br\s*\/?>/).forEach((l) => { if (l.length > 12) malos.push(`outro: el renglón del título «${l}» pasa de 12 letras; partirlo con <br>`); });
  [...(o.puntos || []), o.titulo || '', o.eyebrow || ''].forEach((t) => { if (PROHIBIDO.test(t)) malos.push(`outro «${t}»: promete o deriva afuera`); });
  return malos;
}

if (process.argv[1]?.endsWith('guardia-animacion.mjs')) {
  const m = guardiaAnimacion(process.argv[2] || '.');
  for (const x of m) console.log('✗', x);
  console.log(m.length ? `✗ ${m.length} fallas` : '✓ plan de animación OK');
  process.exit(m.length ? 1 : 0);
}
