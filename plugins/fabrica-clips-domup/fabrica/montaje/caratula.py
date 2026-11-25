# Carátula del primer cuadro (Diego, 18-Oct-2026): escena de la historia + producto real + logo + frase gancho.
# Copia para el programa automático de clips (23-Oct-2026): el logo y el color de la franja vienen de marcas/<cust_id>.json
# (Diego, 23-Oct, clip v2: «te falta la primera imagen… con el producto, el logo y la pregunta… eso ya lo teníamos»).
# Uso: python caratula.py <panel.png> <foto_producto> "<¿PREGUNTA linea1|linea2?>" "<NOMBRE DEL PRODUCTO>" <salida.png> <logo.png> [r,g,b]
# El texto va sobre franjas de color sólido y se mide el contraste (mínimo 4,5:1, regla de la casa).
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 720, 1280
ROJO = (176, 18, 23)          # color de la franja por default (rojo Veoquiero oscurecido); la marca lo puede cambiar
LOGO = None
F_TIT = next((f for f in ('C:/Windows/Fonts/ariblk.ttf', '/System/Library/Fonts/Supplemental/Arial Black.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf') if __import__('os').path.exists(f)), 'DejaVuSans-Bold.ttf')
F_TXT = next((f for f in ('C:/Windows/Fonts/arialbd.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf') if __import__('os').path.exists(f)), 'DejaVuSans-Bold.ttf')

def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = c[:3]
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)

def contraste(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

def tarjeta(img, radio):
    m = Image.new('L', img.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, *img.size), radio, fill=255)
    out = Image.new('RGBA', img.size); out.paste(img, (0, 0), m); return out

def main(panel, foto, titulo, nombre, salida, recorte=None):
    base = Image.open(panel).convert('RGB').resize((W, H), Image.LANCZOS)
    c = Image.new('RGBA', (W, H)); c.paste(base, (0, 0))
    d = ImageDraw.Draw(c)
    # franja del título
    lineas = titulo.split('|')
    ft = ImageFont.truetype(F_TIT, 64)
    alto = 40 + len(lineas) * 78 + 20
    sombra = Image.new('RGBA', (W, H)); ImageDraw.Draw(sombra).rounded_rectangle((34, 74, W - 26, 74 + alto), 28, fill=(0, 0, 0, 110))
    c = Image.alpha_composite(c, sombra.filter(ImageFilter.GaussianBlur(10))); d = ImageDraw.Draw(c)
    d.rounded_rectangle((30, 66, W - 30, 66 + alto), 28, fill=ROJO)
    y = 66 + 34
    for l in lineas:
        w = d.textlength(l, font=ft)
        if w > W - 100: ft2 = ImageFont.truetype(F_TIT, int(64 * (W - 100) / w)); w = d.textlength(l, font=ft2)
        else: ft2 = ft
        d.text(((W - w) / 2, y), l, font=ft2, fill='white'); y += 78
    # producto real en tarjeta blanca (abajo a la izquierda)
    p = Image.open(foto).convert('RGB')
    if recorte: p = p.crop(recorte)
    pw = 200; p = p.resize((pw, int(p.height * pw / p.width)), Image.LANCZOS)
    card_h = p.height + 74
    card = Image.new('RGB', (pw + 24, card_h), 'white'); card.paste(p, (12, 12))
    dc = ImageDraw.Draw(card); fn = ImageFont.truetype(F_TXT, 17)
    palabras, ln, filas = nombre.split(), '', []
    for pal in palabras:
        if dc.textlength((ln + ' ' + pal).strip(), font=fn) > pw: filas.append(ln); ln = pal
        else: ln = (ln + ' ' + pal).strip()
    filas.append(ln)
    card = card.resize((card.width, p.height + 24 + 24 * len(filas) + 8)); dc = ImageDraw.Draw(card)
    dc.rectangle((0, p.height + 18, card.width, card.height), fill='white')
    for i, f in enumerate(filas): dc.text((12, p.height + 22 + i * 24), f, font=fn, fill=(26, 26, 26))
    card = tarjeta(card, 22)
    cx, cy = 30, H - card.height - 30
    sh = Image.new('RGBA', (W, H)); ImageDraw.Draw(sh).rounded_rectangle((cx + 4, cy + 8, cx + card.width + 4, cy + card.height + 8), 22, fill=(0, 0, 0, 120))
    c = Image.alpha_composite(c, sh.filter(ImageFilter.GaussianBlur(10))); c.paste(card, (cx, cy), card)
    # logo (abajo a la derecha): nunca escalar por encima de su ancho original (evita pixelado)
    lg = Image.open(LOGO).convert('RGBA')
    ls = min(140, lg.width) if lg.width > 0 else 140
    if ls != lg.width:
        lg = lg.resize((ls, max(1, int(lg.height * ls / lg.width))), Image.LANCZOS)
    lg = tarjeta(lg, min(30, max(4, min(lg.width, lg.height) // 4)))
    c.paste(lg, (W - lg.width - 30, H - lg.height - 30), lg)
    if contraste((255, 255, 255), ROJO) < 4.5: raise SystemExit(f'✗ el blanco sobre la franja {ROJO} no llega a 4,5:1: oscurecer el color en marcas/')
    c.convert('RGB').save(salida, quality=95)
    print(salida, '· contraste título', round(contraste((255, 255, 255), ROJO), 2), ': 1 · nombre', round(contraste((26, 26, 26), (255, 255, 255)), 2), ': 1')

if __name__ == '__main__':
    a = sys.argv[1:]
    LOGO = a[5]
    if len(a) > 6: ROJO = tuple(int(x) for x in a[6].split(','))
    main(a[0], a[1], a[2], a[3], a[4])
