# Compone el carrusel de fotos con elenco con medidas FIJAS pensadas para el celular (Diego, 29-Oct-2026: «el logo está mal,
# está desproporcionado, no se lee… las imágenes tienen que ser responsive, pensadas para celular, sobre todo por las letras y
# los tamaños»). Antes cada corrida escribía su propio compositor y salió: el logo como un recorte de jpg chiquito dentro de una
# píldora blanca enorme, franjas borrosas a los costados para rellenar y titulares de 62 px.
#
# 31-Oct-2026 (Diego): todas las piezas en 9:16 y 2000 px de alto (1125 x 2000), y cada marca con su kit visual: sus letras, sus
# colores y sus íconos (sets/marcas/<cust>/kit-visual.json, íconos Lucide recoloreados por lib/kit-visual.mjs). Sin kit, se usa
# Segoe y el color que llega por argumento, como antes.
#
# Reglas de tamaño (una foto de la galería se ve en el celular a ~360 px de ancho, o sea a 0,32x):
#   - titular: mínimo 7 % del ancho (~25 px en el celular), máximo 2 renglones, franja del color de la marca a 7:1 con el blanco;
#   - íconos: 12 % del ancho con su texto al lado, como mucho 3 por pieza;
#   - logo: placa blanca FIJA de 30 % x 13 % del ancho, arriba al centro, el logo adentro sin deformarse (v2, 31-Oct);
#   - sin firma chica (no se leía en el celular);
#   - la foto base se recorta para LLENAR el cuadro (cover), nunca se rellena con bordes borrosos.
# Entrada: carrusel.json en la carpeta del pedido:
#   [{"n":"02","base":"crudo/x.png","titular":"…","tipo":"foto"|"portada"|"medidas"|"specs"|"pasos",
#     "iconos":[{"icono":"calor","txt":"6 niveles"},…] (opcional, hasta 3: conceptos del kit),
#     "datos":{"Alto":"80 cm",…} (medidas y specs), "bases":["a.png","b.png","c.png"], "pasos":["…","…","…"] (pasos)}]
# Uso: python componer_fotos.py <carpeta> <logo.png> <color_hex> <nombre_marca> [<kit.json> <carpeta de íconos>]
import json, os, sys, unicodedata
from PIL import Image, ImageDraw, ImageFont, ImageFilter

DIR, LOGO, COLOR, MARCA = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
KIT = json.load(open(sys.argv[5], encoding='utf-8')) if len(sys.argv) > 5 and os.path.exists(sys.argv[5]) else None
ICONOS = sys.argv[6] if len(sys.argv) > 6 else None
W, H = 1125, 2000            # 9:16 vertical, 2000 px de alto (todas, también la portada)
SEGOE_B = next((f for f in ('C:/Windows/Fonts/segoeuib.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf') if os.path.exists(f)), 'DejaVuSans-Bold.ttf')
SEGOE_R = next((f for f in ('C:/Windows/Fonts/segoeui.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf') if os.path.exists(f)), 'DejaVuSans.ttf')

def hexrgb(h): return tuple(int(h.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))
rgb = hexrgb(KIT['colores']['marca']) if KIT else hexrgb(COLOR)
apoyo = hexrgb(KIT['colores'].get('apoyo', '#F3F3F6')) if KIT else (243, 243, 246)
texto_osc = hexrgb(KIT['colores'].get('texto', '#1F1F2A')) if KIT else (31, 31, 42)

def fuente(rol, size):
    if KIT and rol in KIT.get('fuentes', {}):
        fz = KIT['fuentes'][rol]
        f = ImageFont.truetype(fz['ruta'], size)
        try: f.set_variation_by_name(fz.get('peso', 'Bold'))
        except Exception:
            try: f.set_variation_by_name(fz.get('peso', 'Bold').encode())
            except Exception: pass
        return f
    return ImageFont.truetype(SEGOE_R if rol == 'texto' else SEGOE_B, size)

def lum(c):
    f = lambda v: (v / 255) / 12.92 if v / 255 <= 0.03928 else (((v / 255) + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
def contraste(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)
# la franja usa el color de la marca oscurecido hasta 7:1 con el blanco (texto chico en celular)
banda = rgb
while contraste(banda, (255, 255, 255)) < 7: banda = tuple(int(v * 0.9) for v in banda)

def cover(im, w, h, ay=0.3):
    # recorte para llenar; en vertical se guarda más la parte de arriba (ay=0.3) porque ahí están las caras
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, int((im.height - h) * ay)
    return im.crop((x, y, x + w, y + h))

def logo_placa(ancho_canvas):
    # el original en la mayor resolución que haya (29-Oct: el logo de 512 px agrandado salía pixelado)
    orig = os.path.join(os.path.dirname(LOGO), 'logo-original')
    compacto = KIT.get('logo_compacto_ruta') if KIT else None   # el del kit, sin leyendas que no se leen chicas (31-Oct)
    lg = Image.open(compacto if compacto and os.path.exists(compacto) else (orig if os.path.exists(orig) else LOGO)).convert('RGBA')
    bb = lg.getbbox()
    if bb: lg = lg.crop(bb)
    # si el logo trae fondo blanco liso, se lo saca para que no quede una caja dentro de otra
    px = lg.load(); w, h = lg.size
    esquinas = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    if all(c[3] > 200 and min(c[:3]) > 235 for c in esquinas):
        datos = [(r, g, b, 0) if min(r, g, b) > 238 else (r, g, b, a) for (r, g, b, a) in lg.getdata()]
        lg.putdata(datos); bb = lg.getbbox(); lg = lg.crop(bb) if bb else lg
    # 31-Oct v2 (Diego: «el logo debería ir al centro y siempre con las mismas proporciones»): placa de tamaño FIJO (30 % x 13 % del
    # ancho), opaca, y el logo entra adentro sin deformarse. Así mide igual en todas las piezas, sea cuadrado o apaisado.
    # v4 (01-Nov): arriba al centro sobre la foto, sin franja; caja algo más chica para no tapar el producto (~90 x 58 px a 360)
    pw, ph = int(ancho_canvas * 0.28), int(ancho_canvas * 0.18); pad = int(ancho_canvas * 0.008)
    s = min((pw - 2 * pad) / lg.width, (ph - 2 * pad) / lg.height)
    lg = lg.resize((max(1, round(lg.width * s)), max(1, round(lg.height * s))), Image.LANCZOS)
    placa = Image.new('RGBA', (pw, ph), (255, 255, 255, 0))
    d = ImageDraw.Draw(placa)
    d.rounded_rectangle((0, 0, pw - 1, ph - 1), radius=int(ph * 0.22), fill=(255, 255, 255, 255))
    placa.alpha_composite(lg, ((pw - lg.width) // 2, (ph - lg.height) // 2))
    return placa

def partir(d, texto, f, ancho):
    palabras, renglones, actual = texto.split(), [], ''
    for p in palabras:
        prueba = (actual + ' ' + p).strip()
        if d.textlength(prueba, font=f) <= ancho or not actual: actual = prueba
        else: renglones.append(actual); actual = p
    renglones.append(actual); return renglones

def ajustar_titular(texto):
    d = ImageDraw.Draw(Image.new('RGB', (10, 10)))
    # tamaño FIJO (0,1 del ancho, ~32 px a 360) en todas; si no entra en un renglón, va en dos al mismo tamaño
    size = int(W * 0.1)
    f = fuente('titular', size)
    rs = partir(d, texto, f, W * 0.88)[:2]
    lh = int(size * 1.12); pad = int(size * 0.3)
    alto = len(rs) * lh + 2 * pad + int(W * 0.07)    # lo que ocupa abajo: el texto, su aire y el margen inferior
    return f, rs, lh, pad, alto, size

# v4 (Diego, 01-Nov: «sacá el zócalo, que el logo vaya arriba al medio y que los textos se sobreimpriman sobre las imágenes con buen
# criterio… full imagen»): sin franja de color. La foto llena todo el cuadro; el logo va arriba al centro en su placa con sombra; el
# titular va abajo, en blanco, sobre un degradé oscuro SOLO detrás del texto, con la opacidad mínima que da 4,5:1 contra el 5 % más
# claro del fondo real (regla de CLAUDE.md, texto sobre foto). Arriba del titular, una rayita del color de la marca: la identidad
# que antes ponía la franja.

def logo_arriba(im):
    placa = logo_placa(W); x, y, info = elegir_lugar_logo(im, placa.width, placa.height)
    sombra = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sombra).rounded_rectangle((x, y + 8, x + placa.width, y + placa.height + 8), radius=int(placa.height * 0.22), fill=(0, 0, 0, 90))
    im.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(14)))
    im.alpha_composite(placa, (x, y))
    return info

def l95(region):
    # luminancia relativa del 5 % más claro (lo que manda en el contraste del texto blanco)
    g = sorted(lum(c) for c in region.convert('RGB').resize((120, max(1, region.height * 120 // max(1, region.width)))).getdata())
    return g[int(len(g) * 0.95)] if g else 0

def titular(im, texto, emoji=''):
    f, rs, lh, pad, alto, size = ajustar_titular(texto + ('  ' if emoji else ''))
    ty = H - alto + pad                    # arriba del primer renglón
    zona = (int(W * 0.04), ty - pad, W - int(W * 0.04), H - int(W * 0.05))
    alto_deg = alto + int(W * 0.30)       # el degradé arranca más arriba para que no se vea el corte
    for a in range(35, 96, 5):            # opacidad máxima del degradé, en %
        capa = Image.new('RGBA', (W, alto_deg), (0, 0, 0, 0)); dc = ImageDraw.Draw(capa)
        for yy in range(alto_deg):
            t = min(1, yy / (alto_deg - alto + pad))
            dc.line((0, yy, W, yy), fill=(0, 0, 0, int(255 * a / 100 * t * t * (3 - 2 * t))))
        prueba = im.copy(); prueba.alpha_composite(capa, (0, H - alto_deg))
        if (1.05 / (l95(prueba.crop(zona)) + 0.05)) >= 4.5: break
    im.alpha_composite(capa, (0, H - alto_deg))
    d = ImageDraw.Draw(im)
    bw = int(W * 0.12); d.rounded_rectangle(((W - bw) // 2, ty - int(W * 0.035), (W + bw) // 2, ty - int(W * 0.022)), radius=6, fill=rgb + (255,))
    fe = ImageFont.truetype(EMOJI, int(size * 0.9)); ew = int(d.textlength(emoji, font=fe)) + int(size * 0.25) if emoji else 0
    for i, r in enumerate(rs):
        if emoji and i == 0: r = r.rstrip()
        e = ew if i == 0 else 0
        x = (W - d.textlength(r, font=f) - e) / 2; y = ty + i * lh - int(size * 0.12)
        if e: d.text((x, y + int(size * 0.18)), emoji, font=fe, embedded_color=True)
        d.text((x + e + 2, y + 3), r, font=f, fill=(0, 0, 0, 120))
        d.text((x + e, y), r, font=f, fill=(255, 255, 255))
    return alto, size, a

def firma(im):
    d = ImageDraw.Draw(im); f = fuente('texto', int(W * 0.022))
    c = tuple(min(255, v + 90) for v in banda)
    d.text((W - d.textlength(MARCA, font=f) - int(W * 0.03), H - int(W * 0.022) - int(W * 0.018)), MARCA, font=f, fill=c)

def sin_tildes(t): return ''.join(c for c in unicodedata.normalize('NFD', str(t).lower()) if unicodedata.category(c) != 'Mn')

def icono(concepto, lado):
    if not ICONOS or not concepto: return None
    p = os.path.join(ICONOS, f'{sin_tildes(concepto)}.png')
    if not os.path.exists(p): return None
    return Image.open(p).convert('RGBA').resize((lado, lado), Image.LANCZOS)

def fila_iconos(im, items, y_base):
    # hasta 3 íconos con su texto, en tarjetas blancas apiladas arriba de la franja del titular (no tapan caras: van abajo)
    d = ImageDraw.Draw(im); lado = int(W * 0.14); f = fuente('texto', int(W * 0.066))   # cuerpo ≥ 21 px en el celular
    h = lado + int(W * 0.03); gap = int(W * 0.02); x = int(W * 0.05)
    items = [i for i in items if i.get('txt')][:3]
    y = y_base - len(items) * (h + gap)
    for it in items:
        ic = icono(it.get('icono'), lado)
        tw = d.textlength(str(it['txt']), font=f)
        w = (lado + int(W * 0.03) if ic else 0) + tw + int(W * 0.06)
        d.rounded_rectangle((x, y, x + w, y + h), radius=h // 2, fill=(255, 255, 255, 238))
        cx = x + int(W * 0.015)
        if ic: im.alpha_composite(ic, (cx, y + (h - lado) // 2)); cx += lado + int(W * 0.02)
        else: cx += int(W * 0.03)
        d.text((cx, y + (h - int(W * 0.066)) // 2 - int(W * 0.016)), str(it['txt']), font=f, fill=texto_osc)
        y += h + gap

def chips(im, datos, alto_banda):
    # medidas (v2b): tarjetas en grilla de 2 columnas ABAJO, arriba de la franja del titular (el 25 % de abajo queda libre por la
    # regla R5), para no pisar el producto (31-Oct: la tarjeta PESO tapaba la máscara). Cada una con el ícono de su concepto.
    d = ImageDraw.Draw(im); fv = fuente('dato', int(W * 0.074)); fk = fuente('texto', int(W * 0.062)); lado = int(W * 0.13)
    items = list(datos.items())[:4]; gap = int(W * 0.025); cw = (W - int(W * 0.1) - gap) // 2; h = lado + int(W * 0.06)
    filas = (len(items) + 1) // 2; y0 = H - alto_banda - int(W * 0.04) - filas * h - (filas - 1) * gap
    for i, (k, v) in enumerate(items):
        x = int(W * 0.05) + (i % 2) * (cw + gap); y = y0 + (i // 2) * (h + gap)
        ic = icono(k, lado)
        d.rounded_rectangle((x, y, x + cw, y + h), radius=int(h * 0.25), fill=(255, 255, 255, 242))
        cx = x + int(W * 0.02)
        if ic: im.alpha_composite(ic, (cx, y + (h - lado) // 2)); cx += lado + int(W * 0.02)
        d.text((cx, y + int(h * 0.1)), str(k).upper(), font=fk, fill=(110, 106, 120))
        d.text((cx, y + int(h * 0.45)), str(v), font=fv, fill=banda)

def specs(im, datos, alto_banda):
    # grilla técnica (v2): tarjeta a lo ancho, en la mitad de abajo, arriba de la franja; el producto queda grande arriba.
    # Datos a 22 px o más en el celular, etiquetas a 16 px.
    d = ImageDraw.Draw(im)
    fk, fv = fuente('texto', int(W * 0.062)), fuente('dato', int(W * 0.072)); lado = int(W * 0.13)
    datos = dict(list(datos.items())[:5])
    fila = int(W * 0.17); h = fila * len(datos) + int(W * 0.04)
    x0, w = int(W * 0.05), int(W * 0.9); y0 = H - alto_banda - int(W * 0.04) - h
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=int(W * 0.03), fill=(255, 255, 255, 245))
    for i, (k, v) in enumerate(datos.items()):
        y = y0 + int(W * 0.025) + i * fila; tx = x0 + int(W * 0.035)
        ic = icono(k, lado)
        if ic: im.alpha_composite(ic, (tx, y + int(W * 0.01))); tx += lado + int(W * 0.03)
        d.text((tx, y), str(k).upper(), font=fk, fill=(110, 106, 120))
        d.text((tx, y + int(W * 0.066)), str(v), font=fv, fill=banda)


# v5 (Diego, 01-Nov: «poner un revisor para que el logo no interfiera con los personajes… los textos con emojis, más desordenados,
# con flechas en función de lo que quieren destacar… y los íconos de cada marca cuando no vaya un emoji»):
#   - el logo prueba tres lugares arriba (centro, izquierda, derecha) y va al primero que no pisa una cara ni el producto; las caras
#     las detecta OpenCV y el producto se aproxima por densidad de bordes. Si los tres chocan, la pieza queda marcada
#     «logo_choca» en el log y el revisor la manda a regenerar (la base tiene que dejar libre el 15 % de arriba).
#   - «notas»: etiquetas un poco giradas y en lugares distintos, cada una con una flecha que apunta a lo que destaca. Llevan un
#     emoji o, en su lugar, un ícono del kit de la marca (Lucide recoloreado con sus colores):
#     [{"emoji":"🤿" | "icono":"material","txt":"Vidrio templado","en":[x,y],"apunta":[x,y],"giro":-6,"estilo":"marca"|"blanca"}]
#     (en y apunta son fracciones del cuadro: 0..1)
import math
try:
    import cv2, numpy as np
except Exception:
    cv2 = None
EMOJI = 'C:/Windows/Fonts/seguiemj.ttf'
_CARAS = []
if cv2 is not None and hasattr(cv2, 'CascadeClassifier'):   # OpenCV 5 lo sacó del paquete base: queda solo bordes
    for xml in ('haarcascade_frontalface_default.xml', 'haarcascade_profileface.xml'):
        c = cv2.CascadeClassifier(cv2.data.haarcascades + xml)
        if not c.empty(): _CARAS.append(c)

def zonas_protegidas(im):
    # devuelve (máscara de bordes, cajas de cabezas) a escala completa
    if cv2 is None: return None, []
    g = np.array(im.convert('L').resize((W // 2, H // 2)))
    caras = []
    for c in _CARAS:
        for (x, y, w, h) in c.detectMultiScale(g, 1.1, 6, minSize=(40, 40)):
            m = 0.35   # la cabeza es más grande que la cara: pelo y frente
            caras.append((int((x - w * m) * 2), int((y - h * m * 1.6) * 2), int((x + w * (1 + m)) * 2), int((y + h * (1 + m)) * 2)))
    bordes = cv2.Canny(cv2.GaussianBlur(g, (5, 5), 0), 60, 160)
    bordes = cv2.dilate(bordes, np.ones((7, 7), np.uint8)) > 0
    return bordes, caras

def elegir_lugar_logo(im, pw, ph):
    y = int(W * 0.045); m = int(W * 0.045)
    lugares = [('centro', (W - pw) // 2), ('izquierda', m), ('derecha', W - pw - m)]
    bordes, caras = zonas_protegidas(im)
    if bordes is None: return lugares[0][1], y, {'lugar': 'centro', 'puntaje': None}
    res = []
    for nombre, x in lugares:
        x0, y0, x1, y1 = x - 12, y - 12, x + pw + 12, y + ph + 12
        b = bordes[max(0, y0) // 2:y1 // 2, max(0, x0) // 2:x1 // 2].mean()
        cara = 0
        for (cx0, cy0, cx1, cy1) in caras:
            iw, ih = max(0, min(x1, cx1) - max(x0, cx0)), max(0, min(y1, cy1) - max(y0, cy0))
            cara = max(cara, iw * ih / ((x1 - x0) * (y1 - y0)))
        res.append((nombre, x, round(float(b) + 3 * cara, 3), round(cara, 3)))
    centro = res[0]
    elegido = centro if centro[2] <= 0.06 else min(res, key=lambda r: r[2])
    info = {'lugar': elegido[0], 'puntaje': elegido[2], 'caras': len(caras), 'probados': {r[0]: r[2] for r in res},
            'logo_choca': bool(elegido[2] > 0.2 or elegido[3] > 0)}
    return elegido[1], y, info

def renglon(nota, f, size, color):
    # «emoji o ícono de la marca + texto» como imagen RGBA
    d = ImageDraw.Draw(Image.new('RGBA', (10, 10)))
    ic = icono(nota.get('icono'), int(size * 1.25)) if nota.get('icono') else None
    emoji = '' if ic else nota.get('emoji', '')
    fe = ImageFont.truetype(EMOJI, int(size * 0.95))
    ew = ic.width if ic else (int(d.textlength(emoji, font=fe)) if emoji else 0)
    tw = int(d.textlength(nota['txt'], font=f)); gap = int(size * 0.28) if ew else 0
    alto = max(int(size * 1.45), ic.height if ic else 0)
    capa = Image.new('RGBA', (ew + gap + tw + 4, alto), (0, 0, 0, 0)); dc = ImageDraw.Draw(capa)
    if ic: capa.alpha_composite(ic, (0, (alto - ic.height) // 2))
    elif emoji: dc.text((0, int(size * 0.12)), emoji, font=fe, embedded_color=True)
    dc.text((ew + gap, (alto - int(size * 1.45)) // 2 - int(size * 0.02)), nota['txt'], font=f, fill=color)
    return capa

def etiqueta(nota):
    size = int(W * 0.064); f = fuente('titular', size)
    marca = nota.get('estilo') == 'marca'
    fondo, color = (banda + (255,), (255, 255, 255)) if marca else ((255, 255, 255, 246), texto_osc)
    linea = renglon(nota, f, size, color)
    px, py = int(size * 0.55), int(size * 0.28)
    w, h = linea.width + 2 * px, linea.height + 2 * py
    et = Image.new('RGBA', (w + 40, h + 40), (0, 0, 0, 0))
    sombra = Image.new('RGBA', et.size, (0, 0, 0, 0))
    ImageDraw.Draw(sombra).rounded_rectangle((20, 28, 20 + w, 28 + h), radius=h // 2, fill=(0, 0, 0, 110))
    et.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(10)))
    ImageDraw.Draw(et).rounded_rectangle((20, 20, 20 + w, 20 + h), radius=h // 2, fill=fondo)
    et.alpha_composite(linea, (20 + px, 20 + py))
    return et.rotate(nota.get('giro', 0), resample=Image.BICUBIC, expand=True)

def flecha(im, a, b, curva):
    # flecha a mano alzada: curva blanca con borde oscuro (se lee sobre cualquier foto) y punta triangular
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1
    cx, cy = (ax + bx) / 2 - dy * 0.22 * curva, (ay + by) / 2 + dx * 0.22 * curva
    pts = [((1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx, (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by)
           for t in [i / 40 for i in range(41)]]
    ux, uy = pts[-1][0] - pts[-4][0], pts[-1][1] - pts[-4][1]; ul = math.hypot(ux, uy) or 1; ux, uy = ux / ul, uy / ul
    s = W * 0.062
    punta = [(bx + ux * s * 0.35, by + uy * s * 0.35), (bx - ux * s + uy * s * 0.62, by - uy * s - ux * s * 0.62),
             (bx - ux * s - uy * s * 0.62, by - uy * s + ux * s * 0.62)]
    cuerpo = pts[:-2]
    capa = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(capa)
    d.line(cuerpo, fill=(0, 0, 0, 160), width=int(W * 0.028), joint='curve'); d.polygon(punta, fill=(0, 0, 0, 160))
    im.alpha_composite(capa.filter(ImageFilter.GaussianBlur(3)))
    capa = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(capa)
    d.line(cuerpo, fill=(255, 255, 255, 255), width=int(W * 0.016), joint='curve'); d.polygon(punta, fill=(255, 255, 255, 255))
    im.alpha_composite(capa)

def notas(im, lista):
    for i, n in enumerate((lista or [])[:3]):
        et = etiqueta(n)
        x, y = int(n['en'][0] * W), int(n['en'][1] * H)
        x, y = max(int(W * 0.02), min(x, W - et.width - int(W * 0.02))), max(0, min(y, H - et.height))
        if n.get('apunta'):
            tx, ty = n['apunta'][0] * W, n['apunta'][1] * H
            x0, y0, x1, y1 = x + 34, y + 34, x + et.width - 34, y + et.height - 34
            sx, sy = min(max(tx, x0), x1), min(max(ty, y0), y1)
            dx, dy = tx - sx, ty - sy; L = math.hypot(dx, dy) or 1
            a = (sx + dx / L * W * 0.02, sy + dy / L * W * 0.02); b = (tx - dx / L * W * 0.015, ty - dy / L * W * 0.015)
            flecha(im, a, b, n.get('curva', 1 if i % 2 == 0 else -1))
        im.alpha_composite(et, (x, y))

def componer(p):
    n = p['n']; tipo = p.get('tipo', 'foto')
    if tipo == 'portada':
        # portada: sin texto, sin logo, sin íconos (regla de ML para la imagen principal); fondo blanco lo trae la base
        im = cover(Image.open(os.path.join(DIR, p['base'])).convert('RGB'), W, H, ay=0.5)
        im.save(os.path.join(DIR, 'carrusel', f'{n}.jpg'), quality=92); return {'n': n, 'tipo': tipo}
    _, _, _, _, alto0, _ = ajustar_titular(p['titular'])
    if tipo == 'pasos':
        im = Image.new('RGB', (W, H), apoyo); gap = int(W * 0.015); ch = (H - 2 * gap) // 3
        # en 9:16 los 3 pasos van apilados (uno arriba del otro), cada uno a lo ancho
        for i, b in enumerate(p['bases'][:3]):
            im.paste(cover(Image.open(os.path.join(DIR, b)).convert('RGB'), W, ch), (0, i * (ch + gap)))
        d = ImageDraw.Draw(im); fnum = fuente('titular', int(W * 0.07)); fp = fuente('texto', int(W * 0.066))
        for i, t in enumerate(p.get('pasos', [])[:3]):
            # el número va arriba a la DERECHA: a la izquierda del primer paso está el logo
            y0 = i * (ch + gap); r = int(W * 0.055); cx, cy = W - int(W * 0.05) - r, y0 + int(W * 0.05) + r
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=banda)
            d.text((cx - d.textlength(str(i + 1), font=fnum) / 2, cy - int(W * 0.05)), str(i + 1), font=fnum, fill=(255, 255, 255))
            rs = partir(d, t, fp, W * 0.62); yy = min(y0 + ch, H - alto0) - int(W * 0.04) - len(rs[:2]) * int(W * 0.066 * 1.45)
            for r_ in rs[:2]:
                tw = d.textlength(r_, font=fp); bx = int(W * 0.05)
                fz = int(W * 0.066)
                d.rounded_rectangle((bx - 16, yy - 8, bx + tw + 16, yy + int(fz * 1.25)), radius=16, fill=(255, 255, 255))
                d.text((bx, yy - int(fz * 0.12)), r_, font=fp, fill=texto_osc); yy += int(fz * 1.45)
    else:
        im = cover(Image.open(os.path.join(DIR, p['base'])).convert('RGB'), W, H)
    im = im.convert('RGBA')
    alto, size, opac = titular(im, p['titular'], p.get('emoji', ''))
    if p.get('notas'): notas(im, p['notas'])
    info_logo = logo_arriba(im)
    if tipo == 'medidas' and p.get('datos'): chips(im, p['datos'], alto)
    if tipo == 'specs' and p.get('datos'): specs(im, p['datos'], alto)
    if p.get('iconos') and tipo not in ('pasos', 'specs', 'medidas'): fila_iconos(im, p['iconos'], H - alto - int(W * 0.04))
    im.convert('RGB').save(os.path.join(DIR, 'carrusel', f'{n}.jpg'), quality=92)
    return {'n': n, 'tipo': tipo, 'titular_px': size, 'zona_texto_px': alto, 'degrade_pct': opac, 'logo': info_logo}

os.makedirs(os.path.join(DIR, 'carrusel'), exist_ok=True)
piezas = json.load(open(os.path.join(DIR, 'carrusel.json'), encoding='utf-8'))
out = [componer(p) for p in piezas]
# hoja de control (9:16)
mini = []
for p in piezas:
    im = Image.open(os.path.join(DIR, 'carrusel', f"{p['n']}.jpg")); im.thumbnail((270, 480)); mini.append((p['n'], im))
cols = 7; rows = (len(mini) + cols - 1) // cols
hoja = Image.new('RGB', (cols * 290, rows * 530), (255, 255, 255)); dh = ImageDraw.Draw(hoja); fh = fuente('titular', 26)
for i, (n, im) in enumerate(mini):
    x, y = (i % cols) * 290 + 10, (i // cols) * 530 + 10
    hoja.paste(im, (x, y)); dh.text((x + 115, y + 485), n, font=fh, fill=(30, 30, 40))
hoja.save(os.path.join(DIR, 'carrusel.jpg'), quality=90)
json.dump({'banda': '#%02x%02x%02x' % banda, 'contraste_banda': round(contraste(banda, (255, 255, 255)), 2), 'kit': bool(KIT),
           'tamano': f'{W}x{H}', 'piezas': out},
          open(os.path.join(DIR, 'carrusel', '_log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'OK {len(out)} piezas {W}x{H} · banda {contraste(banda, (255, 255, 255)):.1f}:1 · kit {"sí" if KIT else "no"}')
