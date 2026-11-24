// Identidad de montaje de cada marca (27-Oct-2026). Hasta hoy el montaje solo conocía a Veoquiero (marcas/<cust>.json) y
// el primer clip de otra marca (CHAN'S, de Puertas ICAS) se frenó al final con «No such file: marcas/<cust>.json».
// Orden de búsqueda:
//   1. marcas/<cust>-<tienda>.json   (identidad hecha a mano para una tienda oficial)
//   2. marcas/<cust>.json            (identidad hecha a mano para la cuenta, como Veoquiero)
//   3. una identidad armada sola con lo que la marca ya tiene cargado, guardada en clips-auto/_marcas/<cust>-<tienda>/
//      y reusada en los clips siguientes:
//        - el logo de la marca (esencia.logo_url: el de la tienda en ML o el que subió el vendedor);
//        - el color del logo, oscurecido hasta que el blanco encima llegue a 4,5:1 (regla de contraste de la casa);
//        - una música de ElevenLabs con lo que la esencia pide (esencia.musica), instrumental y sin voces;
//        - el cierre «TIENDA OFICIAL <MARCA>».
// La plantilla del montaje es la misma de Veoquiero; el rojo de los acentos se cambia por el color de la marca (montar.py).
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ENV_LOCAL } from './rutas.mjs';

const ENV = ENV_LOCAL;
const clave = () => process.env.ELEVENLABS_API_KEY
  || (existsSync(ENV) && (readFileSync(ENV, 'utf8').match(/^ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m) || [])[1]?.trim())
  || (() => { throw new Error('falta ELEVENLABS_API_KEY en .env.local de DomUp-Reels'); })();

// Color dominante del logo (sin blancos, negros ni grises), oscurecido hasta 4,5:1 contra el blanco. Si el logo es todo
// blanco y negro, queda un gris carbón.
const PY_COLOR = `
import sys, colorsys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA'); im.thumbnail((200, 200))
cuenta = {}
for r, g, b, a in im.getdata():
    if a < 128: continue
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if s < 0.25 or l < 0.12 or l > 0.92: continue
    k = (r // 24, g // 24, b // 24); cuenta[k] = cuenta.get(k, 0) + 1
def lum(c):
    f = lambda v: (v / 255) / 12.92 if v / 255 <= 0.03928 else (((v / 255) + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
tope = max(cuenta.values()) if cuenta else 0
cands = [[x * 24 + 12 for x in k] for k, n in sorted(cuenta.items(), key=lambda kv: -kv[1]) if n >= 0.15 * tope]
# Si el logo ya tiene un color que contrasta solo con el blanco (CHAN'S: el azul marino al lado del dorado), va ese;
# oscurecer el dominante lo deja apagado (el dorado quedaba verde oliva).
listos = [x for x in cands if 1.05 / (lum(x) + 0.05) >= 4.6]
c = listos[0] if listos else (cands[0] if cands else [52, 52, 58])
while (1.05) / (lum(c) + 0.05) < 4.6: c = [int(v * 0.92) for v in c]
print(','.join(map(str, c)))
`;

export async function marcaDelPedido(pedido, raiz, log = console.log) {
  const aqui = join(import.meta.dirname, '..');
  const tienda = pedido.item?.official_store_id || 0;
  for (const f of [`${pedido.cust_id}-${tienda}.json`, `${pedido.cust_id}.json`]) {
    const ruta = join(aqui, 'marcas', f);
    if (existsSync(ruta)) return ruta;
  }
  const dir = join(raiz, '_marcas', `${pedido.cust_id}-${tienda}`);
  const ruta = join(dir, 'marca.json');
  if (existsSync(ruta)) return ruta;
  mkdirSync(dir, { recursive: true });
  const es = pedido.esencia || {};
  if (!es.nombre_marca) throw new Error('la marca no tiene nombre cargado: no se puede armar el cierre');
  if (!es.logo_url) throw new Error(`la marca «${es.nombre_marca}» no tiene logo cargado (ni el de la tienda en ML ni uno subido): el clip lleva el logo`);
  // logo: se baja y se pasa a PNG (los de ML vienen en webp o jpg)
  const r = await fetch(es.logo_url);
  if (!r.ok) throw new Error(`no se pudo bajar el logo de la marca (${r.status})`);
  writeFileSync(join(dir, 'logo-original'), Buffer.from(await r.arrayBuffer()));
  const logo = join(dir, 'logo.png');
  const cv = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, 'logo-original'), '-vf', 'scale=512:512:force_original_aspect_ratio=decrease', logo], { encoding: 'utf8' });
  if (cv.status !== 0) throw new Error(`el logo no se pudo convertir a PNG: ${cv.stderr.slice(-200)}`);
  // la plantilla busca el logo con el nombre de Veoquiero (ojo abierto / cerrado): mismo archivo, así no «pestañea»
  for (const n of ['logo-sq-abierto.png', 'logo-sq-cerrado.png']) copyFileSync(logo, join(dir, n));
  const col = spawnSync('python', ['-c', PY_COLOR, logo], { encoding: 'utf8' });
  if (col.status !== 0) throw new Error(`no se pudo medir el color del logo: ${col.stderr.slice(-200)}`);
  const color = col.stdout.trim().split(',').map(Number);
  // música: una sola por marca, instrumental, con lo que pide la esencia
  const musica = join(dir, 'musica.mp3');
  const pedidoMusica = `${es.musica || 'Soft modern instrumental background music, calm and stylish.'} Instrumental only, no vocals, no lyrics, steady soft groove that sits under a voiceover, clean ending.`;
  if (!existsSync(musica)) {   // si una vuelta anterior ya la generó, se reusa (se paga una sola vez por marca)
    const m = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
      method: 'POST', headers: { 'xi-api-key': clave(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: pedidoMusica, music_length_ms: 30000 }),
    });
    if (!m.ok) throw new Error(`música de ElevenLabs ${m.status}: ${(await m.text()).slice(0, 200)}`);
    writeFileSync(musica, Buffer.from(await m.arrayBuffer()));
  }
  const hex = '#' + color.map((v) => v.toString(16).padStart(2, '0')).join('');
  const marca = {
    _nota: `Armada sola el ${new Date().toISOString().slice(0, 10)} con el logo y la esencia de ${es.nombre_marca} (lib/marca-auto.mjs). Se puede reemplazar por una hecha a mano en marcas/${pedido.cust_id}-${tienda}.json.`,
    plantilla: 'montaje/build-vq.mjs',
    assets: [join(dir, 'logo-sq-abierto.png'), join(dir, 'logo-sq-cerrado.png')].map((p) => p.replace(/\\/g, '/')),
    musica: musica.replace(/\\/g, '/'),
    musica_pedido: pedidoMusica,
    marca_outro: `TIENDA OFICIAL ${es.nombre_marca.toUpperCase()}`,
    velocidad: 1.13,
    acento: hex,
    caratula: { logo: logo.replace(/\\/g, '/'), color },
  };
  writeFileSync(ruta, JSON.stringify(marca, null, 1), 'utf8');
  log(`marca: identidad armada sola para ${es.nombre_marca} (color ${hex}, música nueva) en ${dir}`);
  return ruta;
}
