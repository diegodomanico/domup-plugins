// Parte pura de ubicar-producto: extracción de 1 cuadro por escena animada y guardado de montaje-cajas.json.
// Sin dependencia de claude.mjs: usada por la fábrica (lib/ubicar-producto.mjs) y por el plugin (montaje-clip).
// Uso CLI:
//   node lib/ubicar-producto-puro.mjs cuadros <dir>
//   node lib/ubicar-producto-puro.mjs guardar <dir> <json_o_ruta>
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export function extraerCuadrosProducto(dir) {
  const plan = JSON.parse(readFileSync(join(dir, 'anim-plan.json'), 'utf8'));
  const pRaw = JSON.parse(readFileSync(join(dir, 'pedido.json'), 'utf8'));
  const pedido = pRaw.pedido || pRaw;
  const escenas = (plan.escenas || []).map((e) => e.n).filter((n) => existsSync(join(dir, 'anim', `e${n}.mp4`)));
  if (!escenas.length) return { vacio: true, cajas: null, cuadros: [] };
  const sello = escenas.map((n) => `${n}:${Math.round(statSync(join(dir, 'anim', `e${n}.mp4`)).mtimeMs)}`).join('|');
  const ruta = join(dir, 'montaje-cajas.json');
  try {
    const j = JSON.parse(readFileSync(ruta, 'utf8'));
    if (j.sello === sello) return { cacheado: true, sello, cajas: j.cajas, cuadros: [], ruta };
  } catch { /* no estaba o cambió */ }
  const carpeta = join(dir, 'montaje-cajas');
  mkdirSync(carpeta, { recursive: true });
  const cuadros = [];
  for (const n of escenas) {
    const jpg = join(carpeta, `e${n}.jpg`);
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1.2', '-i', join(dir, 'anim', `e${n}.mp4`), '-frames:v', '1', '-vf', 'scale=720:1280', jpg]);
    if (existsSync(jpg)) cuadros.push({ n, jpg: jpg.split(String.fromCharCode(92)).join('/') });
  }
  const producto = existsSync(join(dir, 'producto.md')) ? readFileSync(join(dir, 'producto.md'), 'utf8').slice(0, 1500) : '';
  const fotos = ['a1.jpg', 'a2.jpg', 'a3.jpg'].map((a) => join(dir, 'angulos', a)).filter((f) => existsSync(f)).map((f) => f.split(String.fromCharCode(92)).join('/'));
  return {
    cacheado: false,
    sello,
    cuadros,
    fotos,
    producto,
    titulo: pedido.item?.titulo || pedido.producto?.titulo || '',
    ruta,
  };
}

export function guardarCajasProducto(dir, sello, j, cuadros, costoUsd = 0) {
  const ruta = join(dir, 'montaje-cajas.json');
  const cajas = {};
  for (const c of cuadros) {
    const b = j[String(c.n)];
    if (!Array.isArray(b) || b.length !== 4 || !b.every((x) => Number.isFinite(Number(x)))) continue;
    const [x0, y0, x1, y1] = b.map(Number);
    if (x1 - x0 < 12 || y1 - y0 < 12 || x0 < -20 || y0 < -20 || x1 > 740 || y1 > 1300) continue;
    cajas[c.n] = [Math.max(0, Math.round(x0)), Math.max(0, Math.round(y0)), Math.min(720, Math.round(x1)), Math.min(1280, Math.round(y1))];
  }
  writeFileSync(ruta, JSON.stringify({ sello, cajas, costo_usd: costoUsd }, null, 1), 'utf8');
  return cajas;
}

if (process.argv[1]?.endsWith('ubicar-producto-puro.mjs')) {
  const [modo, dir = '.', argJson] = process.argv.slice(2);
  if (modo === 'cuadros') {
    const res = extraerCuadrosProducto(dir);
    console.log(JSON.stringify(res, null, 1));
    process.exit(0);
  }
  if (modo === 'guardar' && argJson) {
    const prep = extraerCuadrosProducto(dir);
    if (prep.vacio) { console.log(JSON.stringify({ ok: false, motivo: 'sin escenas animadas' })); process.exit(1); }
    const raw = existsSync(argJson) ? readFileSync(argJson, 'utf8') : argJson;
    const t = String(raw);
    const j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    const escenas = prep.cuadros.length ? prep.cuadros : Object.keys(j).map((n) => ({ n: Number(n) })).filter((c) => Number.isFinite(c.n));
    const cajas = guardarCajasProducto(dir, prep.sello, j, escenas, 0);
    console.log(JSON.stringify({ ok: true, cajas }));
    process.exit(0);
  }
  console.error('Uso: node ubicar-producto-puro.mjs <cuadros|guardar> <dir> [json_o_ruta]');
  process.exit(2);
}
