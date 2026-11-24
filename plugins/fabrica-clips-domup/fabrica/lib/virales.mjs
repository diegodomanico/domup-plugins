// Relevamiento de virales en 3 fuentes, con el método del 17/18-Oct-2026 (veoquiero/guiones/refs3.py):
//   Meta = biblioteca de anuncios (días al aire) · TikTok = «me gusta» en la búsqueda · YouTube = vistas (videos cortos).
// Es un script fijo, sin IA: abre un navegador propio del programa (perfil ~/.clips-worker/navegador), lee las páginas y
// deja los datos en virales-crudo.json. La IA de los guiones recibe solo esos datos, nunca navega.
// TikTok muestra los «me gusta» con sesión iniciada: Diego inicia sesión una vez en ese perfil (node virales.mjs --login).
// Uso: node lib/virales.mjs --q "set de arte para niños" --pais AR --out <carpeta>   |   node lib/virales.mjs --login
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PLAYWRIGHT_CORE } from './rutas.mjs';

const isBare = !PLAYWRIGHT_CORE.includes('/') && !PLAYWRIGHT_CORE.includes('\\') && !PLAYWRIGHT_CORE.startsWith('.');
const pwMod = await (isBare ? import(PLAYWRIGHT_CORE) : import(pathToFileURL(PLAYWRIGHT_CORE).href));
const chromium = pwMod.chromium || pwMod.default?.chromium || pwMod.default;

const PERFIL = join(homedir(), '.clips-worker', 'navegador');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const numero = (t) => {
  if (!t) return null;
  const m = String(t).replace(/\s/g, '').match(/([\d.,]+)\s*(mil|k|m|mill|millones|b)?/i);
  if (!m) return null;
  // «27,228» o «27.228» sin sufijo = miles; «1,2 mil» o «1.2K» = decimal con sufijo
  const crudo = m[1];
  const s = (m[2] || '').toLowerCase();
  let n = (!s && /^\d{1,3}([.,]\d{3})+$/.test(crudo)) ? parseInt(crudo.replace(/[.,]/g, ''), 10) : parseFloat(crudo.replace(',', '.'));
  if (s === 'k' || s === 'mil') n *= 1e3; else if (s.startsWith('m')) n *= 1e6; else if (s === 'b') n *= 1e9;
  return Math.round(n);
};

async function abrir() {
  mkdirSync(PERFIL, { recursive: true });
  const headless = process.env.CLIPS_HEADLESS !== undefined ? process.env.CLIPS_HEADLESS === 'true' : process.platform !== 'win32';
  return chromium.launchPersistentContext(PERFIL, { channel: 'chrome', headless, viewport: { width: 1280, height: 900 }, locale: 'es-AR' });
}

async function youtube(ctx, q) {
  const p = await ctx.newPage();
  // sp=EgIYAQ%3D%3D = filtro «menos de 4 minutos»
  await p.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%253D%253D`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  const data = await p.evaluate(() => window.ytInitialData);
  await p.close();
  const out = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (o.videoRenderer) {
      const v = o.videoRenderer;
      out.push({ fuente: 'youtube', url: `https://www.youtube.com/watch?v=${v.videoId}`, titulo: v.title?.runs?.map((r) => r.text).join('') ?? '',
        metrica: 'vistas', valor_texto: v.viewCountText?.simpleText ?? v.viewCountText?.runs?.map((r) => r.text).join('') ?? null });
    }
    if (o.reelItemRenderer || o.shortsLockupViewModel) {
      const s = o.shortsLockupViewModel; const id = s?.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
      if (id) out.push({ fuente: 'youtube', url: `https://www.youtube.com/shorts/${id}`, titulo: s.overlayMetadata?.primaryText?.content ?? '',
        metrica: 'vistas', valor_texto: s.overlayMetadata?.secondaryText?.content ?? null });
    }
    for (const k in o) walk(o[k]);
  };
  walk(data);
  return out.map((x) => ({ ...x, valor: numero(x.valor_texto) }));
}

async function tiktok(ctx, q) {
  // TikTok bloquea el Chrome de Playwright: se usa el Chrome común de lib/chrome-tiktok.mjs (sesión iniciada a mano),
  // conectado por el puerto local. Si no está abierto, se intenta igual con el navegador del programa.
  let remoto = null, p;
  try { remoto = await chromium.connectOverCDP('http://127.0.0.1:9333'); p = await remoto.contexts()[0].newPage(); }
  catch { p = await ctx.newPage(); }
  await p.goto(`https://www.tiktok.com/search/video?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6000);
  // Tarjeta de búsqueda (medido 22-Oct): [data-e2e="search_video-item"] trae el link y el número del corazón (los
  // «me gusta» de la búsqueda, la métrica del relevamiento del 17-Oct); su padre trae la descripción.
  const items = await p.evaluate(() => [...document.querySelectorAll('[data-e2e="search_video-item"]')].map((it) => {
    const a = it.querySelector('a[href*="/video/"]') || it.closest('a');
    const like = it.querySelector('[data-e2e="video-views"]');
    const desc = it.parentElement.querySelector('[data-e2e="search-card-desc"], [data-e2e="search-card-video-caption"]');
    return { url: (a?.href || '').split('?')[0], valor_texto: (like?.textContent || it.innerText || '').trim().split('\n')[0] || null,
      titulo: (desc?.textContent || '').trim().slice(0, 140) };
  }).filter((x) => x.url));
  const conSesion = await p.evaluate(() => ![...document.querySelectorAll('button, a')].some((b) => /^(Iniciar sesión|Log in)$/i.test(b.textContent.trim())));
  await p.close();
  // remoto: no se llama a close(), que en una conexión por CDP puede cerrar el Chrome de Diego; la conexión se suelta
  // sola al terminar el proceso.
  const vistos = new Set();
  return { conSesion, items: items.filter((x) => !vistos.has(x.url) && vistos.add(x.url))
    .map((x) => ({ fuente: 'tiktok', metrica: 'me_gusta', ...x, valor: numero(x.valor_texto) })) };
}

async function meta(ctx, q, pais) {
  const p = await ctx.newPage();
  await p.goto(`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${pais}&media_type=video&q=${encodeURIComponent(q)}&search_type=keyword_unordered`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(7000);
  const texto = await p.evaluate(() => document.body.innerText);
  await p.close();
  // Cada anuncio muestra «Identificador de la biblioteca: N» y «En circulación desde el <fecha>».
  const out = [];
  const re = /(?:Identificador de la biblioteca|Library ID):\s*(\d+)[\s\S]{0,200}?(?:En circulación desde el|Empezó a circular el|Started running on)\s*([^\n·]+)/g;
  let m; while ((m = re.exec(texto)) && out.length < 15) {
    out.push({ fuente: 'meta', url: `https://www.facebook.com/ads/library/?id=${m[1]}`, titulo: '', metrica: 'al_aire_desde', valor_texto: m[2].trim(), valor: null });
  }
  return out;
}

if (process.argv.includes('--login')) {
  const ctx = await abrir();
  const p = await ctx.newPage(); await p.goto('https://www.tiktok.com/login');
  console.log('Iniciá sesión en TikTok en la ventana que se abrió y después cerrala. La sesión queda guardada en', PERFIL);
  await new Promise((r) => ctx.on('close', r));
  process.exit(0);
}

const q = arg('--q'), pais = arg('--pais') || 'AR', outDir = arg('--out') || '.';
if (!q) { console.log('Uso: node virales.mjs --q "<tipo de producto>" [--pais AR] [--out carpeta]  |  --login'); process.exit(2); }
const ctx = await abrir();
const res = { consulta: q, pais, fecha: new Date().toISOString(), fuentes: {} };
const cuantos = () => Object.values(res.fuentes).reduce((s, x) => s + (Array.isArray(x) ? x.length : (x?.items?.length || 0)), 0);
// Si un producto de nicho no trae nada («foco aditivo metálico compacto e39», 29-Oct), se busca con menos palabras: el tipo de
// producto en general sirve igual para sacar la estructura de los virales.
const palabras = q.split(/\s+/).filter(Boolean);
for (const consulta of [q, palabras.slice(0, 2).join(' '), palabras[0]].filter((c, i, a) => c && a.indexOf(c) === i)) {
  res.consulta = consulta; res.fuentes = {};
  for (const [nombre, fn] of [['youtube', () => youtube(ctx, consulta)], ['tiktok', () => tiktok(ctx, consulta)], ['meta', () => meta(ctx, consulta, pais)]]) {
    try { res.fuentes[nombre] = await fn(); } catch (e) { res.fuentes[nombre] = { error: String(e.message || e).slice(0, 300) }; }
  }
  if (cuantos() >= 3) break;
}
await ctx.close();
writeFileSync(join(outDir, 'virales-crudo.json'), JSON.stringify(res, null, 1), 'utf8');
const n = (x) => Array.isArray(x) ? x.length : (x?.items?.length ?? (x?.error ? `error: ${x.error}` : 0));
console.log(`virales-crudo.json · youtube ${n(res.fuentes.youtube)} · tiktok ${n(res.fuentes.tiktok)} (sesión: ${res.fuentes.tiktok?.conSesion ?? '?'}) · meta ${n(res.fuentes.meta)}`);
