import urllib.parse
# Montaje automático del clip (script fijo, sin IA). Derivado de clips-auto/.../montaje/armar.py, que salió de veoquiero ep16c.
# Entrada: <dir>/anim-plan.json, <dir>/voz/manifest.json, <dir>/anim/e<N>.mp4, <dir>/pedido.json y marcas/<cust_id>.json.
# Salida: <dir>/entrega/<item>-<pedido>.mp4 y <dir>/montaje/linea.json (la línea de tiempo, para los controles).
# Reglas de Diego que acá son código, no criterio:
#   - narración permanente (22-Oct): la escena dura lo que su voz; entre frase y frase, 0,2 s de aire (nunca más de 0,8 s);
#   - la frase a cámara arranca donde Flow movió los labios;
#   - placas con SOLO el nombre (22-Oct); la voz de Flow nunca entra: el video va sin audio (-an);
#   - todo a 1,13x, carátula como primer cuadro y -14 LUFS (18-Oct).
# Uso: python montar.py <dir>
import json, os, shutil, subprocess, glob, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
A = os.environ.get('SHORTS_MTL', os.path.join(AQUI, '..', '..', 'vendor', 'shorts-mtl')) + '/assets'
AIRE, AIRE_MAX, S0, MIN_ESC, OUTRO = 0.3, 0.8, 0.2, 1.8, 4.1   # aire 0,3 s (23-Oct: con 0,2 la narración sonaba apurada)

def _bin(nombre):
    return shutil.which(nombre) or (shutil.which(f'{nombre}.cmd') if os.name == 'nt' else None) or nombre

def run(c, **k): subprocess.run(c, check=True, **k)
def dur(f): return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout.strip())

def linea_de_tiempo(plan, frases, dur_video, tramos):
    """Ubica cada frase y cada corte. Devuelve escenas [{n, ini, fin, s0, vel}] y frases con 't' (inicio en el clip).
    - frase a cámara: si los labios de Flow arrancan tarde, se recorta el principio de la escena (s0) para que no quede un
      hueco de más de AIRE (22-Oct: 0,91 s mudo antes de «Mirá lo que llegó hoy»);
    - se usa solo el tramo que la puerta 2 dio por bueno (revision/puerta2.json);
    - si la voz dura más que el video, el video se estira hasta 1,35x; congelar más de 0,4 s no se acepta (SKILL: nada de
      imágenes fijas) y el montaje frena;
    - el cierre de la marca va sobre la placa final, 0,6 s después del golpe (ICAS 20-Oct)."""
    escenas, cursor, T, previa = [], 0.0, 0.0, None
    for e in plan['escenas']:
        desde, hasta = tramos.get(e['n'], (0, dur_video[e['n']]))
        ini, s0 = T, max(S0, desde); fr = [f for f in frases if f['escena'] == e['n']]
        for f in fr:
            quiero = cursor + AIRE if cursor else 0.15
            if f['modo'] == 'camara' and f.get('inicio_en_escena') is not None:
                if not [x for x in fr if x is not f and 't' in x]:   # primera frase de la escena: se ajusta el recorte
                    # Si los labios de Flow arrancan antes del recorte fijo de 0,2 s, el recorte se achica hasta 0,05 s antes de
                    # los labios (29-Oct, Grupo Alterna: labios en 0,1 s y recorte en 0,2 dejaban la voz corrida +0,15 s).
                    if f['inicio_en_escena'] < s0 and desde <= 0:
                        s0 = max(0.0, f['inicio_en_escena'] - 0.05)
                    s0 = max(s0, f['inicio_en_escena'] - (max(quiero, ini + 0.1) - ini))
                t = max(ini + f['inicio_en_escena'] - s0, quiero)
            elif previa and previa['archivo'] == f['archivo'] and previa['modo'] == 'off' and f['voz_ini'] > previa['voz_ini']                     and (f['voz_ini'] - previa['voz_ini'] - previa['dur']) <= AIRE_MAX:
                # Misma toma de voz en off: se respeta la pausa NATURAL de la toma (23-Oct, v3: «mejor, pero no termina siendo
                # fluido, se nota cortado» — reacomodar cada frase con un aire fijo rompía el relato). Suena como la toma entera.
                t = previa['t'] + (f['voz_ini'] - previa['voz_ini'])
            else:
                t = max(quiero, ini + (0.1 if cursor else 0.15))
            f['t'] = round(t, 3); cursor = t + f['dur']; previa = f
        fin = max(cursor + 0.25, ini + MIN_ESC)
        util = min(dur_video[e['n']], hasta) - s0
        hablada = any(f['modo'] == 'camara' for f in fr)
        # Una escena con frase a cámara NO se estira: el audio va a velocidad normal y los labios quedarían lentos
        # (23-Oct, Diego: «la sincronización labial de Vero quedó mal»; la escena 2 se había estirado a 0,74x).
        # Escena hablada sin video suficiente: el aire después de la última palabra baja de 0,25 a 0,1 s antes de frenar
        # (30-Oct, VentiMaku cfcaa952: 3,68 s de voz contra 3,43 s de video frenaba el clip por 0,25 s justos).
        if hablada and (fin - ini) - util > 0.25: fin = max(cursor + 0.1, ini + MIN_ESC)
        vel = 1.0 if (fin - ini <= util or hablada) else max(1 / 1.35, util / (fin - ini))
        congela = (fin - ini) - util / vel
        if congela > (0.25 if hablada else 0.4):
            raise SystemExit(f'✗ escena {e["n"]}: la voz dura {fin - ini:.2f} s y el video usable {util:.2f} s; quedaría {congela:.2f} s congelado. Acortar la frase o pedir 6 u 8 s.')
        escenas.append({'n': e['n'], 'ini': round(ini, 3), 'fin': round(fin, 3), 's0': round(s0, 3), 'vel': round(vel, 3), 'video': dur_video[e['n']]})
        T = fin
    for f in frases:
        if f['escena'] == 'cierre': f['t'] = round(T + 0.6, 3)   # 0,6 s después del golpe (ICAS 20-Oct; con 0,25 el boom tapaba la marca, 23-Oct)
    return escenas

def subtitulos(frases):
    """El texto escrito sale SIEMPRE del plan (whisper pierde «¿», escribe «Milly», junta «VeoQuiero»: ep05 y 23-Oct).
    Si whisper partió distinto las palabras, los tiempos se reparten por letras entre la primera y la última."""
    out = []
    for f in frases:
        if f['escena'] == 'cierre': continue   # el cierre se lee en la placa final, no lleva subtítulo
        plan_t = f['texto'].split(); ws = f['palabras'] or [{'s': 0, 'e': f['dur']}]
        if len(ws) == len(plan_t):
            tiempos = [(w['s'], w['e']) for w in ws]
        else:
            # 05-Nov (batería de VentiMaku): repartir por letras entre la primera y la última palabra ignoraba la pausa del medio
            # («¡Mi celu se muere! … ¿Tienes cargador?») y «¿Tienes» salía 1,68 s antes de decirse. Ahora cada palabra del plan se
            # ancla a la de whisper que coincide (sin tildes ni signos) y el reparto por letras queda solo entre anclas.
            import difflib, unicodedata
            nz = lambda s: re.sub(r'[^a-z0-9ñ]', '', unicodedata.normalize('NFKD', s.lower()).encode('ascii', 'ignore').decode() if s else '')
            pw = [nz(x) for x in plan_t]; ww = [nz(w.get('t') or w.get('w') or w.get('word') or w.get('text') or '') for w in ws]   # 12-Nov: la palabra viene en «t»; sin eso no anclaba nunca (D008 repetido con números)
            anc = {}
            for blk in difflib.SequenceMatcher(None, pw, ww, autojunk=False).get_matching_blocks():
                for k in range(blk.size): anc[blk.a + k] = (ws[blk.b + k]['s'], ws[blk.b + k]['e'])
            anc.setdefault(0, (ws[0]['s'], ws[0]['s'] + 0.2)); anc.setdefault(len(plan_t) - 1, (max(ws[-1]['e'] - 0.2, ws[0]['s']), ws[-1]['e']))
            tiempos = [None] * len(plan_t); idx = sorted(anc)
            for i in idx: tiempos[i] = anc[i]
            for i0, i1 in zip(idx, idx[1:]):
                if i1 - i0 < 2: continue
                a, b = anc[i0][1], anc[i1][0]; seg = plan_t[i0 + 1:i1]; tot = sum(len(x) for x in seg) or 1; acc = 0
                for j, x in enumerate(seg, start=i0 + 1):
                    t0 = a + (b - a) * acc / tot; acc += len(x); tiempos[j] = (t0, a + (b - a) * acc / tot)
        for (t0, t1), tx in zip(tiempos, plan_t):
            # 05-Nov (rack de VentiMaku): whisper pega la pausa a la palabra siguiente («¿Quién» de 13,86 a 14,86 s, dicha a las
            # 14,38): el subtítulo salía al empezar el silencio, 0,53 s antes. Una palabra que dura mucho más de lo que tarda en
            # decirse (~0,09 s por letra + 0,2) arranca donde de verdad se dice: al final de su tramo menos esa duración.
            letras = len(re.sub(r'[^\wáéíóúüñ]', '', tx, flags=re.I)); plaus = 0.09 * letras + 0.2
            if t1 - t0 > plaus + 0.3: t0 = t1 - plaus
            out.append({'t': tx, 's': round(f['t'] + t0, 3), 'e': round(f['t'] + t1, 3)})
        if out and out[-1]['t'][-1] not in '.,!?': out[-1]['t'] += ','
    for i in range(1, len(out)):
        out[i]['s'] = max(out[i]['s'], out[i - 1]['s'] + 0.06); out[i]['e'] = max(out[i]['e'], out[i]['s'] + 0.12)
    for i in range(len(out) - 1): out[i]['e'] = min(out[i]['e'], out[i + 1]['s'] - 0.01)
    return out

# --- Choques visuales (Chilibeans 20-Oct, ep08, ep09, ep10): las caras se miden cuadro por cuadro y cada rótulo va a una
#     franja libre de caras, del logo y de los subtítulos. Si no hay franja libre, el montaje frena (no se adivina).
CARAS = os.environ.get('SHORTS_MTL', os.path.join(AQUI, '..', '..', 'vendor', 'shorts-mtl')) + '/assets/modelos-caras/face_detection_yunet_2023mar.onnx'
LOGO_CAJA = (518, 48, 694, 234)

REC = os.environ.get('SHORTS_MTL', os.path.join(AQUI, '..', '..', 'vendor', 'shorts-mtl')) + '/assets/modelos-caras/face_recognition_sface_2021dec.onnx'

def firmas(retratos):
    """Firma facial de cada retrato oficial, para distinguir a los personajes de la cara de un producto (máscara, muñeco)."""
    import cv2
    rec = cv2.FaceRecognizerSF.create(REC, ''); out = []
    for r in retratos:
        im = cv2.imread(r)
        if im is None: continue
        det = cv2.FaceDetectorYN.create(CARAS, '', (im.shape[1], im.shape[0]), 0.6)
        _, cs = det.detect(im)
        if cs is not None and len(cs): out.append(rec.feature(rec.alignCrop(im, cs[0])))
    return rec, out

def caras_en(mp4, t0, t1, solo_personajes=None):
    """Cajas de caras (con el pelo) entre t0 y t1. Con solo_personajes=(rec, firmas), solo las que se parecen a un retrato del
    elenco: la cara de una máscara de látex no es una persona y se puede tapar (23-Oct, máscara de bruja en la falda de Nacho)."""
    import cv2
    cap = cv2.VideoCapture(mp4); cajas = []; det = None
    cap.set(cv2.CAP_PROP_POS_MSEC, t0 * 1000)
    while True:
        ok, fr = cap.read()
        if not ok or cap.get(cv2.CAP_PROP_POS_MSEC) / 1000 > t1: break
        fr = cv2.resize(fr, (720, 1280))
        if det is None: det = cv2.FaceDetectorYN.create(CARAS, '', (720, 1280), 0.6)
        _, cs = det.detect(fr)
        for c in (cs if cs is not None else []):
            x, y, w, h = c[:4]
            # Sin tope de tamaño (31-Oct, VentiMaku: el primer plano de Sebastián medía más de 260 px, se descartaba y el sello
            # «¡LISTO!» cayó sobre su cara). Una cara grande es justo la que no se puede tapar.
            if w < 30: continue
            if solo_personajes and solo_personajes[1]:
                rec, fs = solo_personajes
                f = rec.feature(rec.alignCrop(fr, c))
                if max(rec.match(f, g, cv2.FaceRecognizerSF_FR_COSINE) for g in fs) < 0.3: continue   # no es un personaje
            # +45 % arriba por el pelo y +70 % abajo por el mentón y el cuello (31-Oct, VentiMaku: «¡APROBADO!» rozaba el mentón de
            # Héctor y el revisor lo cuenta como rótulo sobre una cara), con un 25 % de aire a los costados.
            cajas.append((x - 0.25 * w, y - 0.45 * h, x + 1.25 * w, y + 1.7 * h))
    return cajas

def choca(caja, otras, margen=10):
    x1, y1, x2, y2 = caja
    return any(not (x2 + margen < a or b < x1 - margen or y2 + margen < c or d < y1 - margen) for a, c, b, d in otras)

def fuente_titulos(tipografia):
    """La familia de los títulos que nombra la esencia («Títulos: Poppins SemiBold ...»); None si no dice."""
    t = str(tipografia or '')
    m = re.search(r'T[ií]tulos?[^:]*:\s*([A-Z][A-Za-z0-9]+(?: [A-Z][A-Za-z0-9]+)*?)(?=\s+(?:Thin|ExtraLight|Light|Regular|Medium|SemiBold|Semibold|Bold|ExtraBold|Black|Heavy)\b|\s*[\(,.;]|$)', t)
    if not m: m = re.match(r'\s*([A-Z][A-Za-z0-9]+(?: (?!(?:Thin|ExtraLight|Light|Regular|Medium|SemiBold|Semibold|Bold|ExtraBold|Black|Heavy)\b)[A-Z][A-Za-z0-9]+)*)', t)
    return m.group(1).strip() if m else None

def marca_en_html(html, esencia, destino):
    """Aplica al index.html la letra de títulos y el trato (tú/vos) de la esencia de la marca (Diego, 30-Oct)."""
    if not os.path.exists(html): return
    h = open(html, encoding='utf8').read()
    fam = fuente_titulos((esencia or {}).get('tipografia'))
    if fam:
        try:
            import urllib.request
            q = urllib.parse.quote(fam)
            req = urllib.request.Request(f'https://fonts.googleapis.com/css2?family={q}:wght@600;700;800;900&display=swap',
                                         headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36'})
            css = urllib.request.urlopen(req, timeout=20).read().decode('utf8')
            os.makedirs(f'{destino}/fuentes', exist_ok=True)
            for i, u in enumerate(dict.fromkeys(re.findall(r'url\((https://[^)]+)\)', css))):
                local = f'fuentes/{re.sub(r"[^A-Za-z0-9]", "", fam)}-{i}.woff2'
                urllib.request.urlretrieve(u, f'{destino}/{local}')
                css = css.replace(u, local)
            h = h.replace('</head>', f'<style>{css}</style></head>', 1) if '</head>' in h else f'<style>{css}</style>' + h
            h = h.replace('"Montserrat"', f'"{fam}"').replace("'Montserrat'", f"'{fam}'")
            print(f'letra de la esencia: {fam}')
        except Exception as e:
            print(f'letra de la esencia «{fam}» no se pudo bajar ({e}); queda Montserrat')
    # 10-Nov (panel LED de Grupo Alterna, México, variante «neutro»): los botones salían en voseo («COMPRALO», «MIRÁ MÁS») porque solo
    # se pasaban a tú con la variante «tuteo». El voseo es solo para la variante «voseo»; toda otra variante, y todo país que no
    # sin variante cargada, quedan como están.
    _var = str((esencia or {}).get('variante_idioma') or '').lower()
    if _var and _var != 'voseo':   # botones del cierre en tú (VentiMaku: «Voseo: siempre tuteo»; Grupo Alterna: «neutro»)
        for a, b in [('COMPRALO', 'CÓMPRALO'), ('MIRÁ MÁS', 'MIRA MÁS'), ('ENCONTRALO', 'ENCUÉNTRALO'), ('PEDILO', 'PÍDELO'),
                     ('Compralo', 'Cómpralo'), ('Mirá más', 'Mira más')]:
            h = h.replace(a, b)
    open(html, 'w', encoding='utf8').write(h)

def fondo_logo(motion, acento, contraste):
    """Si el logo es claro (blanco o casi), las tarjetas blancas del logo pasan a oscuras: blanco sobre blanco no se lee
    (30-Oct, Herramental Babilonia: el revisor vio «un fantasma blanco sobre blanco» en el cierre)."""
    from PIL import Image
    src = next((f'{motion}/{n}' for n in ('logo-hd.png', 'logo-sq-abierto.png') if os.path.exists(f'{motion}/{n}')), None)
    html = f'{motion}/index.html'
    if not src or not os.path.exists(html): return
    im = Image.open(src).convert('RGBA'); im.thumbnail((300, 300))
    px = [(r, g, b) for r, g, b, a in im.getdata() if a > 128]
    if not px: return
    # luminancia de lo opaco; un logo con fondo blanco propio no cuenta como claro (su tarjeta blanca ya funciona)
    lum = sorted(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in px)
    oscuros = sum(1 for v in lum if v < 150) / len(lum)
    if oscuros >= 0.08: return
    fondo = acento if acento and contraste(acento) >= 3 else '#1d1d1f'
    h = open(html, encoding='utf8').read()
    css = f'<style>#c2logo, #logo {{ background: {fondo} !important; }}</style>'
    h = h.replace('</head>', css + '</head>', 1) if '</head>' in h else css + h
    open(html, 'w', encoding='utf8').write(h)
    print(f'logo claro ({round(100 * oscuros)}% de trazo oscuro): tarjetas del logo en {fondo}')

def recortar_blanco(src, dst):
    """Saca el fondo blanco propio de un logo (Veoquiero: PNG opaco con fondo blanco). Se va el blanco que toca el borde y los
    huecos chicos de las letras; el blanco grande encerrado por el dibujo (el ojo de Veoquiero) queda. Los bordes se pasan a
    transparencia proporcional para que no quede un filo blanco. Si el logo ya es transparente, no se toca."""
    import cv2, numpy as np
    from PIL import Image
    im = np.array(Image.open(src).convert('RGBA')).astype(np.float32)
    if (im[..., 3] < 128).mean() > 0.05: return False
    rgb = im[..., :3]; claro = (rgb.min(axis=2) >= 232).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(claro, connectivity=4)
    H, W = claro.shape; fuera = np.zeros((H, W), np.uint8)
    for i in range(1, n):
        x, y, w, h, area = st[i]
        toca = x == 0 or y == 0 or x + w >= W or y + h >= H
        if toca or area < 0.004 * H * W: fuera[lab == i] = 1
    if fuera.mean() < 0.05: return False
    zona = cv2.dilate(fuera, np.ones((5, 5), np.uint8)) > 0
    a = 1.0 - rgb.min(axis=2) / 255.0                      # blanco → 0, color pleno → ~1
    a = np.clip(a * 1.6, 0, 1)                             # el antialias no deja el color lavado
    aa = np.where(zona, a, 1.0); aa[fuera > 0] = np.minimum(aa[fuera > 0], 0.0)
    seg = np.maximum(aa, 1e-3)[..., None]
    col = np.where(zona[..., None], np.clip((rgb - (1 - seg) * 255.0) / seg, 0, 255), rgb)
    out = np.dstack([col, aa * 255.0]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(dst)
    print(f'logo recortado: {os.path.basename(dst)} ({round(100 * fuera.mean())}% de fondo blanco afuera)')
    return True

def logo_sin_tarjeta(motion):
    """El logo sin su tarjeta (12-Nov, Veoquiero: «que el logo no tenga ese banner blanco»). Se saca el rectángulo y el logo queda
    recortado sobre la imagen, con un contorno claro pegado a su forma (como un sticker) para que se lea sobre cualquier fondo."""
    html = f'{motion}/index.html'
    if not os.path.exists(html): return
    for n in ('logo-sq-abierto.png', 'logo-sq-cerrado.png', 'logo-hd.png'):
        if os.path.exists(f'{motion}/{n}'): recortar_blanco(f'{motion}/{n}', f'{motion}/{n}')
    borde = 'drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 3px #fff) drop-shadow(0 0 5px rgba(255,255,255,.9)) drop-shadow(0 4px 10px rgba(0,0,0,.4))'
    css = ('<style>#c2logo, #logo { background: transparent !important; box-shadow: none !important; overflow: visible !important; }'
           f' #c2logo img, #logo img {{ filter: {borde}; }} #c2logo .shine {{ display: none !important; }}</style>')
    h = open(html, encoding='utf8').read()
    h = h.replace('</head>', css + '</head>', 1) if '</head>' in h else css + h
    open(html, 'w', encoding='utf8').write(h)
    print('logo sin tarjeta: recortado con contorno claro')

def main(d):
    plan = json.load(open(f'{d}/anim-plan.json', encoding='utf8'))
    # 11-Nov: el revisor final marcó un rótulo, una placa o una gráfica tapando algo en una escena (5 clips frenados con todas las
    # escenas ya animadas). El worker anota esas escenas en montaje-omitir.json y vuelve a montar: ahí no va ninguna gráfica.
    if os.path.exists(f'{d}/montaje-omitir.json'):
        _om = set(json.load(open(f'{d}/montaje-omitir.json', encoding='utf8')).get('escenas', []))
        for _k in ('chips', 'placas', 'efectos'):
            plan[_k] = [x for x in plan.get(_k, []) if x.get('escena') not in _om]
        print(f'gráficas omitidas en las escenas {sorted(_om)} (las marcó el revisor final)')
    frases = json.load(open(f'{d}/voz/manifest.json', encoding='utf8'))
    pedido = json.load(open(f'{d}/pedido.json', encoding='utf8'))
    # La identidad la elige el worker (lib/marca-auto.mjs): hecha a mano en marcas/ o armada sola con el logo y la esencia.
    marca = json.load(open(os.environ.get('MARCA_JSON') or f'{AQUI}/../marcas/{pedido["cust_id"]}.json', encoding='utf8'))
    # Opciones de montaje de ESTE pedido (12-Nov): las escribe el carril cuando el vendedor pide un ajuste que no toca las escenas
    # (lib/cola.mjs, esAjusteDeMontaje): otra música o el logo sin su tarjeta blanca.
    _op = json.load(open(f'{d}/montaje-opciones.json', encoding='utf8')) if os.path.exists(f'{d}/montaje-opciones.json') else {}
    if _op.get('musica') and os.path.exists(_op['musica']): marca['musica'] = _op['musica']; print('música del pedido (ajuste):', _op['musica'])
    if _op.get('logo_sin_tarjeta'): marca['logo_sin_tarjeta'] = True
    elenco = {e['slot']: e for e in pedido['elenco']}
    D = f'{d}/montaje'; E = f'{D}/edicion'
    OUT = f'{d}/entrega/{pedido["item"]["id"]}-{pedido["id"]}.mp4'
    os.makedirs(E, exist_ok=True); os.makedirs(os.path.dirname(OUT), exist_ok=True)
    dv = {e['n']: dur(f'{d}/anim/e{e["n"]}.mp4') for e in plan['escenas']}
    p2 = f'{d}/revision/puerta2.json'
    # El tramo usable recorta la escena SOLO si el revisor anotó una falla (26-Oct, luces LED: la escena 6 venía «usable 0-2,5 s»
    # sin ninguna falla y la frase no entraba; el video estaba bien hasta el final).
    # ...y solo si la falla es bloqueante (29-Oct, Grupo Alterna: unas bandas de luz «menor» recortaron la escena 6 a 0,9 s y la
    # voz no entraba).
    tramos = {e['n']: tuple(e['usable']) for e in json.load(open(p2, encoding='utf8')).get('escenas', [])
              if e.get('usable') and any(f.get('severidad') != 'menor' for f in e.get('fallas') or [])} if os.path.exists(p2) else {}
    # 05-Nov (bolso de Racer, escena 4): Flow dijo otra frase, se reemplazó por texto a voz y la nueva duraba 3,73 s contra 3,35 s de
    # video: el montaje frenaba el clip ya animado por 0,38 s. Si la voz se pasa hasta un 22 % (las tomas de texto a voz cambian de largo en cada vuelta: 13 % y 18 % en el mismo clip), se acelera esa escena (atempo) en vez
    # de congelar la imagen o volver a animar; más que eso sigue frenando.
    for _ in range(3):
        try:
            esc = linea_de_tiempo(plan, frases, dv, tramos); break
        except SystemExit as ex:
            mm = re.search(r'escena (\d+): la voz dura ([\d.]+) s y el video usable ([\d.]+) s', str(ex))
            if not mm: raise
            n_e, voz_d, vid_d = int(mm.group(1)), float(mm.group(2)), float(mm.group(3))
            r = voz_d / max(0.1, vid_d - 0.05)
            fr_e = [f for f in frases if f['escena'] == n_e]
            if r > 1.22 or not fr_e or any(f.get("tempo") for f in fr_e): raise
            for f in fr_e:
                f['tempo'] = round(r, 3); f['dur'] = round(f['dur'] / r, 3)
                f['palabras'] = [{**w, 's': w['s'] / r, 'e': w['e'] / r} for w in (f.get('palabras') or [])] or f.get('palabras')
                if f.get('inicio_en_escena') is not None: pass
            print(f'escena {n_e}: la voz se pasaba {voz_d - vid_d:.2f} s; va acelerada {r:.2f}x para que entre sin congelar la imagen')
    # Sincronía de labios (25-Oct, micrófono: la voz del confesionario quedó corrida): cada frase a cámara tiene que caer en
    # el mismo segundo del video de Flow en que el personaje habla. Si se corre más de 0,1 s, el clip no sale.
    for f in frases:
        if f.get('modo') == 'camara' and f.get('inicio_en_escena') is not None:
            e = next(x for x in esc if x['n'] == f['escena'])
            corr = (f['t'] - e['ini']) * e['vel'] + e['s0'] - f['inicio_en_escena'] - e.get('hold', 0)
            # Frase en off ANTES de la frase a cámara y labios de Flow que arrancan antes (29-Oct, Grupo Alterna: Lupita en off
            # 1,6 s y Rodrigo moviendo los labios a los 0,7 s → +1,51 s). Se sostiene el primer cuadro de la escena mientras suena
            # el off (hasta 1,8 s) y el video arranca después, con los labios en su lugar.
            if 0.1 < corr <= 1.8 and 'hold' not in e and e['vel'] == 1:
                e['hold'] = round(corr, 3); corr = 0
            if abs(corr) > 0.1:
                raise SystemExit(f'✗ escena {e["n"]}: la voz a cámara queda corrida {corr:+.2f} s de los labios')
    # Silencio antes de una frase a cámara (12-Nov, tubos led de Grupo Alterna: «Y por eso traje veinte.» en off y 0,95 s de
    # silencio hasta que Iván habla a cámara; el control frena con más de 0,8 s). La frase a cámara no se puede mover (va con los
    # labios), pero la frase en off sí: se corre hacia adelante para repartir el silencio, sin dejar más de 0,75 s antes ni después.
    _fe = [f for f in frases if f['escena'] != 'cierre']
    for _i in range(len(_fe) - 1):
        _f, _sig = _fe[_i], _fe[_i + 1]
        if _f.get('modo') != 'off' or _sig.get('modo') != 'camara' or _f['escena'] != _sig['escena']: continue
        _desp = _sig['t'] - (_f['t'] + _f['dur'])
        if _desp <= 0.8: continue
        _antes = (_f['t'] - (_fe[_i - 1]['t'] + _fe[_i - 1]['dur'])) if _i else 0.35
        _d = round(min(_desp - 0.35, 0.75 - _antes), 3)
        if _d > 0.02:
            _f['t'] = round(_f['t'] + _d, 3)
            print(f'escena {_f["escena"]}: la frase en off se corre {_d:.2f} s para no dejar {_desp:.2f} s de silencio antes de la frase a cámara')
    REEL = esc[-1]['fin']
    # El cierre dura lo que dura su frase (30-Oct, Herramental Babilonia: la frase de 4,8 s en un cierre fijo de 4,1 s cortaba la
    # voz en «Mirá la…» y el título quedaba a medias). Mínimo 4,1 s; si la frase es más larga, el cierre se estira y deja 0,7 s de aire.
    ci0 = next((f for f in frases if f['escena'] == 'cierre'), None)
    outro = max(OUTRO, round(ci0['t'] + ci0['dur'] - REEL + 0.7, 2)) if ci0 else OUTRO
    if outro > OUTRO: print(f'cierre estirado a {outro:.2f} s para que entre la frase entera')
    total = round(REEL + outro, 2)
    fr_esc = [f for f in frases if f['escena'] != 'cierre']
    huecos = [round(b['t'] - (a['t'] + a['dur']), 2) for a, b in zip(fr_esc, fr_esc[1:])]
    json.dump({'reel': REEL, 'outro': outro, 'escenas': esc, 'frases': [{k: f[k] for k in ('escena', 'nombre', 'modo', 'texto', 't', 'dur', 'via')} for f in frases], 'huecos': huecos},
              open(f'{D}/linea.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    # 1. pista de voz (solo ElevenLabs)
    ins, fc = [], []
    # 05-Nov (VentiMaku, 3 de 5 cambios de Julio: «la voz del hombre está muy baja», «las voces del hijo y la mamá no se escuchan»):
    # cada frase entraba con su nivel original (la voz de Flow con labios y la de ElevenLabs salen a niveles distintos) y después se
    # normalizaba la pista entera, así que las frases bajas seguían bajas al lado de las otras. Ahora cada frase se lleva al mismo
    # nivel (-20 LUFS medido en su tramo con voz) antes de mezclar; el tope de ganancia evita levantar ruido de una toma casi muda.
    def nivel_tramo(archivo, ini, fin):
        st = subprocess.run(['ffmpeg', '-ss', f'{ini:.3f}', '-t', f'{max(0.4, fin - ini):.3f}', '-i', archivo, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
        m = re.findall(r'I:\s+(-?[\d.]+) LUFS', st)
        return float(m[-1]) if m and float(m[-1]) > -70 else None
    for i, f in enumerate(frases):
        ins += ['-i', f'{d}/{f["archivo"]}']
        tp = f.get('tempo') or 1.0   # escena acelerada para no congelar la imagen (ver arriba): el tramo original es dur × tempo
        ini = f.get('voz_ini', 0); fin = ini + f['dur'] * tp   # tramo con voz medido en voces.mjs: se recorta acá, el archivo queda intacto
        lv = nivel_tramo(f'{d}/{f["archivo"]}', ini, fin)
        g = max(-12.0, min(12.0, -20 - lv)) if lv is not None else 0.0
        f['nivel_lufs'] = lv
        at = f'atempo={tp:.3f},' if tp != 1.0 else ''
        fc.append(f'[{i}:a]atrim={ini}:{fin},asetpts=PTS-STARTPTS,{at}aresample=48000,aformat=channel_layouts=stereo,volume={g:.2f}dB,afade=t=in:d=0.015,afade=t=out:st={max(0, f["dur"] - 0.05):.3f}:d=0.05,adelay={int(f["t"] * 1000)}:all=1[v{i}]')
    nv = [f.get('nivel_lufs') for f in frases if f.get('nivel_lufs') is not None]
    if nv: print(f'voces: niveles de entrada {min(nv):.1f} a {max(nv):.1f} LUFS, todas llevadas a -20')
    fc.append(''.join(f'[v{i}]' for i in range(len(frases))) + f'amix=inputs={len(frases)}:normalize=0,apad=whole_dur={total}[o]')
    run(['ffmpeg', '-y', '-loglevel', 'error', *ins, '-filter_complex', ';'.join(fc), '-map', '[o]', '-t', str(total), f'{D}/voz.wav'])
    # Nivel de la voz (27-Oct, sillas de CHAN'S: la voz de esa marca salió de ElevenLabs a -37 LUFS contra -25 de las de Veoquiero;
    # al normalizar el total a -14, la música quedó encima y Diego la oyó «muy fuerte»). La pista de voz se lleva a -20 LUFS y la
    # música a -14 antes de mezclar (con la sidechain, la misma relación que en los episodios aprobados de Veoquiero: voz -26 y
    # música -18 dieron +8; acá +6, un poco más suave), así la relación voz/música es la misma en todas las marcas.
    def lufs(f): return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', subprocess.run(['ffmpeg', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr)[-1])
    gv = -20 - lufs(f'{D}/voz.wav')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{D}/voz.wav', '-af', f'volume={gv:.2f}dB,alimiter=limit=0.89:level=false', f'{D}/voz-n.wav'])
    os.replace(f'{D}/voz-n.wav', f'{D}/voz.wav')
    gm = -14 - lufs(marca['musica'])
    json.dump(subtitulos(frases), open(f'{E}/words.json', 'w', encoding='utf8'), ensure_ascii=False)
    # 2. corte de video, sin el audio de Flow
    parts = []
    for e in esc:
        f = f'{E}/c{e["n"]}.mp4'; dd = round(e['fin'] - e['ini'], 3)
        lento = f'setpts={1 / e["vel"]:.4f}*PTS,minterpolate=fps=30:mi_mode=blend,' if e['vel'] < 1 else 'fps=30,'
        run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(e['s0']), '-i', f'{d}/anim/e{e["n"]}.mp4', '-vf',
             f'scale=720:1280,{lento}tpad=start_mode=clone:start_duration={e.get("hold", 0)}:stop_mode=clone:stop_duration=6,trim=duration={dd},setpts=PTS-STARTPTS', '-an', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', f])
        parts.append(f)
    open(f'{E}/l.txt', 'w').write(''.join(f"file '{p}'\n" for p in parts))
    run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', f'{E}/l.txt', '-c', 'copy', f'{E}/corte.mp4'])
    cuts = [e['fin'] for e in esc[:-1]]
    # 3. composición: caras medidas por escena → subtítulos, chips y placas en franjas libres; logo en una escena sin chip
    ini = {e['n']: e for e in esc}
    plan_sb = json.load(open(f'{d}/plan.json', encoding='utf8')) if os.path.exists(f'{d}/plan.json') else {}
    con_cara = re.search(r'\b(mask|careta|doll|figure|mannequin|puppet)\b', plan_sb.get('producto_lock', ''), re.I) or any(c.get('cara_tapada') for c in plan_sb.get('cuadros', []))
    solo = firmas([x['retrato'] for x in pedido['elenco'] if x.get('retrato') and x['slot'] not in ('perro', 'gato')]) if con_cara else None
    caras = {e['n']: caras_en(f'{d}/anim/e{e["n"]}.mp4', e['s0'], e['s0'] + (e['fin'] - e['ini']) * e['vel'], solo) for e in esc}
    subs_top = []
    for e in esc:
        # Abajo primero; si no hay lugar (23-Oct: la máscara en la falda también es una cara), más arriba, y por último el tercio
        # de arriba, que en el confesionario es la pared roja libre a propósito.
        # Zona segura (Diego, 29-Oct): debajo de ~880 px de 1280 Reels, Shorts y TikTok tapan con sus botones y textos (Reels el
        # 31 % de abajo, Shorts el 30 %), y arriba de ~90 px van las pestañas. El subtítulo (125 px de alto) va entre 200 y 740.
        top = next((t for t in (740, 660, 300, 200, 560) if not choca((40, t - 10, 680, t + 125), caras[e['n']])), None)
        if top is None:
            # Primer plano: la cara ocupa todo el cuadro (29-Oct, joystick de los Maku). Se elige la franja que menos tapa de la
            # cara en vez de frenar el clip; abajo de todo suele quedar sobre el mentón o el cuello, no sobre los ojos.
            def tapa(t):
                return sum(max(0, min(680, b) - max(40, a)) * max(0, min(t + 125, d2) - max(t - 10, c)) for a, c, b, d2 in caras[e['n']])
            top = min((740, 200), key=tapa)
            print(f'escena {e["n"]}: primer plano, subtítulos en la franja que menos tapa ({top})')
        subs_top.append(top)
    con_chip = {c['escena'] for c in plan.get('chips', [])}
    # 18-Nov (espejo de 60 cm de VentiMaku 6bd6d69d): en la escena 4 las caras ocupaban todas las franjas bajas, el subtítulo quedó
    # arriba (200) y el logo, que va en esa escena, quedó pisado por «PIERDES»; el revisor final frenó el clip terminado. El logo va
    # primero a una escena cuyo subtítulo no toca su lugar; si ninguna, la regla de antes.
    _orden_n = [e['n'] for e in esc]
    _libre = lambda n: not choca((40, subs_top[_orden_n.index(n)] - 10, 680, subs_top[_orden_n.index(n)] + 125), [LOGO_CAJA])
    medio_n = next((n for n in (4, 3, 5, 2, 6) if n in ini and n in _orden_n and n not in con_chip and _libre(n)), None) \
        or next((n for n in (4, 3, 5, 2) if n in ini and n not in con_chip), 4)
    medio = ini[medio_n]; logo_t = [round(medio['ini'] + 0.1, 2), round(medio['fin'] - 0.1, 2)]
    # Dónde está el producto al empezar cada escena (09-Nov, cámara domo de VentiMaku 7714cd89: el rótulo «CÁMARA DOMO WI-FI» cayó
    # justo encima de la cámara y su flecha apuntaba a los brazos de Héctor; el revisor final frenó el clip). El storyboard ya lo
    # midió: manifest[n].medida.caja, en píxeles del panel. Se pasa a 720x1280. Sin medida, no se sabe y la flecha no se dibuja.
    prod_caja = {}
    try:
        import cv2 as _cv
        for i, m in enumerate(json.load(open(f'{d}/paneles/manifest.json', encoding='utf8'))):
            cj = (m.get('medida') or {}).get('caja')
            if not cj or len(cj) != 4: continue
            im = _cv.imread(f'{d}/{m["archivo"]}')
            if im is None: continue
            sx, sy = 720 / im.shape[1], 1280 / im.shape[0]
            prod_caja[i + 1] = (round(cj[0] * sx), round(cj[1] * sy), round(cj[2] * sx), round(cj[3] * sy))
    except Exception as ex:
        print(f'caja del producto: no se pudo leer ({ex})')
    # La caja medida sobre la escena YA ANIMADA manda sobre la del cuadro del storyboard (10-Nov, lib/ubicar-producto.mjs): es donde
    # el producto está de verdad en el video. Si la caja ocupa más de la mitad del cuadro no sirve para esquivar y no se usa.
    try:
        for k, cj in (json.load(open(f'{d}/montaje-cajas.json', encoding='utf8')).get('cajas') or {}).items():
            if (cj[2] - cj[0]) * (cj[3] - cj[1]) <= 0.5 * 720 * 1280: prod_caja[int(k)] = tuple(cj)
            else: prod_caja.pop(int(k), None)
    except Exception:
        pass
    # 11-Nov (lámpara de Grupo Alterna b225e040: «INGENIERA PAULINA» y «PRUEBA DE VAPOR» escritos encima de la lámpara que sostiene
    # Paulina; el revisor final frenó el clip): la franja de subtítulos esquivaba las caras pero no el producto. Con el producto
    # ubicado en la escena, se busca una franja libre de caras Y de producto; si no hay ninguna, queda la que esquiva las caras.
    for _i, e in enumerate(esc):
        _pc = prod_caja.get(e['n'])
        if not _pc or not choca((40, subs_top[_i] - 10, 680, subs_top[_i] + 125), [_pc]): continue
        _alt = next((t for t in (740, 660, 300, 200, 560) if not choca((40, t - 10, 680, t + 125), list(caras[e['n']]) + [_pc])), None)
        if _alt is not None:
            print(f'escena {e["n"]}: subtítulos de {subs_top[_i]} a {_alt} para no escribir sobre el producto'); subs_top[_i] = _alt
    # 14-Nov (Cari Amici de TecnoTienda 1acb4653: «ASADA» escrito encima del logo de la tienda; el revisor final frenó el clip): la
    # franja de arriba (200) llega hasta y=325 y el logo ocupa hasta y=234. En las escenas donde se ve el logo, el subtítulo no va
    # en una franja que lo pise: se busca otra libre de caras, del logo y del producto; si no hay, libre de caras y del logo.
    for _i, e in enumerate(esc):
        if e['fin'] < logo_t[0] or e['ini'] > logo_t[1]: continue
        if not choca((40, subs_top[_i] - 10, 680, subs_top[_i] + 125), [LOGO_CAJA]): continue
        _pc = prod_caja.get(e['n']); _base = list(caras[e['n']]) + [LOGO_CAJA]
        _alt = next((t for t in (740, 660, 300, 560) if not choca((40, t - 10, 680, t + 125), _base + ([_pc] if _pc else []))), None)
        if _alt is None: _alt = next((t for t in (740, 660, 300, 560) if not choca((40, t - 10, 680, t + 125), _base)), None)
        if _alt is not None:
            print(f'escena {e["n"]}: subtítulos de {subs_top[_i]} a {_alt} para no escribir sobre el logo'); subs_top[_i] = _alt
    chips = []
    for c in plan.get('chips', [])[:7]:
        e = ini[c['escena']]; alto = 170 if c.get('big') else 64; ancho = 600 if c.get('big') else min(640, 40 + 22 * len(c['txt']))
        x1 = 360 - ancho / 2; sub = subs_top[c['escena'] - 1]
        con_logo = not (e['fin'] < logo_t[0] or e['ini'] > logo_t[1])
        # Caras solo del tramo en que se ve el chip (31-Oct: con la cara protegida más grande, mentón y cuello, el chip del gancho
        # de VentiMaku f4d1697b no entraba midiendo la escena entera). Se suman dos alturas más (arriba de todo y bien abajo).
        dur_c = min(2.7 if c.get('big') else 1.6, e['fin'] - e['ini'] - 0.2)
        try:
            caras_c = caras_en(f'{d}/anim/e{c["escena"]}.mp4', e['s0'] + 0.1 * e['vel'], e['s0'] + (0.1 + dur_c) * e['vel'], solo)
        except Exception:
            caras_c = caras[c['escena']]
        prohibido = caras_c + ([LOGO_CAJA] if con_logo else []) + [(0, sub - 10, 720, sub + 125)]
        # El chip se dibuja centrado y con su tamaño fijo (build-vq usa solo top): por eso se prueban alturas, no costados.
        pc_c = prod_caja.get(c['escena'])
        # Con los subtítulos arriba (sub < 400) la mitad de abajo está libre: el rótulo puede bajar hasta y=1010 (10-Nov, asiento Viper:
        # el gancho tapaba el asiento habiendo lugar más abajo, porque el tope de 860 era el de los subtítulos abajo).
        lim_c = (1011 if sub < 400 else 861) - alto
        top = next((t for t in (150, 100, 250, 560, 480, 400, 330, 600, 760, 680, 40, 820) if not choca((x1, t, x1 + ancho, t + alto), prohibido + [pc_c])), None) if pc_c else None
        # 10-Nov (asiento Viper de Racer): sin saber dónde está el producto, el rótulo del gancho cayó a la altura del pecho y tapó el
        # asiento que Fede sostenía. El gancho, que es grande, prueba primero arriba y bien abajo; el medio del cuadro (donde se
        # sostiene el producto) queda para lo último.
        orden = (150, 100, 40, 250, 760, 680, 820, 600, 330, 400, 480, 560) if c.get('big') and not pc_c else (150, 100, 250, 560, 480, 400, 330, 600, 760, 680, 40, 820)
        if top is None and pc_c:
            # Sin franja libre de caras Y de producto (10-Nov, asiento Viper de Racer, 2.ª vez): entre las alturas libres de caras,
            # logo y subtítulos, va la que MENOS producto tapa, no la primera de la lista.
            libres_c = [t for t in range(40, lim_c, 10) if not choca((x1, t, x1 + ancho, t + alto), prohibido)]
            if libres_c:
                # con 28 px de aire alrededor del producto: pegado al borde, el revisor lo lee como tapado (asiento Viper, 3.ª vez)
                tapa_p = lambda t: max(0, min(x1 + ancho, pc_c[2] + 28) - max(x1, pc_c[0] - 28)) * max(0, min(t + alto, pc_c[3] + 28) - max(t, pc_c[1] - 28))
                top = min(libres_c, key=tapa_p)
        if top is None: top = next((t for t in orden if not choca((x1, t, x1 + ancho, t + alto), prohibido)), None)
        # 09-Nov (asiento Viper de Racer, 6cbca174: «ANTES DE INSTALAR» no entraba en las 12 alturas fijas y el clip entero quedó
        # frenado, con las 8 escenas ya animadas). Primero se busca cada 10 px; si aun así no entra, un rótulo chico se omite con
        # aviso (el clip sale igual) y el del gancho, que tiene que estar, va donde menos cara tapa sin pisar el logo ni los subtítulos.
        if top is None:
            top = next((t for t in range(40, lim_c, 10) if not choca((x1, t, x1 + ancho, t + alto), prohibido)), None)
        if top is None and not c.get('big'):
            print(f'rótulo «{c["txt"]}» de la escena {c["escena"]}: omitido, no entra sin tapar una cara, el logo o los subtítulos'); continue
        if top is None:
            fijo = ([LOGO_CAJA] if con_logo else []) + [(0, sub - 10, 720, sub + 125)]
            def pisa(t): return sum(max(0, min(x1 + ancho, b) - max(x1, a)) * max(0, min(t + alto, d2) - max(t, c0)) for a, c0, b, d2 in caras_c)
            libres = [t for t in range(40, lim_c, 10) if not choca((x1, t, x1 + ancho, t + alto), fijo)]
            if not libres: raise SystemExit(f'✗ escena {c["escena"]}: el chip «{c["txt"]}» no entra sin tapar una cara, el logo o los subtítulos')
            top = min(libres, key=pisa)
            print(f'rótulo del gancho «{c["txt"]}»: no hay franja libre de caras; va en top={top}, donde menos tapa')
        # Los rótulos chicos duran 1,6 s (alcanzan para 2-4 palabras) y liberan el lugar para la segunda gráfica (30-Oct).
        chips.append({'escena': c['escena'], 't': round(e['ini'] + 0.1, 2), 'd': round(min(2.7 if c.get('big') else 1.6, e['fin'] - e['ini'] - 0.2), 2), 'txt': c['txt'], 'top': top, 'alto': alto, 'x1': round(x1), 'ancho': round(ancho), **({'big': True} if c.get('big') else {})})
    fx = []
    for p in plan.get('placas', []):
        e = ini[p['escena']]; sub = subs_top[p['escena'] - 1]
        prohibido = caras[p['escena']] + [(0, sub - 10, 720, sub + 125)] + [(40, c['top'], 680, c['top'] + c['alto']) for c in chips if c['escena'] == p['escena']]
        # Si en la escena se ve el producto (casi siempre en las manos, a la altura del pecho), la placa va arriba: abajo lo tapaba
        # (29-Oct, Grupo Alterna: «DOÑA LUPITA» encima del panel LED que sostenía Rodrigo).
        cuadro = (plan_sb.get('cuadros') or [{}] * 6)[p['escena'] - 1] if p['escena'] - 1 < len(plan_sb.get('cuadros') or []) else {}
        # Con el producto a la vista solo se prueba arriba; si no entra, la placa se omite (es un adorno: tapar el producto, no).
        alturas = (180, 300, 420) if cuadro.get('muestra_producto') else (860, 700, 560, 420)
        # Del lado de la persona (30-Oct, Herramental Babilonia: «RAMIRO» quedó arriba de Cami y la placa de ella no se vio porque
        # las dos iban en x=40, una encima de la otra). El lado sale del prompt del cuadro («Cami on the left and Ramiro on the right»).
        nom = elenco[p['personaje']]['nombre']
        lado = re.search(rf'{re.escape(nom)}[^.]{{0,40}}?\bon the (left|right)\b', cuadro.get('prompt') or '', re.I)
        x = 400 if lado and lado.group(1).lower() == 'right' else 40
        if not lado and len(cuadro.get('personajes') or []) > 1:
            print(f'placa de {nom} en la escena {p["escena"]}: no se sabe de qué lado está, se omite'); continue
        prohibido = prohibido + [(f['x'], f['y'], f['x'] + 280, f['y'] + 115) for f in fx if f.get('tipo') == 'personaje' and e['ini'] <= f['t'] < e['fin']]
        y = next((y for y in alturas if not choca((x, y, x + 280, y + 115), prohibido + [LOGO_CAJA])), None)
        if y is None and cuadro.get('muestra_producto'):
            print(f'placa de {p["personaje"]} en la escena {p["escena"]}: omitida para no tapar el producto'); continue
        # 05-Nov (batería de VentiMaku): en un primer plano la placa no entraba y el montaje frenaba el clip entero tres vueltas
        # seguidas, por un adorno. Como con el producto a la vista: se omite y se avisa; nunca tapa una cara.
        if y is None: print(f'placa de {p["personaje"]} en la escena {p["escena"]}: omitida, no entra sin tapar una cara o un rótulo'); continue
        fx.append({'tipo': 'personaje', 't': round(e['ini'] + 0.2, 2), 'd': round(min(1.9, e['fin'] - e['ini'] - 0.35), 2), 'x': x, 'y': y,
                   'px': 360, 'py': 300, 'nombre': elenco[p['personaje']]['nombre'].upper(), 'rol': ''})
    # Efectos de misión, uno por escena (Diego, 29-Oct: «mínimo 6 efectos, 1 por escena»). Cada uno va donde no tapa caras,
    # subtítulos, chips, placas ni el logo; si en la escena se ve el producto, se prueba primero arriba.
    TAM = {'paso': (460, 110), 'checks': (480, 230), 'contador': (260, 220), 'sello': (420, 190), 'timer': (300, 120), 'brillo': (360, 120),
           'flecha': (420, 90), 'palabra': (640, 200), 'barra': (460, 110), 'versus': (440, 170), 'reloj': (160, 210), 'bateria': (300, 130),
           'marcador': (440, 130), 'ondas': (240, 240)}
    ocupado = {}
    # Cada ocupación lleva su tramo de tiempo (30-Oct, espejo de Lemirk: de 17 gráficas entraron 10 porque todo el cuadro de la
    # escena contaba como ocupado aunque dos gráficas no se vieran a la vez). Choca solo lo que se superpone en lugar Y en tiempo.
    for c in chips: ocupado.setdefault(c['escena'], []).append(((c['x1'], c['top'], c['x1'] + c['ancho'], c['top'] + c['alto']), c['t'], c['t'] + c['d']))   # el ancho real del rótulo, no toda la banda
    for f in fx:
        n = next((e['n'] for e in esc if e['ini'] <= f['t'] < e['fin']), None)
        if n: ocupado.setdefault(n, []).append(((f['x'], f['y'], f['x'] + 280, f['y'] + 115), f['t'], f['t'] + f['d']))
    for ef in plan.get('efectos', []):
        e = ini.get(ef.get('escena'))
        if not e: continue
        # 05-Nov (cámara exterior de VentiMaku): con t hasta fin-0,6 y la duración mínima de 0,8 s, una gráfica de fin de escena
        # seguía en pantalla 0,2 s después del corte, sobre la escena siguiente, cuyas caras no se habían medido: «PASO 1» cayó en
        # la frente de Valentina. Ahora arranca a más tardar 0,95 s antes del corte, así termina dentro de su escena.
        t = round(max(e['ini'] + 0.05, min(e['fin'] - 0.95, e['ini'] + max(0.1, float(ef.get('en') or 0.3)))), 2)
        dur_ef = round(max(0.8, min(2.4, e['fin'] - t - 0.15)), 2)
        dur_ef = round(min(dur_ef, max(0.5, e['fin'] - t - 0.05)), 2)   # nunca cruza el corte, aunque la escena sea muy corta
        # Con 2 o 3 gráficas por escena, cada una termina cuando arranca la siguiente de esa escena (así pueden compartir lugar).
        sig = [round(max(e['ini'] + 0.05, min(e['fin'] - 0.95, e['ini'] + max(0.1, float(o.get('en') or 0.3)))), 2) for o in plan.get('efectos', [])
               if o is not ef and o.get('escena') == ef.get('escena') and o.get('tipo') not in ('punch', 'sacudida')]
        sig = [x for x in sig if x > t + 0.5]
        if sig: dur_ef = round(max(0.7, min(dur_ef, min(sig) - t - 0.1)), 2)
        tipo = ef.get('tipo')
        if tipo == 'punch': fx.append({'tipo': 'punch', 't': t, 'd': 0.6, 's': 1.15, 'ox': 50, 'oy': 45}); continue
        if tipo == 'sacudida':
            # 10-Nov (espejo redondo de Lemirk ec54958b): las líneas de vibración iban siempre al centro del cuadro y cruzaron los ojos
            # de dos caras en primer plano. Van donde no hay caras; si no hay lugar, no van.
            r_s = 150
            try: caras_s = caras_en(f'{d}/anim/e{ef["escena"]}.mp4', e['s0'] + max(0.0, t - e['ini'] - 0.1) * e['vel'], e['s0'] + (t - e['ini'] + 0.7) * e['vel'], solo)
            except Exception: caras_s = caras[ef['escena']]
            # las líneas se dibujan a los DOS costados (de r+14 a r+46 px del centro, 80 px de alto): se miran esas dos franjas
            franjas = lambda x, y: [(x - r_s - 50, y - 45, x - r_s - 10, y + 45), (x + r_s + 10, y - 45, x + r_s + 50, y + 45)]
            lugar = next(((x, y) for x, y in ((360, 640), (360, 480), (360, 780), (360, 330), (360, 900)) if not any(choca(fr, caras_s) for fr in franjas(x, y))), None)
            if lugar: fx.append({'tipo': 'sacudida', 't': t, 'x': lugar[0], 'y': lugar[1], 'r': r_s})
            else: print(f'efecto sacudida de la escena {ef["escena"]}: omitido, las caras ocupan el cuadro')
            continue
        if tipo not in TAM: continue
        w, h = TAM[tipo]
        # El sello es nowrap a 64 px (~42 px por letra + borde y relleno) y va girado: con el ancho fijo de 420, «¡CONECTADO!»
        # medía ~530 y tapó el logo de VentiMaku (31-Oct). Se reserva su ancho real más el margen del giro.
        if tipo == 'sello': w, h = max(w, len(ef.get('txt') or '¡LISTO!') * 42 + 110), h + 30
        # El marcador (texto + nota) tenía el mismo problema (31-Oct, Mamá Coxis: «VEREDICTO · ADOPTADA» se pasó de los 440 px, tapó la
        # boca de Héctor y se cortó en el borde). Se reserva el ancho real: ~30 px por letra del renglón más largo, más el relleno.
        if tipo == 'marcador': w = min(680, max(w, max(len(ef.get('txt') or ''), len(ef.get('nota') or '')) * 30 + 140, len((ef.get('txt') or '') + ' · ' + (ef.get('nota') or '')) * 24 + 100))
        sub = subs_top[ef['escena'] - 1]
        cuadro = (plan_sb.get('cuadros') or [])[ef['escena'] - 1] if ef['escena'] - 1 < len(plan_sb.get('cuadros') or []) else {}
        # Caras medidas SOLO en el tramo en que se ve esta gráfica, no en toda la escena (30-Oct: la suma de toda la escena tapaba
        # casi todo el cuadro en los planos cortos y se omitían 7 de 17 gráficas). Si la medición falla, va la de la escena.
        try:
            w0 = e['s0'] + max(0.0, t - e['ini'] - 0.1) * e['vel']; w1 = e['s0'] + (t + dur_ef + 0.1 - e['ini']) * e['vel']
            caras_t = caras_en(f'{d}/anim/e{ef["escena"]}.mp4', w0, w1, solo)
        except Exception:
            caras_t = caras[ef['escena']]
        logo_ahora = t < logo_t[1] + 0.15 and t + dur_ef > logo_t[0] - 0.15   # el lugar del logo se reserva solo mientras se ve (30-Oct)
        prohibido = caras_t + [b for b, t0, t1 in ocupado.get(ef['escena'], []) if t0 < t + dur_ef + 0.15 and t < t1 + 0.15] + ([LOGO_CAJA] if logo_ahora else []) + [(0, sub - 10, 720, sub + 125)]
        # 29-Oct (bidones: 5 de 6 efectos se omitían sin aviso): primero las alturas preferidas y después toda la franja segura
        # (de 96 px a 880 px, cada 30), en el centro y a los costados. Nunca tapa caras, subtítulos, rótulos ni el logo.
        pref = (150, 260) if cuadro.get('muestra_producto') else (300, 180, 420, 700, 560)
        # Cada 10 px y con más posiciones horizontales (30-Oct, espejo: entre el rótulo y las caras quedaba una franja libre de
        # 140 px y la grilla de 30 px la salteaba; se omitían 7 de 17 gráficas).
        ys = list(pref) + [y for y in range(96, 880 - h + 1, 10) if y not in pref]
        xs = list(dict.fromkeys([round(360 - w / 2), 40, 680 - w] + list(range(40, 680 - w + 1, 40))))
        pos = [(x, y) for y in ys for x in xs]
        # Flecha: el rótulo va AL LADO del producto, a su altura, con la punta hacia él. Ancho real: ~21 px por letra + relleno +
        # la flecha de 126 px (con los 420 fijos, un texto de 17 letras medía 520 y la punta se salía de lo reservado).
        pc = prod_caja.get(ef['escena'])
        lado = None; xy = None; k = 1
        if tipo == 'flecha':
            w = max(300, len(ef.get('txt') or '') * 21 + 38 + 126)
            if pc:
                cy = (pc[1] + pc[3]) / 2
                for kk in (1, 0.75, 0.6):
                    wk, hk = round(w * kk), round(h * kk)
                    yk = round(min(880 - hk, max(96, cy - hk / 2)))
                    for ld, xk in (('izq', pc[0] - wk - 4), ('der', pc[2] + 4)):
                        if xk >= 8 and xk + wk <= 712 and not choca((xk, yk, xk + wk, yk + hk), prohibido):
                            xy, lado, k = (xk, yk), ld, kk; break
                    if xy: w, h = wk, hk; break
            if xy is None: w = max(180, w - 126)   # sin lugar al lado del producto, o sin saber dónde está: rótulo solo, sin flecha
        # Ninguna gráfica tapa el producto si hay otro lugar (el producto es lo que se vende); si no hay, vale la regla de siempre.
        if xy is None and pc:
            xy = next(((x, y) for x, y in pos if y + h <= 880 and not choca((x, y, x + w, y + h), prohibido + [pc])), None)
        if xy is None and not pc:
            xy = next(((x, y) for x, y in pos if y + h <= 880 and not choca((x, y, x + w, y + h), prohibido)), None)
        # Si no entra a tamaño normal, se prueba achicada (75 % y 60 %) antes de omitirla (30-Oct, espejo: las gráficas grandes no
        # cabían en los planos cerrados). Se achica con zoom de CSS en la plantilla; las animaciones de GSAP no se tocan.
        if xy is None and tipo not in ('ondas', 'reloj'):
            # Achicada, primero sin tapar el producto y recién después tapándolo (10-Nov, espejo de Lemirk: la lista de tildes achicada
            # cayó sobre el espejo habiendo lugar al costado, porque al achicar ya no se miraba la caja del producto).
            # Con el producto ubicado, una gráfica que solo entra tapándolo no va: el clip sale sin ella (el revisor final frena un
            # rótulo sobre el producto, y un clip terminado vale más que una lista de tildes).
            for veda in ([prohibido + [pc]] if pc else [prohibido]):
                for k in (0.75, 0.6):
                    wk, hk = round(w * k), round(h * k)
                    xs_k = list(dict.fromkeys([round(360 - wk / 2), 40, 680 - wk] + list(range(40, 680 - wk + 1, 40))))
                    xy = next(((x, y) for y in range(96, 880 - hk + 1, 10) for x in xs_k if not choca((x, y, x + wk, y + hk), veda)), None)
                    if xy: w, h = wk, hk; break
                if xy: break
        if xy is None: print(f'efecto {tipo} de la escena {ef["escena"]}: no entra sin tapar nada ni achicada, se omite · {w}x{h} · ocupado: {[tuple(round(v) for v in b) for b in prohibido + ([pc] if pc else [])]}'); continue
        x, y = xy; ocupado.setdefault(ef['escena'], []).append(((x, y, x + w, y + h), t, t + dur_ef))
        base = {'tipo': tipo, 't': t, 'd': dur_ef, 'x': x, 'y': y}
        if k != 1: base.update(zoom=k, x=round(x / k), y=round(y / k))   # con zoom, left/top se escalan: se dividen
        # La plantilla ya escribe «PASO n»: si el plan lo repite en el texto («PASO 1 · A LA PARED»), salía el 1 dos veces (05-Nov).
        if tipo == 'paso': base.update(n=ef.get('n') or 1, txt=re.sub(r'^\s*PASO\s*\d+\s*[·:.\-–]?\s*', '', ef.get('txt') or '', flags=re.I))
        elif tipo == 'checks': base.update(items=(ef.get('items') or [])[:3])
        elif tipo == 'contador': base.update(hasta=max(2, min(9, int(ef.get('hasta') or 3))), txt=ef.get('txt') or '')
        elif tipo == 'sello': base.update(txt=ef.get('txt') or '¡LISTO!')
        elif tipo == 'timer': desde = max(3, min(10, int(ef.get('desde') or 5))); base.update(desde=desde, paso=round(dur_ef / (desde + 1), 3), txt=ef.get('txt') or '')
        elif tipo == 'brillo': base.update(txt=ef.get('txt') or '')
        elif tipo == 'flecha': base.update(txt=ef.get('txt') or '', **({'lado': lado} if lado else {'sin_flecha': True}))
        elif tipo in ('palabra', 'bateria'): base.update(txt=ef.get('txt') or '')
        elif tipo == 'barra': base.update(txt=ef.get('txt') or '', pct=max(10, min(100, int(ef.get('pct') or 100))))
        elif tipo == 'versus': base.update(antes=ef.get('antes') or '', despues=ef.get('despues') or '')
        elif tipo == 'reloj': base.update(x=x + 80, y=y + 80, txt=ef.get('txt') or '', llenado=round(min(1.4, dur_ef - 0.3), 2))
        elif tipo == 'marcador': base.update(prueba=ef.get('txt') or '', nota=ef.get('nota') or '')
        elif tipo == 'ondas': base.update(x=x + 120, y=y + 120, r=40, n=3, ruido=bool(ef.get('ruido')))
        fx.append(base)
    chips = [{k: v for k, v in c.items() if k not in ('escena', 'alto', 'x1', 'ancho')} for c in chips]
    o = plan['outro']
    cfg = {'reel': REEL, 'od': outro, 'cuts': cuts, 'words': 'edicion/words.json',
           'enfasis': {re.sub(r'[^a-z0-9ñ]', '', w.lower()): True for w in plan.get('enfasis', [])},
           'emojis': {}, 'subs_top': subs_top, 'chips': chips,
           'fx': fx + [{'tipo': 'punch', 't': round(REEL - 0.6, 2), 'd': 0.6, 's': 1.2, 'ox': 50, 'oy': 42}],
           'logo_t': logo_t,
           'outro': {**o, 'marca': marca['marca_outro']}}
    # Cierre con emoción (Diego, 29-Oct): el último cuadro de la historia congelado de fondo, la frase de cierre palabra por palabra
    # al ritmo de la voz, el logo grande con su animación, la foto del producto y la música que sube. Los tiempos de cada palabra
    # salen de la transcripción de la toma del cierre (como los subtítulos).
    # Apagado hasta que Diego lo apruebe (29-Oct: «no abriría la puerta hasta no validar que el logo quede bien y el cierre
    # quede bien»): se prende con CLIPS_CIERRE_V2=1 para la prueba, o con «cierre_v2»: true en la marca cuando esté aprobado.
    # Cierre v2 aprobado por Diego para todas las marcas (29-Oct, video de los bidones). Una marca puede volver al viejo con
    # "cierre_v2": false, y CLIPS_CIERRE_V2=0 lo apaga para una prueba.
    CIERRE_V2 = os.environ.get('CLIPS_CIERRE_V2', '1') != '0' and marca.get('cierre_v2', True) is not False
    ci = next((f for f in frases if f['escena'] == 'cierre'), None)
    if ci and CIERRE_V2:
        pal = [{'t': w['t'], 's': w['s']} for w in subtitulos([{**ci, 'escena': 0}])]
        # El logo ya dice la marca: el título no la repite (Diego, 30-Oct: «no reiteremos»). La voz sí la dice.
        nom = re.sub(r'^TIENDA OFICIAL\s+', '', str(marca.get('marca_outro') or ''), flags=re.I) or str(es.get('nombre_marca') or '')
        tok = [re.sub(r'[^\w]', '', t, flags=re.U).lower() for t in nom.split()]
        k = 0
        while k < len(tok) and k < len(pal) and re.sub(r'[^\w]', '', pal[k]['t'], flags=re.U).lower() == tok[k]: k += 1
        if tok and k == len(tok) and k < len(pal): pal = pal[k:]
        cfg['cierre'] = {'palabras': pal,
                         'logo_anim': marca.get('logo_anim') or ['ondas', 'foco', 'carta', 'sello', 'glitch', 'cortina', 'trazo'][sum(map(ord, os.path.basename(os.path.normpath(d)))) % 7]}
    json.dump(cfg, open(f'{D}/config.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    shutil.copy(f'{AQUI}/../{marca["plantilla"]}', f'{D}/build.mjs')
    # Identidad de la esencia (Diego, 30-Oct): el color principal y el de acento que cargó la marca mandan sobre el color
    # medido del logo; el principal solo si el blanco encima se lee (contraste >= 3, texto grande).
    es = pedido.get('esencia') or {}
    col = es.get('colores') or {}
    def _hex(v):
        v = str(v or '').strip()
        return v if re.fullmatch(r'#[0-9a-fA-F]{6}', v) else None
    def _contraste_blanco(hx):
        f = lambda c: (c / 255) / 12.92 if c / 255 <= 0.03928 else (((c / 255) + 0.055) / 1.055) ** 2.4
        r, g, b = (int(hx[i:i + 2], 16) for i in (1, 3, 5))
        return 1.05 / (0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) + 0.05)
    m1 = _hex(col.get('primario'))
    if m1 and _contraste_blanco(m1) >= 3: marca['acento'] = m1
    # --m2 lleva texto blanco encima (el número del paso, la tilde de los checks): tiene que contrastar con el blanco. Sin acento
    # usable en la esencia va un casi negro (30-Oct, Herramental Babilonia: con el blanco de respaldo los números no se veían).
    m2 = next((c for c in (_hex(col.get('acento')), _hex(col.get('secundario'))) if c and _contraste_blanco(c) >= 2.5), '#1d1d1f')
    if marca.get('acento'):   # el rojo Veoquiero de la plantilla pasa a ser el color de la marca
        h = marca['acento'].lstrip('#'); rgb = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
        tinte = lambda k: '#' + ''.join(f'{round(255 - (255 - v) * k):02x}' for v in rgb)   # k = cuánto color sobre el blanco
        # también los anillos y el fondo rosado del cierre (27-Oct, CHAN'S: el cierre salía rosa Veoquiero con logo azul)
        b = (open(f'{D}/build.mjs', encoding='utf8').read().replace('#E61B1F', marca['acento'])
             .replace('230,27,31', ','.join(map(str, rgb))).replace('#fff6f6', tinte(0.04)).replace('#fde3e3', tinte(0.12)))
        open(f'{D}/build.mjs', 'w', encoding='utf8').write(b)
    b = open(f'{D}/build.mjs', encoding='utf8').read()
    open(f'{D}/build.mjs', 'w', encoding='utf8').write(b.replace('#E61B1E', m2))   # --m2: el acento de la esencia
    if not os.path.isdir(f'{D}/motion'):
        run([_bin('hyperframes'), 'init', 'motion', '--video', 'edicion/corte.mp4', '--non-interactive'], cwd=D)
    shutil.copy(f'{E}/corte.mp4', f'{D}/motion/corte.mp4')
    for f in [f'{A}/grano.png', *marca['assets']]: shutil.copy(f, f'{D}/motion/')
    # cierre: el último cuadro de la historia, la foto del producto y el logo en alta si la marca lo tiene
    run(['ffmpeg', '-y', '-loglevel', 'error', '-sseof', '-0.15', '-i', f'{E}/corte.mp4', '-frames:v', '1', '-q:v', '2', f'{D}/motion/ultimo.jpg'])
    if os.path.exists(f'{d}/angulos/a1.jpg'): shutil.copy(f'{d}/angulos/a1.jpg', f'{D}/motion/producto.jpg')
    hd = next((p for p in [marca.get('logo_hd'), *glob.glob(os.path.join(os.path.dirname(marca['assets'][0]), 'logo-hd.png'))] if p and os.path.exists(p)), None) if marca.get('assets') else None
    if hd: shutil.copy(hd, f'{D}/motion/logo-hd.png')
    # Logo en bloque (Diego, 29-Oct: «separar Venti y Maku en dos líneas, que quede más cuadrado»): si la marca tiene
    # logo-cuadrado.png, va en el cierre y, centrado en un cuadrado, en la tarjeta de la mitad del clip, donde el apaisado
    # quedaba chiquito.
    cuad = os.path.join(os.path.dirname(marca['assets'][0]), 'logo-cuadrado.png') if marca.get('assets') else None
    if cuad and os.path.exists(cuad):
        from PIL import Image
        shutil.copy(cuad, f'{D}/motion/logo-hd.png')
        lg = Image.open(cuad).convert('RGBA'); lado = max(lg.size)
        sq = Image.new('RGBA', (lado, lado), (255, 255, 255, 0)); sq.paste(lg, ((lado - lg.width) // 2, (lado - lg.height) // 2), lg)
        for n in ('logo-sq-abierto.png', 'logo-sq-cerrado.png'): sq.save(f'{D}/motion/{n}')
    run(['node', 'build.mjs', 'config.json'], cwd=D)
    marca_en_html(f'{D}/motion/index.html', es, f'{D}/motion')
    fondo_logo(f'{D}/motion', marca.get('acento'), _contraste_blanco)
    if marca.get('logo_sin_tarjeta'): logo_sin_tarjeta(f'{D}/motion')
    for f in glob.glob(f'{D}/motion/renders/*.mp4'): os.remove(f)
    run([_bin('hyperframes'), 'render', '--quality', 'high'], cwd=f'{D}/motion')
    ren = sorted(glob.glob(f'{D}/motion/renders/*.mp4'))[-1]
    # 4. mezcla: voz + música con sidechain + efectos, -14 LUFS
    ev = [('pop', 0.2)] + [('whoosh', c - 0.08) for c in cuts] + [('pop', p['t'] + 0.05) for p in fx] + [('boom', cfg['logo_t'][0]), ('boom', REEL)]
    sfx = {'whoosh': (f'{A}/whoosh.wav', 0.14), 'pop': (f'{A}/pop.wav', 0.22), 'boom': (f'{A}/boom.wav', 0.3)}
    ins = ['-i', ren, '-i', f'{D}/voz.wav', '-i', marca['musica']]
    # La música baja a la mitad mientras se dice la marca (24-Oct, máscara de zombie: con la música entera el control oyó
    # «tienda oficial de Oquiero»; la toma sola dice «VeoQuiero»).
    ci = next((f for f in frases if f['escena'] == 'cierre'), None)
    baja = f",volume=0.5:enable='between(t,{ci['t'] - 0.2:.2f},{ci['t'] + ci['dur'] + 0.2:.2f})'" if ci else ''
    # ...y apenas termina la frase, la música SUBE hasta el final en vez de apagarse (Diego, 29-Oct: «la música sube»).
    sube = f",volume=1.6:enable='between(t,{ci['t'] + ci['dur'] + 0.2:.2f},{total:.2f})'" if ci and CIERRE_V2 else ''
    fc = [f'[2:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{total},volume={gm:.2f}dB{baja}{sube},afade=t=out:st={total - 0.45:.2f}:d=0.45[mus]',
          '[1:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[voz][vsc]',
          '[mus][vsc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=250[musd]']
    lab = ['[voz]', '[musd]']
    for i, (n, t) in enumerate(ev):
        f, v = sfx[n]; ins += ['-i', f]
        fc.append(f'[{3 + i}:a]aresample=48000,aformat=channel_layouts=stereo,volume={v},adelay={int(max(0, t) * 1000)}:all=1[s{i}]'); lab.append(f'[s{i}]')
    fc.append(''.join(lab) + f'amix=inputs={len(lab)}:normalize=0:duration=first,atrim=0:{total},loudnorm=I=-14:TP=-1.5:LRA=9[o]')
    run(['ffmpeg', '-y', '-loglevel', 'error', *ins, '-filter_complex', ';'.join(fc), '-map', '0:v', '-map', '[o]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', str(total), OUT])
    V = marca.get('velocidad', 1.13)
    # El cierre NO se acelera (Diego, 29-Oct: «la voz no es chilena, es argentina»: la toma D, apurada un 13 %, perdía la
    # cadencia chilena). Se acelera la historia hasta REEL y el cierre queda a velocidad real.
    fc_v = (f'[0:v]split[h][c];[h]trim=0:{REEL},setpts=(PTS-STARTPTS)/{V}[hv];[c]trim={REEL},setpts=PTS-STARTPTS[cv];'
            f'[0:a]asplit[ha][ca];[ha]atrim=0:{REEL},asetpts=PTS-STARTPTS,atempo={V}[hav];[ca]atrim={REEL},asetpts=PTS-STARTPTS[cav];'
            f'[hv][hav][cv][cav]concat=n=2:v=1:a=1[v][a]')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', OUT, '-filter_complex', fc_v,
         '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', OUT + '.v.mp4'])
    os.replace(OUT + '.v.mp4', OUT)
    # carátula (Diego, 18-Oct; olvidada en el clip v2 del 23-Oct): cuadro de la historia + foto real del producto + logo +
    # pregunta gancho sobre franja de color, con el contraste medido. Es el primer cuadro y la miniatura.
    man = json.load(open(f'{d}/paneles/manifest.json', encoding='utf8'))
    car = plan['caratula']; CAR = f'{D}/caratula.png'
    mc = dict(marca['caratula'])
    if marca.get('logo_sin_tarjeta'):
        if recortar_blanco(mc['logo'], f'{D}/logo-recortado.png'): mc['logo'] = f'{D}/logo-recortado.png'
        os.environ['LOGO_SIN_TARJETA'] = '1'
    run(['python', f'{AQUI}/caratula.py', f'{d}/{man[car["cuadro"] - 1]["archivo"]}', f'{d}/{car["foto"]}', car['pregunta'], car['nombre'],
         CAR, mc['logo'], ','.join(str(x) for x in mc.get('color', [176, 18, 23]))])
    run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-t', '0.6', '-i', CAR, '-f', 'lavfi', '-t', '0.6', '-i', 'anullsrc=r=48000:cl=stereo',
         '-i', OUT, '-filter_complex', '[0:v]scale=720:1280,fps=30,setsar=1,format=yuv420p[cv];[2:v]fps=30,setsar=1,format=yuv420p[mv];[cv][1:a][mv][2:a]concat=n=2:v=1:a=1[v][a]',
         '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', OUT + '.c.mp4'])
    os.replace(OUT + '.c.mp4', OUT)
    lu = lambda: float(re.findall(r'I:\s+(-?[\d.]+) LUFS', subprocess.run(['ffmpeg', '-i', OUT, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr)[-1])
    for _ in range(2):
        g = -14 - lu()
        if abs(g) <= 0.2: break
        run(['ffmpeg', '-y', '-loglevel', 'error', '-i', OUT, '-c:v', 'copy', '-af', f'volume={g:.2f}dB,alimiter=limit=0.88:level=false', '-c:a', 'aac', '-b:a', '192k', OUT + '.t.mp4'])
        os.replace(OUT + '.t.mp4', OUT)
    print(json.dumps({'salida': OUT, 'reel': REEL, 'lufs': lu(), 'huecos_max': max(huecos or [0])}, ensure_ascii=False))

if __name__ == '__main__':
    main(sys.argv[1])
