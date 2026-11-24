# PRE-VUELO shorts-mtl: arma los prompts de panel y de animacion con las reglas del historial YA METIDAS,
# y rechaza (lint) cualquier prompt que no las traiga. La falla se evita en el prompt, no se caza en la revision.
#
# Uso:
#   python prevuelo.py <biblia.json>                 -> escribe <carpeta>/prompts.json y muestra el resumen
#   python prevuelo.py <biblia.json> --lint "<texto>" -> chequea un prompt escrito a mano (tipo panel|animacion con --tipo)
#
# La biblia (ver plantillas/biblia.json) declara: producto (medidas reales de la ficha), personas (cara del retrato +
# vestuario por situacion), fondo (objetos que no se tocan), y las escenas (panel y animacion de cada una).
import json, sys, os, re

# --- Reglas: cada una sale de una o mas filas REPETIDAS de assets/historial-rechazos.md ---------------------------
def r_vestuario(b, esc):
    out = []
    for p in esc.get('personas', []):
        per = b['personas'][p]; sit = esc.get('situacion', 'default')
        ropa = per['vestuario'].get(sit) or per['vestuario']['default']
        out.append(f"{p.upper()} = the person in the {p} portrait: SAME face and hair as the portrait, wearing {ropa}.")
    return ' '.join(out)

def r_escala(b, esc):
    pr = b['producto']
    if not esc.get('producto_en_cuadro', True): return ''
    return (f"SCALE: the {pr['nombre_en']} is small and real-sized: {pr['medidas_en']}. "
            f"{pr['referencia_escala_en']} It keeps exactly this size in every frame; never bigger.")

def r_fondo(b, esc):
    objs = ', '.join(b['fondo']['objetos_fijos_en'])
    return f"Keep the background objects untouched and identical ({objs}). Do not add lamps, cables or any new object."

def r_producto_estado(b, esc):
    st = esc.get('estado_producto')
    return f"The {b['producto']['nombre_en']}: {b['producto']['estados_en'][st]}" if st else ''

def r_optica(b, esc):
    if not b['producto'].get('emite_luz') or not esc.get('producto_encendido'): return ''
    return ("PHYSICS: in a real room the projector light is invisible in the air: NO light cone, NO rays, only a faint glow at the lens. "
            "The lens points exactly at the centre of the projected picture.")

def r_texto(b, esc): return 'No text, no captions, no extra logos, no other people.'

def r_camara(b, esc):
    return 'STATIC LOCKED-OFF CAMERA: no zoom, no pan, no push-in, single continuous shot, NO cuts.'

def r_producto_quieto(b, esc):
    if esc.get('accion_producto'):
        return (f"The {b['producto']['nombre_en']} only does this: {esc['accion_producto']} It KEEPS EXACTLY ITS SIZE and "
                "shape the whole time; only the moving part moves.")
    return f"The {b['producto']['nombre_en']} is completely still: no part of it moves, it never changes size, shape or place."

def r_mirada(b, esc):
    return 'She/he keeps the eyes open looking straight into the camera the whole shot.' if esc.get('a_camara') else ''

def r_sin_habla(b, esc): return 'Nobody speaks (voice-over): mouths closed or smiling, no eating.'

def r_manos(b, esc):
    return ('Hands really touch what they hold (real contact, correct number of fingers, realistic hand size against the '
            'product); fingers never touch the lens glass.') if esc.get('mano_en_producto') else ''

def r_audio(b, esc): return 'AUDIO: NO voice, NO speech, NO music: only quiet room tone and soft foley.'

def r_origen(b, esc):
    # Veoquiero 18-Oct: la luz de la linterna salía de una "manguera" inventada y la bomba casi no se veía.
    ef = esc.get('efecto_producto')
    if not ef: return ''
    return (f"The {ef} comes ONLY from the {b['producto']['nombre_en']} itself (its own built-in part); no separate hose, "
            "wand, cable or invented accessory produces it, and the product stays clearly visible in the frame.")

PANEL = [r_vestuario, r_escala, r_producto_estado, r_fondo, r_optica, r_manos, r_origen, r_texto]
ANIM = [r_camara, r_producto_quieto, r_escala, r_vestuario, r_fondo, r_optica, r_manos, r_origen, r_mirada, r_sin_habla, r_audio, r_texto]

# Chequeos condicionales del lint, también para prompts escritos a mano (Veoquiero 18-Oct):
#  - si alguien sostiene el producto, tiene que estar pedido el contacto real (la bomba flotaba sobre la palma)
#  - si el producto da luz/aire/agua, tiene que estar dicho que sale SOLO del producto
COND = [(r'(?i)switched[- ]off', r'(?i)(does not light up|do not light up|stays? (completely )?(switched off and dark|dark))', 'producto con luz APAGADO: decir que NO se enciende y queda oscuro todo el tiempo (ICAS espejo s2: el LED se prendió solo a mitad de escena)'),
        (r'(?i)\b(balloons?|banner|garland|bunting|cake topper|poster|signs?)\b', r'(?i)\b(plain|no print|without (any )?print)\b', 'globos, banderines o carteles: pedirlos LISOS, sin impresión (ep15: los globos salieron con «HAPPY BIRTHDAY» impreso)'),
        (r'(?is)^(?=.*\bponytail\b)(?=.*\b(cap|hood|helmet|mask|beanie)\b)(?=.*\b(put\w* (it )?on|pull\w* (it )?(on|over|back|down)|about to put)\b)', r'(?i)\b(bun|tucked|no ponytail)\b', 'se pone algo en la cabeza y hay colita: pedir el pelo en rodete o adentro (ep11 s2: la colita salía por arriba del gorro)'),
        (r'(?i)\b(mask|glove|hood|balaclava|costume|sleeve|cap)\b[\s\S]*\b(pull\w*|put\w* on|tak\w* off|over (his|her) head)\b', r'(?i)\bintact\b', 'producto que se pone o se saca: pedir que quede INTACTO (sin cortes ni costuras abiertas)'),
        (r'(?i)\b(holds?|holding|palm|in (his|her) hand)\b', r'(?i)\b(touch|rest|grip)\w*', 'falta el contacto real mano-producto (no flotar)'),
        (r'(?i)\b(flashlight|led light|torch|air hose|nozzle|spray)\b', r'(?i)comes only from', 'falta decir que el efecto sale SOLO del producto'),
        # Veoquiero 18-Oct (s3/s4/s5): boquilla suelta, aguja saliendo del cuerpo, LED en el canto equivocado, escala
        (r'(?i)\bpump\b[\s\S]*\b(nozzle|needle|valve)\b', r'(?i)(end|tip) of (its|the pump.s) own (black )?hose', 'la boquilla/aguja tiene que ser la PUNTA de la manguera de la bomba, no algo suelto'),
        (r'(?i)\b(flashlight|led|torch)\b', r'(?i)\b(top|front|bottom|side) (end|face)\b|\bon the (top|front|back|side)\b', 'falta decir DONDE esta la luz en el producto (mirar la foto real)'),
        # Diego 18-Oct (ep01 v3): el pico enroscado se movia en la valvula
        (r'(?i)\b(screw\w*|plugged|connected|inserted)\b|\battached\b(?! image)', r'(?i)(stays? rigid|does not wobble)', 'lo conectado tiene que quedar RIGIDO (no se mueve mientras trabaja)'),
        (r'(?i)\b(holds?|holding|palm|grip\w*)\b', r'(?i)(same (size|proportion) (in|to) the hand as (in )?(product photo|the first frame|the size reference)|half the height of (her|his) face|size of a (large )?(smartphone|dinner plate)|size of (her|his) shoe|as wide as (his|her|the man.s|an adult\w*( man.s)?) shoulders)', 'falta la escala contra la mano o la cara')]

# --- Lint: frases que TIENEN que estar (si aplican) y frases PROHIBIDAS -----------------------------------------------
OBLIG_PANEL = [('escala', r'(?i)scale|size'), ('fondo intacto', r'(?i)background objects untouched'), ('sin texto', r'(?i)no text')]
OBLIG_ANIM = [('camara fija', r'(?i)static locked-off camera'), ('sin cortes', r'(?i)no cuts'),
              ('tamaño fijo', r'(?i)(keeps exactly its size|never changes size)'), ('sin voz', r'(?i)no voice'),
              ('sin habla', r'(?i)nobody speaks')]
PROHIBIDO = [(r'(?i)\bre-?render\b', 'pedir "re-render" hace que Flow redibuje el objeto (cambia la geometria)'),
             (r'(?i)\b(light cone|cone of light|light beam|beam of light|rays of light|light rays)\b', 'pide un haz/cono de luz visible (en la realidad casi no se ve)'),
             (r'\b\d+(\.\d+)?\s?(cm|mm|m)\b', 'medidas en numeros: Flow dibuja cotas (usar referencia contra el cuerpo)'),
             (r'(?i)make (it|the \w+) (smaller|bigger|larger)', 'pedirle a Flow cambiar el tamaño no anda: se hace local'),
             (r'(?i)\bzoom (in|out)\b|(?<!\ba )(?<!\bthe )(?<!frying )(?<!\bhot )\bpan\b(?!\s*,)|push-in(?! ,)', 'movimiento de camara (salvo que este negado; «a pan» / «the pan» = sartén, no cuenta)')]

def lint(texto, tipo, esc=None, b=None):
    errs = []
    for nom, rx in (OBLIG_ANIM if tipo == 'animacion' else OBLIG_PANEL):
        if nom in ('escala', 'tamaño fijo') and esc is not None and not esc.get('producto_en_cuadro', True): continue
        if nom in ('sin voz', 'sin habla') and re.search(r'(?i)SPEAKS this line', texto): continue   # toma hablada (labios de Flow)
        if not re.search(rx, texto): errs.append(f'falta: {nom}')
    for gatillo, req, why in COND:
        if re.search(gatillo, texto) and not re.search(req, texto): errs.append(why)
    for rx, why in PROHIBIDO:
        for m in re.finditer(rx, texto):
            ctx = texto[max(0, m.start() - 25):m.end()]
            if re.search(r'(?i)\bno\b|never|not', ctx): continue   # esta negado: ok
            errs.append(f'prohibido "{m.group(0)}": {why}')
    if esc and b:
        for p in esc.get('personas', []):
            if p.upper() not in texto: errs.append(f'falta la persona {p} con su vestuario')
        if esc.get('a_camara') and tipo == 'animacion' and not re.search(r'(?i)into the camera', texto): errs.append('falta la mirada a camara')
    return errs

def armar(b):
    out = []
    for esc in b['escenas']:
        p = ' '.join(x for x in (esc['panel_en'], *[f(b, esc) for f in PANEL]) if x)
        a = ' '.join(x for x in (esc['animacion_en'], *[f(b, esc) for f in ANIM]) if x)
        e1, e2 = lint(p, 'panel', esc, b), lint(a, 'animacion', esc, b)
        out.append({'escena': esc['n'], 'panel': p, 'animacion': a, 'lint_panel': e1, 'lint_animacion': e2})
    return out

if __name__ == '__main__':
    if '--lint' in sys.argv:   # el lint de un prompt suelto no necesita biblia
        t = sys.argv[sys.argv.index('--lint') + 1]; tipo = sys.argv[sys.argv.index('--tipo') + 1] if '--tipo' in sys.argv else 'panel'
        e = lint(t, tipo); print('OK' if not e else '\n'.join('✗ ' + x for x in e)); sys.exit(1 if e else 0)
    b = json.load(open(sys.argv[1], encoding='utf8'))
    res = armar(b); dst = os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), 'prompts.json')
    json.dump(res, open(dst, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    malos = 0
    for r in res:
        ok = not r['lint_panel'] and not r['lint_animacion']; malos += not ok
        print(f"escena {r['escena']}: {'OK' if ok else 'RECHAZADO'}  (panel {len(r['panel'])} car · animacion {len(r['animacion'])} car)")
        for x in r['lint_panel']: print('   panel ✗', x)
        for x in r['lint_animacion']: print('   anim  ✗', x)
    print(f'-> {dst}'); sys.exit(1 if malos else 0)
