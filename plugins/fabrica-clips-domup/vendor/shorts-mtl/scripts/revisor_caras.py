# REVISOR DE CARAS (Diego, 18-Oct-2026): que un personaje no cambie de cara entre escenas.
# Caso que lo originó: la Vero del confesionario tenía ojos verdes y otra cara desde el ep00; Diego la cazó a ojo en el ep06.
#
# Uso: python revisor_caras.py <retrato_oficial.png> <salida_hoja.jpg> <panel1.png> [panel2.png ...]
# Para cada panel: encuentra la cara (YuNet) y mide si es la misma persona que el retrato oficial (SFace, similitud coseno)
# y si el color del iris coincide (ΔE en Lab). Marca ✗ lo que se aleja y arma una hoja con todas las caras lado a lado
# para la revisión a ojo. Sale con código 1 si alguna cara queda marcada. Los paneles sin cara se informan y no cuentan.
# Modelos (repositorio oficial opencv/opencv_zoo), en assets/modelos-caras/:
#   face_detection_yunet_2023mar.onnx · face_recognition_sface_2021dec.onnx
import sys, os, re, cv2, numpy as np
from PIL import Image, ImageDraw, ImageFont

M = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'modelos-caras')
DET = os.path.join(M, 'face_detection_yunet_2023mar.onnx')
REC = os.path.join(M, 'face_recognition_sface_2021dec.onnx')
# Calibrado 18-Oct-2026 con Veoquiero ep05/ep06 (imágenes generadas, no fotos reales: entre parecidas el coseno da alto igual):
#   Vero equivocada (ojos verdes, otra cara) 0,39-0,54 · Vero correcta 0,60-0,82. El 0,363 de fábrica dejaba pasar a la equivocada.
UMBRAL_IDENTIDAD = 0.58
# Color del ojo: componente a* (verde-rojo) del centro del iris. Ojos marrones 11-14, verdes 5-8. Diferencia máxima contra el retrato:
UMBRAL_IRIS_A = 3.0
# Hacia lo cálido (ep09: Benja riendo o con luz de tarde dio 12-14 contra 8 con los ojos marrones de siempre):
UMBRAL_IRIS_CALIDO = 7.0
# Con la cara casi idéntica al retrato, el color medido no decide (27-Oct, Mili riendo: similitud 0,85 —la más alta de los cuadros—
# y a* 4 contra 9 por la risa y la luz). La Vero equivocada nunca pasó de 0,54.
UMBRAL_IDENTIDAD_SEGURA = 0.78
# Caras de perfil o chicas no se juzgan (la similitud cae por la pose, no por la identidad): se listan para revisar a ojo.
YAW_MAX, OJOS_MIN_PX = 0.40, 35

def detectar(det, img, todas=False):
    det.setInputSize((img.shape[1], img.shape[0]))
    _, fs = det.detect(img)
    if fs is None or len(fs) == 0: return [] if todas else None
    return list(fs) if todas else max(fs, key=lambda f: f[2] * f[3])

def iris(img, f):
    # centro de cada ojo (landmarks YuNet 4-7), disco de radio 9% de la distancia entre ojos, sin pupila ni brillos: mediana de a* (Lab)
    rex, rey, lex, ley = f[4:8]; ed = float(np.hypot(lex - rex, ley - rey)); r = max(2, int(ed * 0.09)); px, lum = [], []
    for cx, cy in ((rex, rey), (lex, ley)):
        yy, xx = np.mgrid[-r:r + 1, -r:r + 1]; m = (xx ** 2 + yy ** 2) <= r * r
        c = img[int(cy) - r:int(cy) + r + 1, int(cx) - r:int(cx) + r + 1]
        if c.shape[:2] != m.shape: continue
        hsv = cv2.cvtColor(c, cv2.COLOR_BGR2HSV)[m]; lab = cv2.cvtColor(c, cv2.COLOR_BGR2LAB)[m].astype(float)
        k = (hsv[:, 2] > 55) & (hsv[:, 2] < 220) & (hsv[:, 1] > 35)
        px.append(lab[k, 1] - 128)
    a = np.concatenate(px) if px else np.array([])
    return float(np.median(a)) if a.size > 15 else None

def piel(img, f):
    # a* (Lab) de las mejillas: entre cada ojo y la comisura de su lado. Sirve para descontar la luz (05-Nov, VentiMaku 8feb9e66:
    # dentro del auto, con luz fría, el iris de la misma mujer dio a* 5 contra 11 del retrato y se rechazó como otra persona).
    rex, rey, lex, ley = f[4:8]; rmx, rmy, lmx, lmy = f[10:14]
    ed = float(np.hypot(lex - rex, ley - rey)); r = max(2, int(ed * 0.12)); vals = []
    for cx, cy in (((rex + rmx) / 2, (rey + rmy) / 2), ((lex + lmx) / 2, (ley + lmy) / 2)):
        c = img[int(cy) - r:int(cy) + r + 1, int(cx) - r:int(cx) + r + 1]
        if c.size == 0: continue
        vals.append(cv2.cvtColor(c, cv2.COLOR_BGR2LAB)[..., 1].astype(float).ravel() - 128)
    v = np.concatenate(vals) if vals else np.array([])
    return float(np.median(v)) if v.size > 15 else None

def pose(f):
    rex, rey, lex, ley, nx = f[4], f[5], f[6], f[7], f[8]
    ed = float(np.hypot(lex - rex, ley - rey)); yaw = (nx - (rex + lex) / 2) / ed if ed else 9
    return ed, yaw

def main(retrato, salida, paneles):
    for p in (DET, REC):
        if not os.path.exists(p): print(f'✗ falta el modelo {os.path.basename(p)} en {M}'); sys.exit(2)
    det = cv2.FaceDetectorYN.create(DET, '', (320, 320), 0.6, 0.3, 5000)
    rec = cv2.FaceRecognizerSF.create(REC, '')
    r = cv2.imread(retrato); fr = detectar(det, r)
    if fr is None: print('✗ no encuentro la cara en el retrato oficial'); sys.exit(2)
    # 05-Nov (Racer Bikes): los 10 retratos del elenco se cargaron como miniaturas (80-144 px, 1,5-4 KB, cara de 20-36 px). Contra
    # eso la similitud no dice nada y el iris es ruido: el storyboard de Fede se rechazó con 8 cuadros del mismo muchacho. Con la
    # cara del retrato de menos de 80 px no se juzga: se avisa para rehacer el retrato en alta y no se frena.
    if float(fr[2]) < 80:
        print(f'· retrato oficial de baja resolución (cara de {int(fr[2])} px, imagen {r.shape[1]}x{r.shape[0]}): no se puede comparar; '
              f'hay que rehacer el retrato en alta (mínimo 512 px). Los cuadros se miran a ojo.')
        print(f'-> {salida} · RETRATO EN BAJA: SIN COMPARAR (no frena)'); sys.exit(0)
    er = rec.feature(rec.alignCrop(r, fr)); ir = iris(r, fr); sr = piel(r, fr)
    otros = []   # retratos del resto del elenco (misma carpeta): para no juzgar la cara de otra persona
    rdir = os.path.dirname(os.path.abspath(retrato))
    for o in sorted(os.listdir(rdir)):
        po = os.path.join(rdir, o)
        if os.path.abspath(po) == os.path.abspath(retrato) or not o.lower().endswith(('.png', '.jpg', '.jpeg')): continue
        io_ = cv2.imread(po); fo = None if io_ is None else detectar(det, io_)
        if fo is not None: otros.append(rec.feature(rec.alignCrop(io_, fo)))
    filas, malos = [('RETRATO OFICIAL', r, fr, '', True)], 0
    for p in paneles:
        im = cv2.imread(p); fs = detectar(det, im, todas=True)
        n = os.path.basename(p)
        if not fs: print(f'· {n}: sin cara (no cuenta)'); continue
        # Con varias personas en cuadro (Veoquiero ep09: Vero y Benja juntos) se juzga la cara que más se parece al retrato,
        # no la más grande: antes había que recortar a mano.
        # 05-Nov (rack de VentiMaku): Matías salía cortado en el borde, no se detectaba su cara y se juzgaba la de Valentina
        # como si fuera él (0.30, «✗»). Una cara que se parece claramente más a OTRO retrato del elenco (misma carpeta) no es
        # de esta persona: se descarta. Si no queda ninguna, el cuadro no cuenta para este retrato.
        if otros:
            def es_de_otro(g):
                fg = rec.feature(rec.alignCrop(im, g))
                s = float(rec.match(er, fg, cv2.FaceRecognizerSF_FR_COSINE))
                return any(float(rec.match(eo, fg, cv2.FaceRecognizerSF_FR_COSINE)) > s + 0.10 for eo in otros)
            fs = [g for g in fs if not es_de_otro(g)]
            if not fs: print(f'· {n}: solo caras de otras personas del elenco (esta no se ve: no cuenta)'); continue
        f = max(fs, key=lambda g: float(rec.match(er, rec.feature(rec.alignCrop(im, g)), cv2.FaceRecognizerSF_FR_COSINE)))
        ed, yaw = pose(f)
        sim = float(rec.match(er, rec.feature(rec.alignCrop(im, f)), cv2.FaceRecognizerSF_FR_COSINE))
        # 05-Nov (rack, c5): una cara cortada por el borde del cuadro o mirando hacia abajo da similitud baja por la pose
        # (Matías 0.11), no por la identidad: se mira a ojo como las de perfil.
        bx, by, bw, bh = [float(v) for v in f[:4]]
        cortada = bx <= 2 or by <= 2 or bx + bw >= im.shape[1] - 2 or by + bh >= im.shape[0] - 2
        # Cabeza inclinada: de frente la nariz cae a 0.50-0.65 de la distancia entre ojos por debajo de ellos (medido en 40
        # caras del rack y del enchufe); mirando hacia abajo, a 0.77-0.97. Más de 0.75 = inclinada: a ojo.
        abajo = ed > 0 and (f[9] - (f[5] + f[7]) / 2) / ed > 0.75
        if ed < OJOS_MIN_PX or abs(yaw) > YAW_MAX or cortada or abajo:
            print(f'· {n}: cara de perfil o chica (similitud {sim:.2f}): revisar a ojo'); filas.append((n, im, f, f'a ojo · {sim:.2f}', True)); continue
        ip = iris(im, f)
        # Ojos cerrados o mirando abajo: el disco del iris cae sobre el párpado y la marca de color no vale (Benja ep09 s1).
        # No se pudo separar por luminosidad (L* 45 cerrado = 45 abierto, medido 18-Oct): se avisa y se mira el recorte.
        # El desvío peligroso es hacia verde o gris (a* MÁS BAJO que el retrato: la Vero de ojos verdes, el ojo gris del ep09).
        # Hacia lo cálido (a* más alto) lo producen el párpado entrecerrado o la luz cálida: se tolera hasta UMBRAL_IRIS_CALIDO.
        dA = None if (ir is None or ip is None) else ip - ir
        # Con la piel medida en las dos caras, el desvío del iris se corrige por la luz: si la piel también bajó (luz fría), no
        # es el ojo el que cambió de color.
        sp = piel(im, f)
        if dA is not None and sr is not None and sp is not None: dA = dA - (sp - sr)
        # 05-Nov (Héctor de VentiMaku mirando hacia abajo: similitud 0,59 y a* 14 contra 8): con la identidad confirmada, un ojo MÁS
        # CÁLIDO es el párpado o la luz, nunca otra persona; el desvío que delata a otra es hacia verde o gris (la Vero equivocada).
        ok = sim >= UMBRAL_IDENTIDAD_SEGURA or (sim >= UMBRAL_IDENTIDAD and (dA is None or dA >= -UMBRAL_IRIS_A))
        malos += not ok
        txt = f'misma persona {sim:.2f}' + (f' · ojo {ip:.0f} vs {ir:.0f}' if dA is not None else '')
        if not ok and sim >= UMBRAL_IDENTIDAD: txt += ' (solo el color: si tiene los ojos cerrados o bajos, decidir mirando)'
        print(f"{'OK' if ok else '✗ '} {n}: {txt}")
        filas.append((n, im, f, txt, ok))
    T = 260; hoja = Image.new('RGB', (T * len(filas), T + 60), 'white'); d = ImageDraw.Draw(hoja)
    fn = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 15)
    for i, (n, im, f, txt, ok) in enumerate(filas):
        x, y, w, h = [int(v) for v in f[:4]]; pad = int(w * 0.3)
        c = im[max(0, y - pad):y + h + pad, max(0, x - pad):x + w + pad]
        hoja.paste(Image.fromarray(cv2.cvtColor(cv2.resize(c, (T, T)), cv2.COLOR_BGR2RGB)), (i * T, 0))
        if not ok: d.rectangle((i * T, 0, i * T + T - 1, T - 1), outline=(220, 20, 20), width=6)
        d.text((i * T + 6, T + 6), n[:30], font=fn, fill=(20, 20, 20))
        d.text((i * T + 6, T + 30), txt, font=fn, fill=(200, 20, 20) if not ok else (40, 120, 40))
    hoja.save(salida, quality=90)
    print(f'-> {salida} · {"TODAS SON LA MISMA PERSONA DEL RETRATO" if not malos else f"{malos} CARA(S) DISTINTA(S): NO MANDAR EL STORYBOARD"}')
    sys.exit(1 if malos else 0)

if __name__ == '__main__':
    # Candado (ep11, 18-Oct): el 2.º argumento es la HOJA DE SALIDA. Llamado como «retrato panel1 panel2…», pisaba el primer
    # panel con la hoja de caras (se perdieron c1, s1 y s5 y hubo que volver a bajarlos). La salida tiene que llamarse hoja*/caras*.
    sal = sys.argv[2]
    if not re.search(r'(?i)(hoja|caras)', os.path.basename(sal)):
        print(f'✗ el 2.º argumento es la hoja de salida y «{os.path.basename(sal)}» parece un panel: '
              'uso  revisor_caras.py <retrato> <hoja-caras.jpg> <panel1> [panel2…]'); sys.exit(2)
    main(sys.argv[1], sal, sys.argv[3:])
