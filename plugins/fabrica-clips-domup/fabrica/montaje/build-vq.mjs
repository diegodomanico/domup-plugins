// Copia para el programa automático de clips (22-Oct-2026): la placa sin rol no deja el renglón vacío (solo el nombre).
// VEOQUIERO (18-Oct-2026): copia de build.mjs con identidad Veoquiero: logo en tarjeta blanca con el ojo del corazon
// que PESTANEA (logo-sq-abierto/cerrado.png), placas de personaje rojas sin mira, enfasis rojo, cierre claro y fx 'punch'.
// shorts-mtl · paso 7 (v4 "mision"): 5c + carteles de PERSONAJE (presentacion tipo pelicula, ideal sobre un
// freeze-frame del corte), TIMER de cuenta regresiva estilo espias y SELLO "MISION CUMPLIDA" (caso funda 04-Oct-2026).
// Base: paso 7 (v3 "pro"): composicion HyperFrames con LOOK DE CAMARA REAL + CARTELES ligados a la voz.
// Extiende 5b (subtitulos DomUP v4 con identidad MTL, emojis con fondo blanco, posicion por escena, barra de
// progreso, logo MTL a mitad, cierre MTL) y agrega:
//   - look anti-IA: grano de pelicula animado, correccion de color suave, viñeta, dip a negro + punch en cortes
//   - carteles por escena (fx): "circulos" que se dibujan sobre puntos de la imagen, "paso" (numero grande +
//     texto), "reloj" (anillo que se llena + texto), "checks" (lista que se tilda), "contador" (cuenta 1..N + texto)
// Uso: node 5c-build-index-pro.mjs <config.json>   (ejemplo: assets/config-ejemplo-negro.json)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const C = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const W = 720, H = 1280, REEL = C.reel, OD = C.od || 4.1, DUR = +(REEL + OD).toFixed(2);
const words = JSON.parse(readFileSync(C.words, 'utf8')); // [{t,s,e}] ya con offsets del clip
const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');
const sceneOf = (t) => C.cuts.filter((c) => t >= c).length;
// CONTROLES (ep10, 18-Oct): errores que ya pasaron frenan el build en vez de llegar a Diego.
{
  const malos = [];
  // 1. Chip grande que no entra en 720 px (ep10: «¿DE QUÉ ME DISFRAZO?» cortado en los bordes): máx. 14 letras por renglón
  (C.chips || []).forEach((c) => {
    if (c.big && c.txt.split(/<br\s*\/?>/).some((l) => l.replace(/<[^>]+>/g, '').length > 14))
      malos.push(`chip grande «${c.txt}»: más de 14 letras por renglón, partirlo con <br>`);
  });
  // 2. Placa de personaje que pasa el corte de escena (ep10: VERO · NO LO RECONOCE quedó sobre la escena siguiente)
  (C.fx || []).filter((f) => f.tipo === 'personaje').forEach((f) => {
    const c = C.cuts.find((x) => x > f.t);
    if (c != null && f.t + f.d > c + 0.05) malos.push(`placa «${f.nombre}» termina en ${(f.t + f.d).toFixed(2)} y el corte es ${c}: acortar d`);
  });
  if (malos.length) { console.error('✗ CONTROLES DEL MONTAJE:\n  ' + malos.join('\n  ')); process.exit(1); }
}
const SUBS_TOP = C.subs_top || [];

// ---- subtitulos (mismo motor que 5b) ----
const blocks = []; let cur = [];
const cutAt = (t) => C.cuts.some((c) => cur.length && cur[0].s < c && t >= c);
// Un bloque se muestra entero desde su primera palabra: si la voz hace una pausa adentro, las palabras de después aparecen antes
// de decirse (29-Oct, duda D008: «y… yo que lo creía» mostró «Y YO» 0,86 s antes del «yo»). Una pausa de más de 0,3 s corta el bloque.
// Whisper suele tapar la pausa estirando la palabra anterior (ahí la «y» duró 0,99 s): una palabra que dura más que lo que dan sus
// letras (0,12 s + 0,09 s por letra) también cuenta como pausa. Y ninguna palabra sale más de 0,5 s antes de decirse (regla del revisor final).
const pausa = (t) => {
  if (!cur.length) return false;
  const p = cur[cur.length - 1];
  return t - p.e > 0.3 || t - cur[0].s > 0.5 || p.e - p.s > 0.12 + 0.09 * p.t.replace(/[^\p{L}\d]/gu, '').length + 0.3;
};
for (const w of words) {
  if (cur.length && (cur.length >= 4 || cutAt(w.s) || pausa(w.s))) { blocks.push(cur); cur = []; }
  cur.push(w);
  if (/[.?!,:]$/.test(w.t)) { blocks.push(cur); cur = []; }
  else if (cur.length >= 3 && /^(y|a|la|el|en|con|de|que|los|las)$/i.test(w.t)) { const c = cur.pop(); blocks.push(cur); cur = [c]; }
}
if (cur.length) blocks.push(cur);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const emojiFile = (em) => [...em].map((ch) => ch.codePointAt(0).toString(16)).filter((h) => h !== 'fe0f').join('-');
let wi = 0;
const B = blocks.map((b, bi) => {
  let top = b.length > 2 ? Math.ceil(b.length / 2) : b.length; const ch = (n) => b.slice(0, n).reduce((x, w) => x + w.t.length + 1, 0); while (top > 1 && ch(top) > 20) top--; if (b.length === 2 && ch(2) > 20) top = 1; // LINEAS POR LETRAS: dos palabras largas no entran en una linea
  const ws = b.map((w, j) => { const k = norm(w.t); return { id: `w${wi++}`, s: w.s, e: Math.max(w.e, w.s + 0.14), enf: !!C.enfasis[k], em: C.emojis[k] || '', t: w.t.replace(/[.,:!]+$/, ''), line: j < top ? 0 : 1 }; });
  const nx = blocks[bi + 1];
  return { id: `sb${bi}`, top: SUBS_TOP[sceneOf(b[0].s)] ?? 740, s: b[0].s, e: Math.min(REEL - 0.05, nx ? Math.min(b[b.length - 1].e + 0.25, nx[0].s) : b[b.length - 1].e + 0.4), ws };
});
const wordHtml = (w) => `<span class="w${w.enf ? ' enf' : ''}"><span class="t" id="${w.id}">${esc(w.t)}</span>${w.em ? `<img class="em" src="emoji/${emojiFile(w.em)}.svg" alt="">` : ''}</span>`;
const subsHtml = B.map((b) => `<div class="sb" id="${b.id}" style="top:${b.top - 905}px"><div class="ln">${b.ws.filter((w) => !w.line).map(wordHtml).join('')}</div>${b.ws.some((w) => w.line) ? `<div class="ln">${b.ws.filter((w) => w.line).map(wordHtml).join('')}</div>` : ''}</div>`).join('\n        ');

// ---- carteles (fx) ----
let fxHtml = '', fxCamHtml = '', fxJs = '';
(C.fx || []).forEach((f, i) => {
  const id = `fx${i}`;
  if (f.tipo === 'circulos') {
    fxCamHtml += `<svg class="fxsvg" id="${id}" viewBox="0 0 ${W} ${H}">${f.puntos.map(([x, y], j) => `<circle id="${id}c${j}" cx="${x}" cy="${y}" r="${f.r || 46}" pathLength="1"/>`).join('')}</svg>`;
    fxJs += `tl.set("#${id}",{opacity:1},${f.t});` + f.puntos.map((_, j) => `tl.fromTo("#${id}c${j}",{strokeDashoffset:1},{strokeDashoffset:0,duration:0.35,ease:"power2.out"},${f.t + j * 0.18});`).join('') + `tl.to("#${id}",{opacity:0,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'paso') {
    fxHtml += `<div class="fx paso" id="${id}" style="left:${f.x}px;top:${f.y}px"><div class="num">${f.n}</div><div class="txt"><small>PASO ${f.n}</small>${f.txt}</div></div>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0,x:-40},{opacity:1,x:0,duration:0.28,ease:"power3.out"},${f.t});tl.fromTo("#${id} .num",{scale:0.4,rotation:-20},{scale:1,rotation:0,duration:0.35,ease:"back.out(2.4)"},${f.t + 0.05});tl.to("#${id}",{opacity:0,x:-20,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'reloj') {
    fxHtml += `<div class="fx reloj" id="${id}" style="left:${f.x - 80}px;top:${f.y - 80}px"><svg viewBox="0 0 160 160"><circle class="bg" cx="80" cy="80" r="66"/><circle class="arc" id="${id}a" cx="80" cy="80" r="66" pathLength="1"/><line class="aguja" id="${id}h" x1="80" y1="80" x2="80" y2="34"/></svg><div class="lbl">${f.txt}</div></div>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.3,ease:"back.out(2)"},${f.t});tl.fromTo("#${id}a",{strokeDashoffset:1},{strokeDashoffset:0,duration:${f.llenado || 1.4},ease:"power1.inOut"},${f.t + 0.2});tl.fromTo("#${id}h",{rotation:0},{rotation:720,svgOrigin:"80 80",duration:${f.llenado || 1.4},ease:"power1.inOut"},${f.t + 0.2});tl.to("#${id}",{opacity:0,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'checks') {
    fxHtml += `<div class="fx checks" id="${id}" style="left:${f.x}px;top:${f.y}px">${f.items.map((it, j) => `<div class="ck" id="${id}i${j}"><svg viewBox="0 0 40 40"><rect x="2" y="2" width="36" height="36" rx="8"/><path id="${id}p${j}" d="M10 21 L17 28 L30 13" pathLength="1"/></svg><span>${it}</span></div>`).join('')}</div>`;
    fxJs += `tl.set("#${id}",{opacity:1},${f.t});` + f.items.map((_, j) => `tl.fromTo("#${id}i${j}",{opacity:0,x:-30},{opacity:1,x:0,duration:0.24,ease:"power2.out"},${f.t + j * 0.45});tl.fromTo("#${id}p${j}",{strokeDashoffset:1},{strokeDashoffset:0,duration:0.25,ease:"power2.out"},${f.t + j * 0.45 + 0.15});`).join('') + `tl.to("#${id}",{opacity:0,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'contador') {
    fxHtml += `<div class="fx contador" id="${id}" style="left:${f.x}px;top:${f.y}px"><div class="nums">${Array.from({ length: f.hasta }, (_, j) => `<span id="${id}n${j}">${j + 1}</span>`).join('')}</div><div class="txt">${f.txt}</div></div>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0,y:20},{opacity:1,y:0,duration:0.25,ease:"power3.out"},${f.t});` + Array.from({ length: f.hasta }, (_, j) => `tl.set("#${id}n${j}",{opacity:1},${f.t + j * 0.16});` + (j < f.hasta - 1 ? `tl.set("#${id}n${j}",{opacity:0},${f.t + (j + 1) * 0.16});` : `tl.fromTo("#${id}n${j}",{scale:1.5},{scale:1,duration:0.3,ease:"back.out(3)"},${f.t + j * 0.16});`)).join('') + `tl.to("#${id}",{opacity:0,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'menu') {
    const Q = [[0, 0], [360, 0], [0, 640], [360, 640]];
    fxHtml += `<div class="menu" id="${id}">${f.imgs.map((src, j) => `<div class="mq" id="${id}q${j}" style="left:${Q[j][0]}px;top:${Q[j][1]}px"><img src="${src}" alt=""><div class="mdim" id="${id}d${j}"></div><div class="mlab" id="${id}l${j}">${String.fromCharCode(65 + j)} · ${f.labels[j]}</div><div class="mbox" id="${id}b${j}"></div></div>`).join('')}<svg class="mcur" id="${id}c" viewBox="0 0 40 52"><path d="M3 2 L3 42 L13 32 L20 49 L27 46 L20 30 L35 30 Z"/></svg><div class="mrip" id="${id}r"></div></div>`;
    const C = (j) => [Q[j][0] + 230, Q[j][1] + 380];
    let js = `tl.set("#${id}",{opacity:1},0);tl.fromTo(".menu .mq",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.35,stagger:0.06,ease:"power3.inOut"},${f.t});tl.fromTo("#${id}c",{opacity:0,x:${C(0)[0] + 120},y:${C(0)[1] + 200}},{opacity:1,x:${C(0)[0]},y:${C(0)[1]},duration:0.4,ease:"power2.inOut"},${f.hover[0] - 0.4});`;
    f.hover.forEach((t, j) => {
      js += `tl.to("#${id}c",{x:${C(j)[0]},y:${C(j)[1]},duration:0.28,ease:"power2.inOut"},${(t - 0.28).toFixed(2)});tl.fromTo("#${id}b${j}",{opacity:0},{opacity:1,duration:0.12},${t});tl.fromTo("#${id}l${j}",{scale:1},{scale:1.12,duration:0.15,yoyo:true,repeat:1,ease:"power2.inOut"},${t});` + (j < f.hover.length - 1 ? `tl.to("#${id}b${j}",{opacity:0,duration:0.12},${f.hover[j + 1] - 0.05});` : `tl.to("#${id}b${j}",{opacity:0,duration:0.12},${f.click - 0.3});`);
    });
    const k = f.pick, ck = C(k);
    js += `tl.to("#${id}c",{x:${ck[0]},y:${ck[1]},duration:0.3,ease:"power2.inOut"},${(f.click - 0.32).toFixed(2)});tl.set("#${id}b${k}",{opacity:1},${f.click - 0.02});tl.to("#${id}c",{scale:0.82,duration:0.07,yoyo:true,repeat:1,ease:"power2.inOut"},${f.click});tl.fromTo("#${id}r",{opacity:0.9,scale:0.2,x:${ck[0] - 60},y:${ck[1] - 60}},{opacity:0,scale:2.2,duration:0.45,ease:"power2.out"},${f.click});`;
    [0, 1, 2, 3].filter((j) => j !== k).forEach((j) => { js += `tl.to("#${id}q${j}",{opacity:0,duration:0.25,ease:"power2.inOut"},${f.click + 0.12});`; });
    js += `tl.to(["#${id}c","#${id}l${k}","#${id}b${k}"],{opacity:0,duration:0.15},${f.click + 0.12});tl.set("#${id}q${k}",{borderWidth:0,transformOrigin:"${['0% 0%', '100% 0%', '0% 100%', '100% 100%'][k]}"},${f.click + 0.1});tl.to("#${id}d${k}",{opacity:0,duration:0.2},${f.click + 0.12});tl.to("#${id}q${k}",{scale:2,duration:0.42,ease:"expo.inOut"},${f.click + 0.12});tl.set("#${id}",{opacity:0},${f.t + f.d});`;
    fxJs += js;
  } else if (f.tipo === 'marcador') {
    // placa de TV deportiva: prueba + nota que "gira" hasta el valor final
    fxHtml += `<div class="fx marcador" id="${id}" style="left:${f.x}px;top:${f.y}px"><div class="mp">${f.prueba}</div><div class="mn"><span class="ml">NOTA</span><span class="mv" id="${id}v">${f.nota}</span></div></div>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0,x:80},{opacity:1,x:0,duration:0.3,ease:"expo.inOut"},${f.t});tl.fromTo("#${id}v",{scale:0.3,opacity:0},{scale:1,opacity:1,duration:0.35,ease:"back.inOut(2.6)"},${f.t + 0.22});tl.to("#${id}",{opacity:0,x:60,duration:0.22,ease:"power2.inOut"},${f.t + f.d});`;
  } else if (f.tipo === 'tablero') {
    // tres jueces que levantan su nota de a uno + medalla
    fxHtml += `<div class="fx tablero" id="${id}" style="left:${f.x}px;top:${f.y}px"><div class="tj">${f.notas.map((n, j) => `<div class="tc" id="${id}c${j}"><small>JUEZ ${j + 1}</small>${n}</div>`).join('')}</div><div class="med" id="${id}m"><div class="mc">${f.medalla}</div></div></div>`;
    fxJs += `tl.set("#${id}",{opacity:1},${f.t});` + f.notas.map((_, j) => `tl.fromTo("#${id}c${j}",{opacity:0,y:40,rotationX:-80},{opacity:1,y:0,rotationX:0,duration:0.3,ease:"back.inOut(1.8)"},${(f.t + j * 0.22).toFixed(2)});`).join('') + `tl.fromTo("#${id}m",{opacity:0,scale:0.2,rotation:-30},{opacity:1,scale:1,rotation:0,duration:0.45,ease:"back.inOut(2.2)"},${(f.t + f.notas.length * 0.22 + 0.1).toFixed(2)});tl.to("#${id}",{opacity:0,duration:0.25,ease:"power2.inOut"},${f.t + f.d});`;
  } else if (f.tipo === 'personaje') {
    // D040 (29-Oct): la placa no se arrima al logo de la tienda (arriba a la derecha, hasta y≈234). Si comparte tiempo con el
    // logo y cae en su franja, baja debajo con aire.
    const [l0, l1] = C.logo_t || [0, 0];
    if (f.t < l1 && f.t + f.d > l0 && f.y < 270 && f.x + 340 > W - 230) f.y = 270;
    fxCamHtml += `<svg class="fxsvg mira" id="${id}m" viewBox="0 0 ${W} ${H}"><g transform="translate(${f.px},${f.py})"><path d="M-110 -60 v-50 h50 M60 -110 h50 v50 M110 60 v50 h-50 M-60 110 h-50 v-50"/></g></svg>`;
    fxHtml += `<div class="fx personaje" id="${id}" style="left:${f.x}px;top:${f.y}px">${f.rol ? `<div class="rol">${f.rol}</div>` : ''}<div class="nom">${f.nombre}</div><div class="bar"></div></div>`;
    fxJs += `tl.fromTo("#${id}m",{opacity:0,scale:1.6,transformOrigin:"${f.px}px ${f.py}px"},{opacity:1,scale:1,duration:0.3,ease:"expo.inOut"},${f.t});tl.fromTo("#${id}",{opacity:0,x:-60},{opacity:1,x:0,duration:0.32,ease:"expo.inOut"},${f.t + 0.08});tl.fromTo("#${id} .bar",{scaleX:0},{scaleX:1,duration:0.4,ease:"power3.inOut"},${f.t + 0.2});tl.fromTo("#${id} .nom",{scaleX:1.5,transformOrigin:"0% 50%"},{scaleX:1,duration:0.5,ease:"power3.inOut"},${f.t + 0.08});tl.to(["#${id}","#${id}m"],{opacity:0,duration:0.22,ease:"power2.inOut"},${f.t + f.d});`;
  } else if (f.tipo === 'punch') {
    fxJs += `tl.to("#cam",{scale:${f.s || 1.22},transformOrigin:"${f.ox || 50}% ${f.oy || 45}%",duration:0.28,ease:"power2.out"},${f.t});tl.to("#cam",{scale:1.03,duration:0.3,ease:"power2.inOut"},${f.t + f.d});`;
  } else if (f.tipo === 'pantalla') {
    // caritas pixeladas sobre la pantalla negra del producto (Flow deforma pantallas: se dibujan aca). Va en la capa de camara.
    const PAT = {
      ojos: ['.OOO...OOO.', 'O...O.O...O', 'O.O.O.O.O.O', 'O.O.O.O.O.O', 'O...O.O...O', '.OOO...OOO.'],
      cerrados: ['...........', '...........', '...........', 'OOOOO.OOOOO', '...........', '...........'],
      z: ['OOOOOOO', '.....O.', '....O..', '...O...', '..O....', '.O.....', 'OOOOOOO'],
      corazon: ['.OO.OO.', 'OOOOOOO', 'OOOOOOO', '.OOOOO.', '..OOO..', '...O...'],
    };
    const grupo = (k, cls) => { const P = PAT[k], cols = P[0].length, rows = P.length, gw = f.r * 1.15, cell = gw / cols, x0 = f.cx - gw / 2, y0 = f.cy - cell * rows / 2;
      let r = ''; P.forEach((row, yy) => [...row].forEach((c, xx) => { if (c === 'O') r += `<rect x="${(x0 + xx * cell + cell * 0.08).toFixed(1)}" y="${(y0 + yy * cell + cell * 0.08).toFixed(1)}" width="${(cell * 0.84).toFixed(1)}" height="${(cell * 0.84).toFixed(1)}" rx="${(cell * 0.18).toFixed(1)}"/>`; }));
      return `<g class="${cls}">${r}</g>`; };
    const caras = f.cara === 'ojos' ? grupo('ojos', 'abierto') + grupo('cerrados', 'cerrado') : grupo(f.cara, 'abierto');
    fxCamHtml += `<svg class="fxsvg pantalla" id="${id}" viewBox="0 0 ${W} ${H}">${caras}</svg>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.18},${f.t});tl.set("#${id} .cerrado",{opacity:0},0);`;
    if (f.cara === 'ojos') (f.parpadeos || []).forEach((tp) => { fxJs += `tl.set("#${id} .abierto",{opacity:0},${tp});tl.set("#${id} .cerrado",{opacity:1},${tp});tl.set("#${id} .abierto",{opacity:1},${tp + 0.14});tl.set("#${id} .cerrado",{opacity:0},${tp + 0.14});`; });
    if (f.cara === 'z') fxJs += `tl.fromTo("#${id} .abierto",{scale:0.85,transformOrigin:"${f.cx}px ${f.cy}px"},{scale:1.05,duration:0.9,yoyo:true,repeat:3,ease:"sine.inOut"},${f.t});`;
    fxJs += `tl.to("#${id}",{opacity:0,duration:0.15},${f.t + f.d});`;
  } else if (f.tipo === 'contadorgrande') {
    // numero grande que corre en el espacio vacio (p.ej. el rojo arriba de la cabeza en el confesionario)
    const vals = f.valores;
    fxHtml += `<div class="fx contg" id="${id}" style="top:${f.y}px"><div class="cl">${f.txt}</div><div class="cn">${vals.map((v, j) => `<span id="${id}v${j}">${v}</span>`).join('')}</div></div>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0,y:-30},{opacity:1,y:0,duration:0.3,ease:"back.out(2)"},${f.t});` + vals.map((_, j) => { const tj = f.t + 0.25 + j * (f.paso || 0.12); return `tl.set("#${id}v${j}",{opacity:1},${tj.toFixed(3)});` + (j < vals.length - 1 ? `tl.set("#${id}v${j}",{opacity:0},${(tj + (f.paso || 0.12)).toFixed(3)});` : `tl.fromTo("#${id}v${j}",{scale:1.6},{scale:1,duration:0.35,ease:"back.out(3)"},${tj.toFixed(3)});`); }).join('') + `tl.to("#${id}",{opacity:0,y:-20,duration:0.25},${f.t + f.d});`;
  } else if (f.tipo === 'sacudida') {
    // lineas de movimiento a los dos lados de un objeto que se sacude (capa de camara)
    const a = (sg) => [0, 1, 2].map((k) => `<path d="M${f.x + sg * (f.r + 14 + k * 16)} ${f.y - 40 + k * 4} Q${f.x + sg * (f.r + 30 + k * 16)} ${f.y} ${f.x + sg * (f.r + 14 + k * 16)} ${f.y + 40 - k * 4}"/>`).join('');
    fxCamHtml += `<svg class="fxsvg sacud" id="${id}" viewBox="0 0 ${W} ${H}">${a(-1)}${a(1)}</svg>`;
    fxJs += [0, 1, 2].map((k) => `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.08},${(f.t + k * 0.4).toFixed(2)});tl.to("#${id}",{opacity:0,duration:0.15},${(f.t + k * 0.4 + 0.22).toFixed(2)});`).join('');
  } else if (f.tipo === 'ondas') {
    // ondas que salen de un punto: ruido (rojo, quebradas) o sonido limpio (blancas). Capa de camara.
    const n = f.n || 3, col = f.ruido ? '#ff3b3b' : '#fff';
    const arco = (k) => { const r = (f.r || 40) + k * 26; if (!f.ruido) return `<circle class="on" cx="${f.x}" cy="${f.y}" r="${r}" stroke="${col}"/>`;
      let d = ''; for (let a = 0; a <= 360; a += 15) { const rr = r + (a / 15 % 2 ? 9 : -9), ang = a * Math.PI / 180; d += `${a ? 'L' : 'M'}${(f.x + rr * Math.cos(ang)).toFixed(1)} ${(f.y + rr * Math.sin(ang)).toFixed(1)} `; }
      return `<path class="on" d="${d}Z" stroke="${col}"/>`; };
    fxCamHtml += `<svg class="fxsvg ondas" id="${id}" viewBox="0 0 ${W} ${H}">${Array.from({ length: n }, (_, k) => `<g id="${id}k${k}">${arco(k)}</g>`).join('')}</svg>`;
    fxJs += `tl.set("#${id}",{opacity:1},${f.t});` + Array.from({ length: n }, (_, k) => `tl.fromTo("#${id}k${k}",{opacity:0,scale:0.6,transformOrigin:"${f.x}px ${f.y}px"},{opacity:1,scale:1.15,duration:0.55,ease:"power2.out",repeat:${Math.max(0, Math.floor((f.d - 0.6) / 0.7))},repeatDelay:0.15},${(f.t + k * 0.18).toFixed(2)});`).join('') + `tl.to("#${id}",{opacity:0,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'viento') {
    // lineas de viento que cruzan hacia un objeto. Capa de camara.
    const L = [0, 1, 2, 3].map((k) => { const y = f.y - 60 + k * 40; return `<path id="${id}l${k}" d="M${f.x - 260} ${y} Q${f.x - 160} ${y - 18} ${f.x - 70} ${y} T${f.x + 40} ${y - 6}"/>`; }).join('');
    fxCamHtml += `<svg class="fxsvg viento" id="${id}" viewBox="0 0 ${W} ${H}">${L}</svg>`;
    fxJs += `tl.set("#${id}",{opacity:1},${f.t});` + [0, 1, 2, 3].map((k) => `tl.fromTo("#${id}l${k}",{x:-120,opacity:0},{x:60,opacity:1,duration:0.5,ease:"power1.in",repeat:${Math.max(0, Math.floor((f.d - 0.5) / 0.7))},repeatDelay:0.2},${(f.t + k * 0.12).toFixed(2)});`).join('') + `tl.to("#${id}",{opacity:0,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'lcd') {
    // pantalla LCD del producto dibujada encima de la real (Flow deforma pantallas): tiempo y calorias que corren. Capa de camara.
    const n = f.pasos || 8, t0 = f.desde || 0, c0 = f.cal || 0;
    const fila = (j) => `<div class="lr" id="${id}r${j}"><span>TIME</span><b>${String(Math.floor((t0 + j * 7) / 60)).padStart(2, '0')}:${String((t0 + j * 7) % 60).padStart(2, '0')}</b><span>CAL</span><b>${(c0 + j * 0.6).toFixed(1)}</b></div>`;
    fxCamHtml += `<div class="lcd" id="${id}" style="left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px">${Array.from({ length: n }, (_, j) => fila(j)).join('')}</div>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.15},${f.t});` + Array.from({ length: n }, (_, j) => { const tj = f.t + j * (f.d / n); return `tl.set("#${id}r${j}",{opacity:1},${tj.toFixed(3)});` + (j < n - 1 ? `tl.set("#${id}r${j}",{opacity:0},${(tj + f.d / n).toFixed(3)});` : ''); }).join('') + `tl.to("#${id}",{opacity:0,duration:0.15},${f.t + f.d});`;
  } else if (f.tipo === 'bateria') {
    fxHtml += `<div class="fx bateria" id="${id}" style="left:${f.x}px;top:${f.y}px"><div class="bcaja"><div class="bfill" id="${id}f"></div></div><div class="bpunta"></div><div class="blbl">${f.txt}</div></div>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.3,ease:"back.out(2)"},${f.t});tl.fromTo("#${id}f",{scaleX:0.08},{scaleX:1,duration:${f.llenado || 1.6},ease:"power1.inOut"},${f.t + 0.2});tl.to("#${id}",{opacity:0,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'brillo') {
    fxHtml += `<div class="fx brillo" id="${id}" style="left:${f.x}px;top:${f.y}px"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="8"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((g) => `<line x1="20" y1="4" x2="20" y2="9" transform="rotate(${g} 20 20)"/>`).join('')}</svg><div class="brail"><div class="bnivel" id="${id}n"></div></div><div class="blbl">${f.txt}</div></div>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0,x:-30},{opacity:1,x:0,duration:0.3,ease:"power3.out"},${f.t});tl.fromTo("#${id}n",{scaleX:0.15},{scaleX:0.9,duration:1.2,ease:"power2.inOut"},${f.t + 0.25});tl.to("#${id}",{opacity:0,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'timer') {
    const n = f.desde;
    fxHtml += `<div class="fx timer" id="${id}" style="left:${f.x}px;top:${f.y}px"><small>${f.txt || 'MISIÓN EN CURSO'}</small><div class="dig">${Array.from({ length: n + 1 }, (_, j) => `<span id="${id}d${j}">00:${String(n - j).padStart(2, '0')}</span>`).join('')}</div></div>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0,y:-16},{opacity:1,y:0,duration:0.3,ease:"power3.inOut"},${f.t});` + Array.from({ length: n + 1 }, (_, j) => `tl.set("#${id}d${j}",{opacity:1},${(f.t + j * f.paso).toFixed(3)});` + (j < n ? `tl.set("#${id}d${j}",{opacity:0},${(f.t + (j + 1) * f.paso).toFixed(3)});` : '')).join('') + `tl.to("#${id}",{opacity:0,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'flecha') {
    // rótulo con flecha hacia el centro del cuadro, donde suele estar el producto (30-Oct)
    const izq = f.x < 300;
    fxHtml += `<div class="fx flecha${izq ? '' : ' der'}" id="${id}" style="left:${f.x}px;top:${f.y}px"><div class="ftxt">${f.txt}</div><svg viewBox="0 0 120 60" class="fsvg"><path id="${id}p" d="${izq ? 'M4 30 Q60 4 112 30' : 'M116 30 Q60 4 8 30'}" pathLength="1"/><path class="fpunta" id="${id}h" d="${izq ? 'M98 18 L114 30 L98 42' : 'M22 18 L6 30 L22 42'}"/></svg></div>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0,y:12},{opacity:1,y:0,duration:0.22,ease:"back.out(2)"},${f.t});tl.fromTo("#${id}p",{strokeDashoffset:1},{strokeDashoffset:0,duration:0.35,ease:"power2.out"},${f.t + 0.12});tl.fromTo("#${id}h",{opacity:0},{opacity:1,duration:0.1},${f.t + 0.42});tl.to("#${id}",{opacity:0,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'palabra') {
    fxHtml += `<div class="fx palabra" id="${id}" style="left:${f.x}px;top:${f.y}px">${f.txt}</div>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0,scale:1.5,rotation:-4},{opacity:1,scale:1,rotation:-2,duration:0.2,ease:"power4.in"},${f.t});tl.fromTo("#cam",{y:0},{y:10,duration:0.05,yoyo:true,repeat:5,ease:"sine.inOut"},${f.t + 0.2});tl.to("#${id}",{opacity:0,scale:0.9,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'barra') {
    fxHtml += `<div class="fx barra" id="${id}" style="left:${f.x}px;top:${f.y}px"><div class="btxt"><span>${f.txt}</span><b>${f.pct}%</b></div><div class="bt"><div class="bf" id="${id}f"></div></div></div>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0,x:-30},{opacity:1,x:0,duration:0.25,ease:"power3.out"},${f.t});tl.fromTo("#${id}f",{scaleX:0},{scaleX:${(f.pct / 100).toFixed(2)},duration:1.0,ease:"power2.inOut"},${f.t + 0.2});tl.to("#${id}",{opacity:0,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'versus') {
    fxHtml += `<div class="fx versus" id="${id}" style="left:${f.x}px;top:${f.y}px"><div class="va" id="${id}a">✗ ${f.antes}</div><div class="vd" id="${id}b">✓ ${f.despues}</div></div>`;
    fxJs += `tl.set("#${id}",{opacity:1},${f.t});tl.fromTo("#${id}a",{opacity:0,x:-40},{opacity:1,x:0,duration:0.22},${f.t});tl.to("#${id}a",{opacity:0.5,duration:0.2},${f.t + 0.7});tl.fromTo("#${id}b",{opacity:0,scale:1.6},{opacity:1,scale:1,duration:0.25,ease:"back.out(2.2)"},${f.t + 0.6});tl.to("#${id}",{opacity:0,duration:0.2},${f.t + f.d});`;
  } else if (f.tipo === 'sello') {
    fxHtml += `<div class="fx sello" id="${id}" style="left:${f.x}px;top:${f.y}px">${f.txt}</div>`;
    fxJs += `tl.fromTo("#${id}",{opacity:0,scale:1.6,rotation:-14},{opacity:1,scale:1,rotation:-6,duration:0.22,ease:"power4.in"},${f.t});tl.fromTo("#cam",{x:0},{x:8,duration:0.05,yoyo:true,repeat:5,ease:"sine.inOut"},${f.t + 0.22});tl.to("#${id}",{opacity:0,duration:0.25,ease:"power2.inOut"},${f.t + f.d});`;
  }
});
// Gráficas achicadas (30-Oct): montar.py manda «zoom» cuando a tamaño normal no entraban; se aplica al contenedor de la gráfica.
(C.fx || []).forEach((f, i) => { if (f.zoom) fxHtml = fxHtml.replace(`id="fx${i}" style="`, `id="fx${i}" style="zoom:${f.zoom};`); });
const chipHtml = (C.chips || []).map((c, i) => `<div class="chip${c.big ? ' big' : ''}${c.small ? ' small' : ''}" id="chip${i}"${c.top != null ? ` style="top:${c.top}px"` : ''}>${c.txt}</div>`).join('\n      ');
const O = C.outro;
// Cierre con emoción (29-Oct) y repertorio de animaciones del logo: cada marca elige una (marca.json → logo_anim).
const CI = C.cierre && (C.cierre.palabras || []).length ? C.cierre : null;
// Repertorio v2 del logo (Diego, 29-Oct: «las animaciones son muy muy básicas»; mockup aprobado
// https://claude.ai/artifact/5S9uXoorEz6ugMvMuR31Ty). Capas en #c2fx (anillos, chispas, trazo) y #c2bars (cortinas), con los
// colores de la marca. T = momento en que entra el logo.
const T0 = 'OS + 0.2';
const DOTS = Array.from({ length: 16 }, (_, i) => i);
const dotsRadial = (t, r) => DOTS.map((i) => { const a = (i / 16) * Math.PI * 2 + 0.2; return `tl.fromTo("#c2d${i}",{x:0,y:0,opacity:1,scale:1},{x:${(Math.cos(a) * r).toFixed(0)},y:${(Math.sin(a) * r * 0.65).toFixed(0)},opacity:0,scale:0.3,duration:0.65,ease:"power2.out"},${t});`; }).join('');
const anillos = (t) => [0, 1, 2].map((i) => `tl.fromTo("#c2r${i}",{scale:0.2,opacity:0.95},{scale:4.2,opacity:0,duration:0.9,ease:"power2.out"},${t} + ${(0.05 + i * 0.16).toFixed(2)});`).join('');
const LOGO_V2 = {
  ondas: anillos(T0) + `tl.fromTo("#c2logo",{opacity:0,scale:0},{opacity:1,scale:1,duration:0.9,ease:"elastic.out(1, 0.45)"},${T0} + 0.1);`,
  foco: `tl.fromTo("#c2logo",{opacity:0,scale:2.6,filter:"blur(18px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.55,ease:"expo.out"},${T0});`
    + `tl.fromTo("#c2flash",{opacity:0},{opacity:0.85,duration:0.06},${T0} + 0.5);tl.to("#c2flash",{opacity:0,duration:0.35},${T0} + 0.56);`
    + `tl.fromTo("#c2col",{x:0},{x:5,duration:0.04,yoyo:true,repeat:5,ease:"none"},${T0} + 0.52);tl.set("#c2col",{x:0},${T0} + 0.8);`
    + `tl.fromTo("#c2r1",{scale:0.5,opacity:0.9},{scale:3.5,opacity:0,duration:0.7,ease:"power2.out"},${T0} + 0.5);`,
  carta: `tl.fromTo("#c2logo",{opacity:0,rotationY:540,rotationX:25,y:-140,scale:0.5,transformPerspective:700},{opacity:1,rotationY:0,rotationX:0,y:0,scale:1,duration:1.0,ease:"power3.out"},${T0});`
    + `tl.to("#c2logo",{scaleY:0.9,scaleX:1.06,duration:0.08,yoyo:true,repeat:1,ease:"power1.inOut"},${T0} + 0.95);`,
  sello: `tl.fromTo("#c2logo",{opacity:0,scale:3.2,rotation:-14},{opacity:1,scale:1,rotation:-3,duration:0.32,ease:"power4.in"},${T0});`
    + `tl.to("#c2logo",{rotation:0,duration:0.5,ease:"elastic.out(1, 0.4)"},${T0} + 0.32);`
    + `tl.fromTo("#c2col",{y:0},{y:7,duration:0.05,yoyo:true,repeat:5,ease:"none"},${T0} + 0.32);tl.set("#c2col",{y:0},${T0} + 0.65);` + dotsRadial(`${T0} + 0.33`, 330),
  glitch: [[0, 'inset(0% 0% 70% 0% round 30px)', -14], [0.08, 'inset(40% 0% 30% 0% round 30px)', 12], [0.16, 'inset(10% 0% 50% 0% round 30px)', -8],
    [0.24, 'inset(60% 0% 5% 0% round 30px)', 10], [0.32, 'inset(20% 0% 20% 0% round 30px)', -5], [0.42, 'inset(0% 0% 0% 0% round 30px)', 0]]
    .map(([t, cp, x]) => `tl.set("#c2logo",{opacity:1,clipPath:"${cp}",x:${x}},${T0} + ${t});`).join('')
    + `tl.fromTo("#c2logo",{scale:1},{scale:1.05,duration:0.1,yoyo:true,repeat:1},${T0} + 0.5);`,
  cortina: [0, 1, 2].map((i) => `tl.fromTo("#c2b${i}",{xPercent:-105},{xPercent:0,duration:0.32,ease:"power3.in"},${T0} + ${(i * 0.1).toFixed(2)});tl.to("#c2b${i}",{xPercent:105,duration:0.36,ease:"power3.out"},${T0} + ${(0.45 + i * 0.1).toFixed(2)});`).join('')
    + `tl.set("#c2logo",{opacity:1,scale:0.85},${T0} + 0.5);tl.to("#c2logo",{scale:1,duration:0.5,ease:"back.out(2)"},${T0} + 0.5);` + dotsRadial(`${T0} + 0.9`, 360),
  trazo: `tl.set("#c2trazo",{opacity:1},${T0});tl.fromTo("#c2trazo rect",{strokeDashoffset:1},{strokeDashoffset:0,duration:0.7,ease:"power2.inOut"},${T0});`
    + `tl.fromTo("#c2logo",{opacity:1,clipPath:"circle(0% at 50% 50%)"},{clipPath:"circle(75% at 50% 50%)",duration:0.6,ease:"power3.out"},${T0} + 0.55);`
    + `tl.to("#c2trazo",{opacity:0,duration:0.3},${T0} + 1.15);` + dotsRadial(`${T0} + 0.8`, 300),
};
const LOGO_ANIM = {
  ...LOGO_V2,
  pop: `tl.fromTo("#c2logo", { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.55, ease: "back.out(2.2)" }, OS + 0.2);`,
  barrido: `tl.set("#c2logo", { opacity: 1 }, OS + 0.2); tl.fromTo("#c2logo", { clipPath: "inset(0% 100% 0% 0% round 30px)" }, { clipPath: "inset(0% 0% 0% 0% round 30px)", duration: 0.7, ease: "power2.inOut" }, OS + 0.2);`,
  rebote: `tl.fromTo("#c2logo", { opacity: 1, y: -560 }, { opacity: 1, y: 0, duration: 0.95, ease: "bounce.out" }, OS + 0.15);`,
  giro: `tl.fromTo("#c2logo", { opacity: 0, rotationY: -110, transformPerspective: 900 }, { opacity: 1, rotationY: 0, duration: 0.8, ease: "back.out(1.4)" }, OS + 0.2);`,
  latido: `tl.fromTo("#c2logo", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power3.out" }, OS + 0.2); tl.to("#c2logo", { scale: 1.08, duration: 0.22, yoyo: true, repeat: 3, ease: "sine.inOut" }, OS + 0.6);`,
};
// Los puntos del cierre no cortan renglón: si uno es largo, se salía por la derecha (22-Oct, set de arte: «Marcadores, crayones
// y acuarelas» cortado; en la v1 ya rozaba el borde). Medido en el render: Montserrat 800 ocupa ~0,56 em por letra y el texto
// arranca en x=152; se deja 24 px de margen. La letra se achica (igual para los 3) hasta que el más largo entre.
const PT_MAX = Math.max(...O.puntos.map((p) => p.length));
// En MAYÚSCULAS cada letra ocupa ~0,68 em, no 0,56 (26-Oct, luces LED: «APP, CABLE Y CONTROL REMOTO» perdió la última O).
const ANCHO_LETRA = O.puntos.some((p) => p === p.toUpperCase()) ? 0.68 : 0.56;
const PT_SIZE = Math.min(34, Math.floor((720 - 152 - 24) / (PT_MAX * ANCHO_LETRA)));

const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      /* Identidad de la marca (Diego, 30-Oct: «los efectos están cortados y pegados del video de la misión, sin el color ni
         la esencia del vendedor»): --m1 es el color principal de la esencia y --m2 su acento; montar.py los completa
         (el #E61B1F de Veoquiero pasa a --m1). La letra de los títulos también la pone montar.py según la esencia. */
      :root { --m1: #E61B1F; --m2: #E61B1E; }
      body { font-family: "Montserrat", sans-serif; }
      #cam { position: absolute; inset: 0; transform-origin: 50% 45%; }
      #cam video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: contrast(1.06) saturate(0.9) sepia(0.06) brightness(0.99); }
      .fxsvg { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; }
      .fxsvg circle { fill: none; stroke: #fff; stroke-width: 5; stroke-dasharray: 1; stroke-dashoffset: 1; filter: drop-shadow(0 0 4px rgba(0,0,0,.7)); }
      /* look de camara real */
      #grade { position: absolute; inset: 0; z-index: 3; background: linear-gradient(160deg, rgba(255,214,170,.07), rgba(0,0,0,0) 45%, rgba(90,120,160,.06)); mix-blend-mode: soft-light; }
      #vig { position: absolute; inset: 0; z-index: 4; background: radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 55%, rgba(0,0,0,.42) 100%); }
      #grain { position: absolute; inset: -64px; z-index: 6; background: url(grano.png); opacity: .07; mix-blend-mode: overlay; }
      #dip { position: absolute; inset: 0; background: #000; opacity: 0; z-index: 7; }
      #pbar { position: absolute; left: 24px; right: 24px; top: 22px; height: 6px; border-radius: 99px; background: rgba(255,255,255,.28); z-index: 20; overflow: hidden; }
      #pbar i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; background: #E61B1F; transform-origin: 0 50%; transform: scaleX(0); }
      /* subtitulos DomUP v4 · identidad MTL */
      #subs { position: absolute; left: 24px; right: 24px; top: 905px; z-index: 16; text-align: center; }
      .sb { position: absolute; left: 0; right: 0; opacity: 0; text-align: center; }
      .sb .ln { line-height: 1.25; white-space: nowrap; }
      .sb .w { display: inline-block; margin: 0 10px; white-space: nowrap; }
      .sb .w .t { display: inline-block; font-weight: 900; font-size: 44px; text-transform: uppercase; color: #fff; -webkit-text-stroke: 10px #000; paint-order: stroke fill; padding: 0 6px; border-radius: 8px; filter: drop-shadow(0 3px 6px rgba(0,0,0,.55)); }
      .sb .w .em { display: inline-block; width: 46px; height: 46px; padding: 6px; margin-left: 10px; vertical-align: -8px; background: #fff; border-radius: 50%; box-shadow: 0 0 0 3px #000, 0 3px 8px rgba(0,0,0,.45); }
      /* carteles */
      .fx { position: absolute; z-index: 14; opacity: 0; color: #fff; }
      /* gráficas nuevas (30-Oct): flecha, palabra golpe, barra y antes/después, con los colores de la marca */
      .flecha { display: flex; align-items: center; gap: 6px; } .flecha.der { flex-direction: row-reverse; }
      .flecha .ftxt { background: var(--m1); color: #fff; font-weight: 900; font-size: 30px; padding: 10px 16px; border-radius: 10px; border-left: 6px solid var(--m2); box-shadow: 0 8px 22px rgba(0,0,0,.4); white-space: nowrap; }
      .flecha .fsvg { width: 120px; height: 60px; overflow: visible; } .flecha .fsvg path { fill: none; stroke: #fff; stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; filter: drop-shadow(0 3px 6px rgba(0,0,0,.5)); } .flecha .fsvg .fpunta { stroke-dasharray: none; }
      .palabra { width: 620px; text-align: center; font-weight: 900; font-size: 84px; line-height: 1; color: #fff; -webkit-text-stroke: 3px var(--m1); text-shadow: 0 6px 0 var(--m1), 0 12px 26px rgba(0,0,0,.55); text-transform: uppercase; }
      .barra { width: 460px; background: rgba(0,0,0,.62); border-radius: 14px; padding: 12px 16px; border: 3px solid var(--m1); box-sizing: border-box; }
      .barra .btxt { display: flex; justify-content: space-between; font-weight: 900; font-size: 28px; } .barra .bt { height: 22px; background: rgba(255,255,255,.25); border-radius: 11px; margin-top: 8px; overflow: hidden; } .barra .bf { height: 100%; background: linear-gradient(90deg, var(--m1), var(--m2)); transform-origin: left center; border-radius: 11px; }
      .versus { display: flex; flex-direction: column; gap: 10px; width: 440px; } .versus .va { background: #2b2b2b; color: #ddd; font-weight: 900; font-size: 32px; padding: 10px 16px; border-radius: 10px; text-decoration: line-through; text-decoration-color: #ff4d4d; text-decoration-thickness: 4px; } .versus .vd { background: var(--m1); color: #fff; font-weight: 900; font-size: 38px; padding: 12px 18px; border-radius: 12px; border: 3px solid var(--m2); box-shadow: 0 10px 26px rgba(0,0,0,.45); }
      .paso { display: flex; align-items: center; gap: 14px; background: var(--m1); border: 3px solid var(--m2); box-shadow: 0 10px 28px rgba(0,0,0,.4); border-radius: 18px; padding: 12px 20px 12px 12px; backdrop-filter: blur(6px); }
      .paso .num { width: 74px; height: 74px; border-radius: 50%; background: var(--m2); color: #fff; font-weight: 900; font-size: 50px; line-height: 74px; text-align: center; }
      .paso .txt { font-weight: 900; font-size: 30px; line-height: 1.05; text-transform: uppercase; white-space: nowrap; }
      .paso .txt small { display: block; font-size: 16px; letter-spacing: .2em; color: #cfcfcf; margin-bottom: 4px; }
      .reloj { width: 160px; text-align: center; }
      .reloj svg { width: 160px; height: 160px; filter: drop-shadow(0 4px 10px rgba(0,0,0,.5)); }
      .reloj .bg { fill: rgba(0,0,0,.65); stroke: rgba(255,255,255,.35); stroke-width: 8; }
      .reloj .arc { fill: none; stroke: #fff; stroke-width: 8; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; transform: rotate(-90deg); transform-origin: 80px 80px; }
      .reloj .aguja { stroke: #fff; stroke-width: 6; stroke-linecap: round; }
      .reloj .lbl { margin-top: 8px; font-weight: 900; font-size: 34px; background: var(--m1); color: #fff; border-radius: 10px; padding: 4px 10px; display: inline-block; }
      .checks { background: var(--m1); border-radius: 18px; padding: 16px 20px 6px; }
      .checks .ck { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; opacity: 0; }
      .checks svg { width: 46px; height: 46px; }
      .checks rect { fill: var(--m2); } .checks path { fill: none; stroke: #fff; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
      .checks span { font-weight: 900; font-size: 32px; text-transform: uppercase; -webkit-text-stroke: 8px #000; paint-order: stroke fill; }
      .contador { text-align: center; }
      .contador .nums { position: relative; width: 150px; height: 130px; margin: 0 auto; }
      .contador .nums span { position: absolute; inset: 0; opacity: 0; font-weight: 900; font-size: 130px; line-height: 130px; -webkit-text-stroke: 12px #000; paint-order: stroke fill; }
      .contador .txt { font-weight: 900; font-size: 34px; background: var(--m1); color: #fff; border-radius: 10px; padding: 4px 14px; display: inline-block; }
      .menu { position: absolute; inset: 0; z-index: 15; opacity: 0; background: #fff; }
      .menu .mq { position: absolute; width: 360px; height: 640px; overflow: hidden; border: 3px solid #fff; }
      .menu .mq img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .menu .mdim { position: absolute; inset: 0; background: rgba(0,0,0,.12); }
      .menu .mlab { position: absolute; left: 14px; bottom: 18px; background: #fff; color: #000; font-weight: 900; font-size: 26px; padding: 6px 12px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,.4); transform-origin: 0% 100%; white-space: nowrap; }
      .menu .mbox { position: absolute; inset: 0; border: 8px solid #fff; box-shadow: inset 0 0 0 4px #000; opacity: 0; }
      .menu .mcur { position: absolute; left: 0; top: 0; width: 46px; height: 60px; opacity: 0; filter: drop-shadow(0 3px 6px rgba(0,0,0,.6)); z-index: 3; transform-origin: 10% 5%; }
      .menu .mcur path { fill: #fff; stroke: #000; stroke-width: 3; stroke-linejoin: round; }
      .menu .mrip { position: absolute; left: 0; top: 0; width: 120px; height: 120px; border-radius: 50%; border: 6px solid #fff; opacity: 0; z-index: 2; }
      .marcador { display: flex; align-items: stretch; border-radius: 10px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,.45); }
      .marcador .mp { background: #000; color: #fff; font-weight: 900; font-size: 26px; padding: 12px 16px; line-height: 1.05; text-transform: uppercase; display: flex; align-items: center; }
      .marcador .mn { background: #fff; color: #000; padding: 6px 16px; text-align: center; min-width: 120px; }
      .marcador .ml { display: block; font-weight: 800; font-size: 14px; letter-spacing: .2em; color: #555; }
      .marcador .mv { display: inline-block; font-weight: 900; font-size: 48px; line-height: 1; }
      .tablero { display: flex; align-items: center; gap: 14px; perspective: 600px; }
      .tablero .tj { display: flex; gap: 12px; }
      .tablero .tc { width: 100px; background: #fff; color: #000; border-radius: 12px; font-weight: 900; font-size: 52px; line-height: 1; padding: 8px 0 12px; text-align: center; box-shadow: 0 8px 22px rgba(0,0,0,.5); }
      .tablero .tc small { display: block; font-size: 15px; letter-spacing: .18em; color: #555; margin-bottom: 4px; }
      .tablero .med { width: 120px; height: 120px; flex: none; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff6c8, #f2c94c 45%, #b8860b 100%); border: 6px solid #fff; box-shadow: 0 10px 26px rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; }
      .tablero .mc { font-weight: 900; font-size: 32px; color: #5a3d00; letter-spacing: .06em; }
      .mira path { fill: none; stroke: #fff; stroke-width: 6; filter: drop-shadow(0 0 4px rgba(0,0,0,.8)); }
      .personaje { background: #E61B1F; color: #fff; padding: 14px 26px 16px; border-radius: 6px; box-shadow: 0 10px 30px rgba(0,0,0,.45); }
      .personaje .rol { font-weight: 800; font-size: 20px; letter-spacing: .22em; color: rgba(255,255,255,.88); }
      .personaje .nom { font-weight: 900; font-size: 60px; line-height: 1.1; margin-top: 8px; letter-spacing: .06em; }
      .personaje .bar { height: 6px; background: #fff; margin-top: 8px; transform-origin: 0 50%; }
      .timer { background: var(--m1); border: 3px solid var(--m2); border-radius: 10px; padding: 6px 14px 8px; text-align: center; }
      .timer small { display: block; font-weight: 800; font-size: 14px; letter-spacing: .2em; color: #ddd; }
      .timer .dig { position: relative; width: 190px; height: 56px; margin-top: 6px; font-family: "Courier New", monospace; font-weight: 900; font-size: 46px; line-height: 50px; }
      .timer .dig span { position: absolute; inset: 0; opacity: 0; }
      .sello { font-weight: 900; font-size: 64px; line-height: 1.0; text-align: center; color: #fff; border: 8px solid var(--m2); border-radius: 14px; padding: 12px 22px; background: var(--m1); text-shadow: 0 3px 10px rgba(0,0,0,.6); box-shadow: 0 0 0 4px rgba(0,0,0,.5); white-space: nowrap; }
      .pantalla rect { fill: #f4fbff; filter: drop-shadow(0 0 4px rgba(200,235,255,.9)); }
      .ondas .on { fill: none; stroke-width: 5; stroke-dasharray: none; stroke-dashoffset: 0; filter: drop-shadow(0 0 4px rgba(0,0,0,.7)); }
      .viento path { fill: none; stroke: #fff; stroke-width: 5; stroke-linecap: round; opacity: .9; filter: drop-shadow(0 0 3px rgba(0,0,0,.6)); }
      .lcd { position: absolute; opacity: 0; background: #b9c4a8; border-radius: 6px; box-shadow: inset 0 0 6px rgba(0,0,0,.35); overflow: hidden; }
      .lcd .lr { position: absolute; inset: 0; opacity: 0; display: grid; grid-template-columns: auto 1fr; align-items: center; padding: 4px 8px; column-gap: 6px; color: #1e2a1a; font-family: 'Courier New', monospace; }
      .lcd .lr span { font-size: 11px; font-weight: 700; } .lcd .lr b { font-size: 24px; text-align: right; line-height: 1; }
      .sacud path { fill: none; stroke: #fff; stroke-width: 5; stroke-linecap: round; filter: drop-shadow(0 0 3px rgba(0,0,0,.6)); }
      .contg { left: 0; right: 0; text-align: center; color: #fff; }
      .contg .cl { font-weight: 800; font-size: 26px; letter-spacing: .14em; text-shadow: 0 2px 8px rgba(0,0,0,.45); }
      .contg .cn { position: relative; height: 120px; }
      .contg .cn span { position: absolute; left: 0; right: 0; opacity: 0; font-weight: 900; font-size: 112px; line-height: 120px; text-shadow: 0 6px 18px rgba(0,0,0,.45); }
      .bateria { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; width: 300px; }
      .bateria .bcaja { width: 150px; height: 70px; border: 6px solid #fff; border-radius: 14px; padding: 6px; background: rgba(0,0,0,.35); }
      .bateria .bfill { height: 100%; background: #6be38f; border-radius: 6px; transform-origin: 0 50%; }
      .bateria .bpunta { width: 12px; height: 28px; background: #fff; border-radius: 0 5px 5px 0; }
      .bateria .blbl, .brillo .blbl { flex-basis: 100%; margin-top: 10px; font-weight: 900; font-size: 30px; -webkit-text-stroke: 8px #000; paint-order: stroke fill; color: #fff; }
      .brillo { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; width: 340px; }
      .brillo svg { width: 54px; height: 54px; } .brillo circle { fill: #ffd98a; } .brillo line { stroke: #ffd98a; stroke-width: 3; stroke-linecap: round; }
      .brillo .brail { width: 220px; height: 16px; border-radius: 99px; background: rgba(255,255,255,.3); overflow: hidden; }
      .brillo .bnivel { height: 100%; width: 100%; background: #ffd98a; transform-origin: 0 50%; }
      .chip { position: absolute; left: 50%; top: 790px; transform: translateX(-50%); opacity: 0; z-index: 10; white-space: nowrap; font-weight: 900; font-size: 34px; color: var(--m1); background: #fff; padding: 8px 20px; border-radius: 6px; border-left: 8px solid var(--m2); }
      .chip.small { font-size: 20px; padding: 5px 12px; letter-spacing: .06em; background: rgba(255,255,255,.92); }
      .chip.big { top: 150px; font-size: 58px; line-height: 1.05; text-align: center; color: #fff; background: var(--m1); border: 3px solid var(--m2); border-radius: 14px; padding: 18px 30px; }
      #logo { position: absolute; right: 26px; top: 48px; width: 176px; height: 186px; opacity: 0; z-index: 12; background: #fff; border-radius: 24px; box-shadow: 0 6px 18px rgba(0,0,0,.35); }
      #logo img, .o-logo .ov { position: absolute; left: 8px; top: 8px; width: 160px; height: 170px; }
      .cerr { opacity: 0; }
      .mira { display: none; }
      /* cierre MTL */
      #outro { position: absolute; inset: 0; z-index: 70; opacity: 0; overflow: hidden; color: #fff; text-align: center; background: radial-gradient(900px 900px at 50% 24%, #ffffff 0%, #fff6f6 55%, #fde3e3 100%); color: #1a1a1a; }
      .o-grid { display: none; position: absolute; left: -360px; top: 820px; width: 1440px; height: 800px; opacity: .35; background-image: repeating-linear-gradient(90deg, rgba(255,255,255,.35) 0 1px, transparent 1px 48px), repeating-linear-gradient(0deg, rgba(255,255,255,.3) 0 1px, transparent 1px 56px); transform: perspective(420px) rotateX(62deg); transform-origin: 50% 0%; -webkit-mask-image: linear-gradient(to bottom, black, transparent 85%); }
      .o-logo { position: absolute; left: 360px; top: 280px; width: 0; height: 0; }
      .o-ring { position: absolute; left: 50%; top: 50%; border-radius: 50%; border: 4px solid transparent; }
      .o-ring.r1 { width: 230px; height: 230px; margin: -115px 0 0 -115px; border-top-color: #E61B1F; border-right-color: #E61B1F; }
      .o-ring.r2 { width: 270px; height: 270px; margin: -135px 0 0 -135px; border-bottom-color: rgba(230,27,31,.55); border-left-color: rgba(230,27,31,.55); }
      .o-ring.r3 { width: 310px; height: 310px; margin: -155px 0 0 -155px; border-top-color: rgba(230,27,31,.25); border-left-color: rgba(230,27,31,.25); }
      .o-logo img { position: absolute; left: 50%; top: 50%; width: 236px; transform: translate(-50%, -50%); }
      .o-eyebrow { position: absolute; left: 0; right: 0; top: 470px; font-weight: 800; font-size: 24px; letter-spacing: .12em; color: #E61B1F; opacity: 0; }
      .o-titulo { position: absolute; left: 0; right: 0; top: 515px; font-weight: 900; font-size: 64px; line-height: 1.05; color: #1a1a1a; opacity: 0; }
      .o-pts { position: absolute; left: 90px; right: 60px; top: 700px; text-align: left; }
      .o-pt { font-weight: 800; font-size: 34px; margin-bottom: 18px; opacity: 0; white-space: nowrap; }
      .o-pt .ck { display: inline-block; width: 46px; height: 46px; line-height: 46px; text-align: center; margin-right: 16px; border: 3px solid #E61B1F; color: #E61B1F; border-radius: 8px; font-size: 30px; }
      .o-cta1 { position: absolute; left: 90px; right: 90px; top: 920px; height: 92px; line-height: 92px; opacity: 0; overflow: hidden; font-weight: 900; font-size: 40px; color: #fff; background: #E61B1F; border-radius: 14px; }
      .o-cta1 .shine { position: absolute; top: 0; bottom: 0; width: 120px; left: -160px; background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent); transform: skewX(-20deg); }
      .o-cta2 { position: absolute; left: 90px; right: 90px; top: 1030px; height: 80px; line-height: 74px; opacity: 0; font-weight: 900; font-size: 34px; color: #E61B1F; border: 3px solid #E61B1F; border-radius: 14px; }
      .o-marca { position: absolute; left: 0; right: 0; top: 1150px; font-weight: 800; font-size: 26px; letter-spacing: .12em; color: #6b6b6b; opacity: 0; }
      /* cierre con emoción (29-Oct): último cuadro congelado, frase palabra por palabra, logo grande, producto y botones */
      #c2 { position: absolute; inset: 0; z-index: 71; opacity: 0; overflow: hidden; background: #000; }
      #c2bg { position: absolute; left: -40px; top: -40px; width: 800px; height: 1360px; object-fit: cover; transform-origin: 50% 45%; }
      #c2grad { position: absolute; inset: 0; opacity: 0; background: linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,0) 30%, rgba(230,27,31,.80) 62%, rgba(230,27,31,.96) 100%); }
      /* Cierre compacto (Diego, 29-Oct: «más compacto como estaba antes») y dentro de la zona segura: logo, frase y la fila de
         producto + botones van apilados en una columna con el mismo aire entre sí; termina antes de ~880 px, donde Reels,
         Shorts y TikTok ponen sus botones. */
      #c2col { position: absolute; left: 0; right: 0; top: 96px; display: flex; flex-direction: column; align-items: center; gap: 26px; }
      #c2logo { position: relative; width: 520px; height: 270px; background: #fff; border-radius: 30px; box-shadow: 0 18px 50px rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; overflow: hidden; opacity: 0; }
      #c2logo img { max-width: 460px; max-height: 230px; object-fit: contain; }
      #c2logo .shine { position: absolute; top: -20px; bottom: -20px; width: 140px; left: -200px; background: linear-gradient(90deg, transparent, rgba(255,255,255,.85), transparent); transform: skewX(-20deg); }
      #c2fx, #c2bars { position: absolute; left: 100px; top: 96px; width: 520px; height: 270px; pointer-events: none; z-index: 3; }
      #c2bars { overflow: hidden; border-radius: 30px; } .c2bar { position: absolute; left: 0; width: 100%; height: 90px; transform: translateX(-105%); }
      #c2b0 { background: var(--m1); } #c2b1 { background: var(--m2); } #c2b2 { background: #fff; }
      .c2ring { position: absolute; left: 50%; top: 50%; width: 160px; height: 160px; margin: -80px 0 0 -80px; border: 5px solid #fff; border-radius: 50%; opacity: 0; } #c2r1 { border-color: var(--m1); }
      .c2dot { position: absolute; left: 50%; top: 50%; width: 11px; height: 11px; margin: -5px 0 0 -5px; border-radius: 50%; background: #fff; opacity: 0; } .c2dot.m { background: var(--m1); }
      #c2trazo { position: absolute; left: -4px; top: -4px; width: 528px; height: 278px; overflow: visible; opacity: 0; } #c2trazo rect { fill: none; stroke: var(--m1); stroke-width: 6; stroke-linecap: round; stroke-dasharray: 1; }
      #c2flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; z-index: 4; }
      #c2frase { width: 648px; text-align: center; font-weight: 900; font-size: 62px; line-height: 1.1; color: #fff; text-shadow: 0 4px 16px rgba(0,0,0,.45); }
      #c2frase span { display: inline-block; opacity: 0; margin: 0 0.13em; }   /* sin espacio entre spans: margen simétrico, renglones centrados */
      #c2fila { width: 608px; display: flex; gap: 26px; align-items: center; }
      #c2prod { flex: 0 0 190px; height: 190px; border-radius: 22px; background: #fff; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,.4); opacity: 0; }
      #c2prod img { width: 100%; height: 100%; object-fit: cover; }
      #c2btns { flex: 1; display: flex; flex-direction: column; gap: 16px; }
      #c2cta { height: 88px; line-height: 88px; text-align: center; font-weight: 900; font-size: 34px; color: #E61B1F; background: #fff; border-radius: 18px; opacity: 0; box-shadow: 0 8px 24px rgba(0,0,0,.35); }
      #c2cta2 { height: 66px; line-height: 60px; text-align: center; font-weight: 800; font-size: 26px; color: #fff; border: 3px solid #fff; border-radius: 16px; opacity: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
      <div id="cam"><video id="a-roll" class="clip" src="corte.mp4" muted playsinline data-start="0" data-duration="${REEL}" data-track-index="0"></video>${fxCamHtml}</div>
      <div id="grade"></div>
      <div id="vig"></div>
      <div id="grain"></div>
      <div id="dip"></div>
      <div id="pbar"><i></i></div>
      ${chipHtml}
      ${fxHtml}
      <div id="subs">
        ${subsHtml}
      </div>
      <div id="logo"><img src="logo-sq-abierto.png" alt="Veoquiero" /><img class="cerr" src="logo-sq-cerrado.png" alt="" /></div>
      <div id="outro">
        <div class="o-grid"></div>
        <div class="o-logo" id="ologo"><div class="o-ring r1"></div><div class="o-ring r2"></div><div class="o-ring r3"></div><img src="logo-sq-abierto.png" alt="Veoquiero" /><img class="cerr" src="logo-sq-cerrado.png" alt="" /></div>
        <div class="o-eyebrow" id="oeyebrow">${O.eyebrow}</div>
        <div class="o-titulo" id="otitulo">${O.titulo}</div>
        <div class="o-pts">${O.puntos.map((p, i) => `<div class="o-pt" id="opt${i}" style="font-size:${PT_SIZE}px"><span class="ck">✓</span>${p}</div>`).join('')}</div>
        <div class="o-cta1" id="octa1">${O.cta1}<span class="shine"></span></div>
        <div class="o-cta2" id="octa2">${O.cta2}</div>
        <div class="o-marca" id="omarca">${O.marca}</div>
      </div>
      ${CI ? `<div id="c2"><img id="c2bg" src="ultimo.jpg" alt="" /><div id="c2grad"></div>
        <div id="c2col"><div id="c2logo"><img src="${existsSync('motion/logo-hd.png') ? 'logo-hd.png' : 'logo-sq-abierto.png'}" alt="" /><span class="shine"></span></div>
        <div id="c2frase"${CI.palabras.map((p) => p.t).join(' ').length > 48 ? ' style="font-size:52px"' : ''}>${CI.palabras.map((p, i) => `<span id="c2w${i}">${esc(p.t.replace(/[,]+$/, ''))}</span>`).join('')}</div>
        <div id="c2fx">${[0, 1, 2].map((i) => `<div class="c2ring" id="c2r${i}"></div>`).join('')}${DOTS.map((i) => `<div class="c2dot${i % 3 ? '' : ' m'}" id="c2d${i}"></div>`).join('')}<svg id="c2trazo" viewBox="0 0 528 278"><rect x="3" y="3" width="522" height="272" rx="30" pathLength="1"/></svg></div><div id="c2bars">${[0, 1, 2].map((i) => `<div class="c2bar" id="c2b${i}" style="top:${i * 90}px"></div>`).join('')}</div><div id="c2flash"></div>
        <div id="c2fila">${existsSync('motion/producto.jpg') ? '<div id="c2prod"><img src="producto.jpg" alt="" /></div>' : ''}
        <div id="c2btns"><div id="c2cta">${O.cta1}</div><div id="c2cta2">${O.cta2}</div></div></div></div></div>` : ''}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const B = ${JSON.stringify(B.map((b) => ({ id: b.id, s: b.s, e: b.e, ws: b.ws.map((w) => ({ id: w.id, s: w.s, e: w.e, enf: w.enf })) })))};
      const CUTS = ${JSON.stringify(C.cuts)}, CHIPS = ${JSON.stringify((C.chips || []).map((c) => ({ t: c.t, d: c.d })))};
      const OS = ${REEL}, OD = ${OD};
      // grano: salta de posicion cada cuadro (deterministico, sin random)
      tl.to("#grain", { x: 48, y: -32, duration: ${DUR}, ease: "steps(${Math.round(DUR * 24)})" }, 0);
      tl.fromTo("#pbar i", { scaleX: 0 }, { scaleX: 1, duration: OS, ease: "none" }, 0);
      tl.set("#pbar", { opacity: 0 }, OS);
      tl.fromTo("#cam", { scale: 1.0 }, { scale: 1.05, duration: CUTS[0], ease: "none" }, 0);
      CUTS.forEach((t, i) => {
        tl.fromTo("#dip", { opacity: 0 }, { opacity: 0.85, duration: 0.06, ease: "power1.in" }, t - 0.06);
        tl.to("#dip", { opacity: 0, duration: 0.16, ease: "power1.out" }, t);
        tl.fromTo("#cam", { scale: 1.1 }, { scale: i % 2 ? 1.0 : 1.04, duration: (CUTS[i + 1] || OS) - t, ease: "power2.out" }, t);
        // 30-Oct (Diego: «más fluidez»): cada tercer corte barre de costado y el siguiente entra con un giro corto.
        if (i % 3 === 1) tl.fromTo("#cam", { x: -32 }, { x: 0, duration: 0.24, ease: "power3.out" }, t);
        if (i % 3 === 2) tl.fromTo("#cam", { rotation: -2.2 }, { rotation: 0, duration: 0.26, ease: "back.out(2)" }, t);
      });
      CHIPS.forEach((c, i) => {
        tl.fromTo("#chip" + i, { opacity: 0, y: 18, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: "back.out(2)" }, c.t);
        tl.to("#chip" + i, { opacity: 0, y: -10, duration: 0.16 }, c.t + c.d);
      });
      ${fxJs}
      B.forEach((b) => {
        tl.fromTo("#" + b.id, { opacity: 0, y: 14, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.12, ease: "power2.out" }, b.s);
        tl.to("#" + b.id, { opacity: 0, duration: 0.08 }, b.e);
        // Cada palabra aparece cuando se dice (29-Oct, Grupo Alterna: «FOCOS?» salía 0,33 s antes con el bloque entero visible
        // desde la primera palabra). El lugar ya está reservado, así que la línea no salta.
        b.ws.forEach((w) => {
          tl.fromTo("#" + w.id, { opacity: 0 }, { opacity: 1, duration: 0.05, ease: "none" }, w.s);
          if (w.enf) { tl.set("#" + w.id, { color: "#fff", backgroundColor: "#E61B1F", webkitTextStroke: "0px #000" }, w.s); }
        });
      });
      tl.fromTo("#logo", { opacity: 0, scale: 0.8 }, { opacity: 0.9, scale: 1, duration: 0.3, ease: "back.out(2)" }, ${C.logo_t[0]});
      tl.to("#logo", { opacity: 0, duration: 0.25 }, ${C.logo_t[1]});
      const BLINK = (sel, t) => { tl.set(sel, { opacity: 1 }, t); tl.set(sel, { opacity: 0 }, t + 0.13); };
      BLINK("#logo .cerr", ${C.logo_t[0]} + 0.55); BLINK("#logo .cerr", ${C.logo_t[0]} + 1.25);
      BLINK("#ologo .cerr", OS + 1.05); BLINK("#ologo .cerr", OS + 2.5);
      tl.fromTo("#dip", { opacity: 0 }, { opacity: 1, duration: 0.08 }, OS - 0.08);
      tl.set("#outro", { opacity: 1 }, OS);
      tl.to("#dip", { opacity: 0, duration: 0.2 }, OS);
      tl.fromTo("#ologo", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.8)" }, OS + 0.02);
      tl.fromTo(".o-ring.r1", { rotation: 0 }, { rotation: 300, duration: OD, ease: "none" }, OS);
      tl.fromTo(".o-ring.r2", { rotation: 0 }, { rotation: -240, duration: OD, ease: "none" }, OS);
      tl.fromTo(".o-ring.r3", { rotation: 0 }, { rotation: 180, duration: OD, ease: "none" }, OS);
      tl.fromTo("#oeyebrow", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.25 }, OS + 0.25);
      tl.fromTo("#otitulo", { opacity: 0, scale: 1.15 }, { opacity: 1, scale: 1, duration: 0.3, ease: "power3.out" }, OS + 0.35);
      [0, 1, 2].forEach((i) => tl.fromTo("#opt" + i, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.22 }, OS + 0.65 + i * 0.18));
      tl.fromTo("#octa1", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.28, ease: "back.out(2)" }, OS + 1.25);
      tl.fromTo("#octa1 .shine", { x: 0 }, { x: 880, duration: 0.7, ease: "power1.inOut" }, OS + 1.65);
      tl.fromTo("#octa1", { scale: 1 }, { scale: 1.04, duration: 0.25, yoyo: true, repeat: 3, ease: "sine.inOut" }, OS + 1.9);
      tl.fromTo("#octa2", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.28, ease: "back.out(2)" }, OS + 1.45);
      tl.fromTo("#omarca", { opacity: 0 }, { opacity: 1, duration: 0.3 }, OS + 1.7);
      ${CI ? `// cierre con emoción: tapa al cierre de siempre
      const W2 = ${JSON.stringify(CI.palabras.map((p) => p.s))};
      tl.set("#c2", { opacity: 1 }, OS);
      tl.fromTo("#c2bg", { scale: 1, filter: "blur(0px) brightness(1)" }, { scale: 1.1, duration: OD, ease: "none" }, OS);
      tl.to("#c2bg", { filter: "blur(6px) brightness(0.85)", duration: 0.7, ease: "power2.out" }, OS + 0.15);
      tl.fromTo("#c2grad", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.out" }, OS + 0.1);
      ${LOGO_ANIM[CI.logo_anim] || LOGO_ANIM.pop}
      tl.fromTo("#c2logo .shine", { x: 0 }, { x: 900, duration: 0.8, ease: "power1.inOut" }, OS + 1.0);
      W2.forEach((s, i) => tl.fromTo("#c2w" + i, { opacity: 0, y: 26, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.18, ease: "back.out(2)" }, s));
      // El cierre dura ~3,6 s en el MP4 (4,1 s antes de acelerar) y la frase ocupa casi todo: el producto y los botones entran
      // mientras se dice, no después (la primera prueba los dejó afuera del video).
      const FIN = Math.min(OS + 1.7, OD + OS - 1.6);
      if (document.querySelector("#c2prod")) tl.fromTo("#c2prod", { opacity: 0, x: -240, rotation: -8 }, { opacity: 1, x: 0, rotation: 0, duration: 0.45, ease: "back.out(1.6)" }, FIN);
      tl.fromTo("#c2cta", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3, ease: "back.out(2)" }, FIN + 0.15);
      tl.fromTo("#c2cta2", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3, ease: "back.out(2)" }, FIN + 0.3);
      tl.fromTo("#c2cta", { scale: 1 }, { scale: 1.05, duration: 0.25, yoyo: true, repeat: 3, ease: "sine.inOut" }, FIN + 0.55);` : ''}
      tl.set({}, {}, ${DUR});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
writeFileSync('motion/index.html', html, 'utf8');
console.log('index.html listo:', B.length, 'bloques,', (C.fx || []).length, 'carteles, duracion', DUR);
