// Identidad de montaje de cada marca (27-Oct-2026). Hasta hoy el montaje solo conocía a Veoquiero (marcas/<cust>.json) y
// el primer clip de otra marca (CHAN'S, de Puertas ICAS) se frenó al final con «No such file: marcas/<cust>.json».
// Orden de búsqueda:
//   1. marcas/<cust>-<tienda>.json   (identidad hecha a mano para una tienda oficial)
//   2. marcas/<cust>.json            (identidad hecha a mano para la cuenta, como Veoquiero)
//   3. una identidad armada sola con lo que la marca ya tiene cargado, guardada en clips-auto/_marcas/<cust>-<tienda>/
//      y reusada en los clips siguientes:
//        - el logo de la marca (esencia.logo_url: el que cargó la marca en domup.app o el de ML);
//        - el color del logo, oscurecido hasta que el blanco encima llegue a 4,5:1 (regla de contraste de la casa);
//        - una música del kit (musica_url_firmada) o de ElevenLabs con lo que la esencia pide (esencia.musica), instrumental y sin voces;
//        - el cierre «TIENDA OFICIAL <MARCA>».
// La plantilla del montaje es la misma de Veoquiero; el rojo de los acentos se cambia por el color de la marca (montar.py).
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { ENV_LOCAL } from './rutas.mjs';

const ENV = ENV_LOCAL;
const clave = () => process.env.ELEVENLABS_API_KEY
  || (existsSync(ENV) && (readFileSync(ENV, 'utf8').match(/^ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m) || [])[1]?.trim())
  || (() => { throw new Error('falta ELEVENLABS_API_KEY en .env.local'); })();

function resolverPython() {
  const cands = [
    process.env.PYTHON_BIN,
    join(homedir(), 'Documents', 'Fabrica DomUP', '.venv', 'bin', 'python'),
    'python3',
    'python',
  ].filter(Boolean);
  for (const bin of cands) {
    const r = spawnSync(bin, ['-c', 'import PIL'], { encoding: 'utf8' });
    if (r.status === 0) return bin;
  }
  return 'python';
}

// Música distinta para UN pedido (12-Nov, Racer: «CAMBIAR LA MUSICA» sobre un video ya entregado). Se genera una sola vez por
// pedido en su carpeta y el montaje la usa en lugar de la de la marca (montaje-opciones.json). No cambia la música de la marca.
export async function musicaAlternativa(dir, anterior) {
  const out = join(dir, 'musica-ajuste.mp3');
  if (existsSync(out)) return out.replace(/\\/g, '/');
  const prompt = 'Upbeat, energetic modern instrumental with a clear driving rhythm and a bright catchy melody, positive and dynamic. '
    + (anterior ? 'It must sound clearly different from this previous track: «' + String(anterior).slice(0, 200) + '». ' : '')
    + 'Instrumental only, no vocals, no lyrics, sits under a voiceover, clean ending.';
  let m;
  try {
    m = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
      method: 'POST', headers: { 'xi-api-key': clave(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, music_length_ms: 30000 }),
    });
  } catch (e) {
    throw new Error(`No se pudo conectar a api.elevenlabs.io para música (red bloqueada o sin salida; habilitá api.elevenlabs.io en Configuración o corré en sesión local): ${e?.message || e}`);
  }
  if (!m.ok) throw new Error('música de ElevenLabs ' + m.status + ': ' + (await m.text()).slice(0, 200));
  writeFileSync(out, Buffer.from(await m.arrayBuffer()));
  return out.replace(/\\/g, '/');
}

// Color dominante del logo (sin blancos, negros ni grises), oscurecido hasta 4,5:1 contra el blanco. Si el logo es todo
// blanco y negro, queda un gris carbón. También imprime el tamaño natural WxH en stderr/segunda línea si hace falta.
const PY_COLOR = `
import sys, colorsys
from PIL import Image
im_orig = Image.open(sys.argv[1]).convert('RGBA')
w, h = im_orig.size
im = im_orig.copy(); im.thumbnail((200, 200))
cuenta = {}
for r, g, b, a in im.getdata():
    if a < 128: continue
    hh, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
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
print(f'{w}x{h}')
`;

export async function marcaDelPedido(pedido, raiz, log = console.log) {
  const aqui = join(import.meta.dirname, '..');
  const tienda = pedido.official_store_id ?? pedido.item?.official_store_id ?? 0;
  for (const f of [`${pedido.cust_id}-${tienda}.json`, `${pedido.cust_id}.json`]) {
    const ruta = join(aqui, 'marcas', f);
    if (existsSync(ruta)) return ruta;
  }
  const dir = join(raiz, '_marcas', `${pedido.cust_id}-${tienda}`);
  const ruta = join(dir, 'marca.json');
  if (existsSync(ruta)) return ruta;
  mkdirSync(dir, { recursive: true });
  const es = pedido.esencia || {};
  const nombreMarca = es.nombre_marca || pedido.nombre_marca;
  const logoUrl = es.logo_url || pedido.logo_url;
  const musicaUrlFirmada = es.musica_url_firmada || pedido.musica_url_firmada || null;
  if (!nombreMarca) throw new Error('la marca no tiene nombre cargado: no se puede armar el cierre');
  if (!logoUrl) throw new Error(`la marca «${nombreMarca}» no tiene logo cargado (ni en domup.app ni en ML): el clip lleva el logo`);
  // logo: se baja y se pasa a PNG SIN agrandarlo por encima de su tamaño nativo (evita pixelado)
  const r = await fetch(logoUrl);
  if (!r.ok) throw new Error(`no se pudo bajar el logo de la marca (${r.status})`);
  const origLogo = join(dir, 'logo-original');
  writeFileSync(origLogo, Buffer.from(await r.arrayBuffer()));
  const logo = join(dir, 'logo.png');
  const cv = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', origLogo, '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease", logo], { encoding: 'utf8' });
  if (cv.status !== 0) throw new Error(`el logo no se pudo convertir a PNG: ${cv.stderr.slice(-200)}`);
  // la plantilla busca el logo con el nombre de Veoquiero (ojo abierto / cerrado): mismo archivo, así no «pestañea»
  for (const n of ['logo-sq-abierto.png', 'logo-sq-cerrado.png']) copyFileSync(logo, join(dir, n));
  const pyBin = resolverPython();
  const col = spawnSync(pyBin, ['-c', PY_COLOR, logo], { encoding: 'utf8' });
  if (col.status !== 0) throw new Error(`no se pudo medir el color del logo: ${col.stderr.slice(-200)}`);
  const lineasCol = col.stdout.trim().split(/\r?\n/);
  const color = lineasCol[0].split(',').map(Number);
  const [logoW, logoH] = (lineasCol[1] || '0x0').split('x').map(Number);
  const logoChico = logoW > 0 && logoH > 0 && Math.max(logoW, logoH) < 512;
  if (logoChico) {
    log(`⚠️ logo chico (${logoW}x${logoH} px < 512 px): no se escala arriba de su tamaño para evitar pixelado; cargá un logo >= 512 px en domup.app`);
  }
  // música: primero la del kit firmado (clip_kit_montaje), y solo si falta se genera con ElevenLabs
  const musica = join(dir, 'musica.mp3');
  const pedidoMusica = `${es.musica || 'Soft modern instrumental background music, calm and stylish.'} Instrumental only, no vocals, no lyrics, steady soft groove that sits under a voiceover, clean ending.`;
  if (!existsSync(musica)) {
    if (musicaUrlFirmada) {
      const rm = await fetch(musicaUrlFirmada);
      if (!rm.ok) throw new Error(`no se pudo bajar la música del kit (${rm.status})`);
      writeFileSync(musica, Buffer.from(await rm.arrayBuffer()));
    } else {
      const m = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
        method: 'POST', headers: { 'xi-api-key': clave(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: pedidoMusica, music_length_ms: 30000 }),
      });
      if (!m.ok) throw new Error(`música de ElevenLabs ${m.status}: ${(await m.text()).slice(0, 200)}`);
      writeFileSync(musica, Buffer.from(await m.arrayBuffer()));
    }
  }
  const hex = '#' + color.map((v) => v.toString(16).padStart(2, '0')).join('');
  const marca = {
    _nota: `Armada sola el ${new Date().toISOString().slice(0, 10)} con el logo y la esencia de ${nombreMarca} (lib/marca-auto.mjs). Se puede reemplazar por una hecha a mano en marcas/${pedido.cust_id}-${tienda}.json.`,
    plantilla: 'montaje/build-vq.mjs',
    assets: [join(dir, 'logo-sq-abierto.png'), join(dir, 'logo-sq-cerrado.png')].map((p) => p.replace(/\\/g, '/')),
    musica: musica.replace(/\\/g, '/'),
    musica_pedido: pedidoMusica,
    marca_outro: `TIENDA OFICIAL ${nombreMarca.toUpperCase()}`,
    velocidad: 1.13,
    acento: hex,
    ...(logoW && logoH ? { logo_px: [logoW, logoH], logo_chico: logoChico } : {}),
    caratula: { logo: logo.replace(/\\/g, '/'), color },
  };
  writeFileSync(ruta, JSON.stringify(marca, null, 1), 'utf8');
  log(`marca: identidad armada sola para ${nombreMarca} (color ${hex}, logo ${logoW}x${logoH}, ${musicaUrlFirmada ? 'música del kit' : 'música nueva'}) en ${dir}`);
  return ruta;
}

if (process.argv[1]?.endsWith('marca-auto.mjs')) {
  const args = process.argv.slice(2);
  const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const dirArg = !args[0]?.startsWith('--') ? args[0] : null;
  const pedidoPath = flag('--pedido') || (dirArg ? join(dirArg, 'pedido.json') : null);
  const kitPath = flag('--kit') || (dirArg && existsSync(join(dirArg, 'kit-montaje.json')) ? join(dirArg, 'kit-montaje.json') : null);
  const raizOut = flag('--out') || (pedidoPath ? dirname(pedidoPath) : process.cwd());
  if (!pedidoPath || !existsSync(pedidoPath)) {
    console.error('Uso: node marca-auto.mjs <carpeta_clip> | --pedido <pedido.json> [--kit <kit-montaje.json>] [--out <raiz>]');
    process.exit(2);
  }
  const ped = JSON.parse(readFileSync(pedidoPath, 'utf8'));
  const kit = kitPath && existsSync(kitPath) ? JSON.parse(readFileSync(kitPath, 'utf8')) : null;
  if (kit) {
    ped.esencia = ped.esencia || {};
    if (!ped.esencia.nombre_marca && kit.nombre_marca) ped.esencia.nombre_marca = kit.nombre_marca;
    if (kit.logo_url) ped.esencia.logo_url = kit.logo_url;
    if (kit.musica_url_firmada) ped.esencia.musica_url_firmada = kit.musica_url_firmada;
    if (kit.cierre?.texto && !ped.esencia.cierre) ped.esencia.cierre = kit.cierre.texto;
  }
  marcaDelPedido(ped, raizOut)
    .then((ruta) => console.log(ruta))
    .catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
}
