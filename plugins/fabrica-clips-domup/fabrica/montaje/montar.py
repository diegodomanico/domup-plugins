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
            a, b = ws[0]['s'], ws[-1]['e']; tot = sum(len(x) for x in plan_t); acc = 0; tiempos = []
            for x in plan_t:
                t0 = a + (b - a) * acc / tot; acc += len(x); tiempos.append((t0, a + (b - a) * acc / tot))
        for (t0, t1), tx in zip(tiempos, plan_t):
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
    if (esencia or {}).get('variante_idioma') == 'tuteo':   # botones del cierre en tú (VentiMaku: «Voseo: siempre tuteo»)
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

def main(d):
    plan = json.load(open(f'{d}/anim-plan.json', encoding='utf8'))
    frases = json.load(open(f'{d}/voz/manifest.json', encoding='utf8'))
    pedido = json.load(open(f'{d}/pedido.json', encoding='utf8'))
    # La identidad la elige el worker (lib/marca-auto.mjs): hecha a mano en marcas/ o armada sola con el logo y la esencia.
    marca = json.load(open(os.environ.get('MARCA_JSON') or f'{AQUI}/../marcas/{pedido["cust_id"]}.json', encoding='utf8'))
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
    esc = linea_de_tiempo(plan, frases, dv, tramos)
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
    for i, f in enumerate(frases):
        ins += ['-i', f'{d}/{f["archivo"]}']
        ini = f.get('voz_ini', 0); fin = ini + f['dur']   # tramo con voz medido en voces.mjs: se recorta acá, el archivo queda intacto
        fc.append(f'[{i}:a]atrim={ini}:{fin},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=0.015,afade=t=out:st={max(0, f["dur"] - 0.05):.3f}:d=0.05,adelay={int(f["t"] * 1000)}:all=1[v{i}]')
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
    medio_n = next((n for n in (4, 3, 5, 2) if n in ini and n not in con_chip), 4)
    medio = ini[medio_n]; logo_t = [round(medio['ini'] + 0.1, 2), round(medio['fin'] - 0.1, 2)]
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
        top = next((t for t in (150, 100, 250, 560, 480, 400, 330, 600, 760, 680, 40, 820) if not choca((x1, t, x1 + ancho, t + alto), prohibido)), None)
        if top is None: raise SystemExit(f'✗ escena {c["escena"]}: el chip «{c["txt"]}» no entra sin tapar una cara, el logo o los subtítulos')
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
        if y is None: raise SystemExit(f'✗ escena {p["escena"]}: la placa de {p["personaje"]} no entra sin tapar una cara o un rótulo')
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
        t = round(min(e['fin'] - 0.6, e['ini'] + max(0.1, float(ef.get('en') or 0.3))), 2); dur_ef = round(max(0.8, min(2.4, e['fin'] - t - 0.15)), 2)
        # Con 2 o 3 gráficas por escena, cada una termina cuando arranca la siguiente de esa escena (así pueden compartir lugar).
        sig = [round(min(e['fin'] - 0.6, e['ini'] + max(0.1, float(o.get('en') or 0.3))), 2) for o in plan.get('efectos', [])
               if o is not ef and o.get('escena') == ef.get('escena') and o.get('tipo') not in ('punch', 'sacudida')]
        sig = [x for x in sig if x > t + 0.5]
        if sig: dur_ef = round(max(0.7, min(dur_ef, min(sig) - t - 0.1)), 2)
        tipo = ef.get('tipo')
        if tipo == 'punch': fx.append({'tipo': 'punch', 't': t, 'd': 0.6, 's': 1.15, 'ox': 50, 'oy': 45}); continue
        if tipo == 'sacudida': fx.append({'tipo': 'sacudida', 't': t, 'x': 360, 'y': 640, 'r': 150}); continue
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
        xy = next(((x, y) for x, y in pos if y + h <= 880 and not choca((x, y, x + w, y + h), prohibido)), None)
        # Si no entra a tamaño normal, se prueba achicada (75 % y 60 %) antes de omitirla (30-Oct, espejo: las gráficas grandes no
        # cabían en los planos cerrados). Se achica con zoom de CSS en la plantilla; las animaciones de GSAP no se tocan.
        k = 1
        if xy is None and tipo not in ('ondas', 'reloj'):
            for k in (0.75, 0.6):
                wk, hk = round(w * k), round(h * k)
                xs_k = list(dict.fromkeys([round(360 - wk / 2), 40, 680 - wk] + list(range(40, 680 - wk + 1, 40))))
                xy = next(((x, y) for y in range(96, 880 - hk + 1, 10) for x in xs_k if not choca((x, y, x + wk, y + hk), prohibido)), None)
                if xy: w, h = wk, hk; break
        if xy is None: print(f'efecto {tipo} de la escena {ef["escena"]}: no entra sin tapar nada ni achicada, se omite · {w}x{h}'); continue
        x, y = xy; ocupado.setdefault(ef['escena'], []).append(((x, y, x + w, y + h), t, t + dur_ef))
        base = {'tipo': tipo, 't': t, 'd': dur_ef, 'x': x, 'y': y}
        if k != 1: base.update(zoom=k, x=round(x / k), y=round(y / k))   # con zoom, left/top se escalan: se dividen
        if tipo == 'paso': base.update(n=ef.get('n') or 1, txt=ef.get('txt') or '')
        elif tipo == 'checks': base.update(items=(ef.get('items') or [])[:3])
        elif tipo == 'contador': base.update(hasta=max(2, min(9, int(ef.get('hasta') or 3))), txt=ef.get('txt') or '')
        elif tipo == 'sello': base.update(txt=ef.get('txt') or '¡LISTO!')
        elif tipo == 'timer': desde = max(3, min(10, int(ef.get('desde') or 5))); base.update(desde=desde, paso=round(dur_ef / (desde + 1), 3), txt=ef.get('txt') or '')
        elif tipo == 'brillo': base.update(txt=ef.get('txt') or '')
        elif tipo in ('flecha', 'palabra', 'bateria'): base.update(txt=ef.get('txt') or '')
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
        run(['hyperframes', 'init', 'motion', '--video', 'edicion/corte.mp4', '--non-interactive'], cwd=D, shell=True)
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
    for f in glob.glob(f'{D}/motion/renders/*.mp4'): os.remove(f)
    run(['hyperframes', 'render', '--quality', 'high'], cwd=f'{D}/motion', shell=True)
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
    mc = marca['caratula']
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
