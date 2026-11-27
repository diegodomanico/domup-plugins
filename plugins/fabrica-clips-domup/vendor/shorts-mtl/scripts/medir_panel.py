# MEDIR PANEL (Diego, 18-Oct-2026: proporciones exactas del producto contra las personas).
# Usa como regla la distancia entre pupilas de la cara (YuNet la da exacta): adulto ~6,3 cm, chico de 7 ~5,3 cm.
# Vale cuando el producto está a la MISMA distancia de cámara que la cara (sostenido con las manos cerca del cuerpo).
# Si está más cerca de cámara (apoyado adelante), sale agrandado: medir otra escena o rediseñarla con el producto en la mano.
#
# Cara girada (27-Oct-2026): de perfil o a tres cuartos las pupilas se ven más juntas y el producto se medía agrandado
# (snorkel: dio +40 % con la cara de perfil y el cuadro estaba bien). Con la cara de frente, la distancia ojos-boca es
# casi igual a la de las pupilas (medido en 6 retratos y 30 cuadros de frente: 0,92-1,06); al girar, las pupilas se achican
# y ojos-boca no. Por eso la regla es la MAYOR de las dos: girar la cabeza solo puede achicar, nunca agrandar.
# Si se pasa el retrato oficial de quien sostiene el producto, la proporción ojos-boca/pupilas sale de su cara de frente.
#
# Uso: python medir_panel.py <panel.png> <y_arriba> <y_abajo> <medida_real_cm> [adulto|nene7] [x_cara] [retrato.png]
#   y_arriba / y_abajo: píxeles del borde de arriba y de abajo del producto en el panel (leídos con grilla).
#   x_cara: la x aproximada de la cara de la persona que lo sostiene (si hay varias caras). «-» si no hace falta.
# Sale con código 1 si el producto queda fuera de ± 20 % de la medida real, y con 2 si no hay cara para medir.
import sys, os, cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import revisor_caras as R

PUPILAS = {'adulto': 6.3, 'nene7': 5.3}
TOL = 0.20

def _medidas(f):
    ipd = float(np.hypot(f[6] - f[4], f[7] - f[5]))
    em = float(np.hypot((f[10] + f[12]) / 2 - (f[4] + f[6]) / 2, (f[11] + f[13]) / 2 - (f[5] + f[7]) / 2))
    return ipd, em

def main(p, y0, y1, real, quien='adulto', xcara=None, retrato=None):
    # 10-Nov (Grupo Alterna f14069c0): el manifest trajo «adulta» y el script se cayó con KeyError, frenando el storyboard.
    # Cualquier forma de decir chico va a nene7; todo lo demás (adulta, mujer, hombre, mayor…) mide como adulto.
    quien = 'nene7' if any(k in str(quien).lower() for k in ('nene', 'nena', 'niñ', 'nin', 'chico', 'chica')) else 'adulto'
    im = cv2.imdecode(np.fromfile(p, np.uint8), cv2.IMREAD_COLOR)
    if im is None: print(f'✗ no se pudo abrir {p}'); sys.exit(3)
    det = cv2.FaceDetectorYN.create(R.DET, '', (320, 320), 0.6, 0.3, 5000)
    fs = R.detectar(det, im, todas=True)
    if not fs: print('✗ no hay cara en el panel: medir a ojo contra la mano'); sys.exit(2)
    xcara = None if xcara in (None, '', '-') else float(xcara)
    f = min(fs, key=lambda g: abs(g[0] + g[2] / 2 - xcara)) if xcara is not None else max(fs, key=lambda g: g[2] * g[3])
    ipd, em = _medidas(f)
    k = 1.0  # ojos-boca / pupilas de una cara de frente
    if retrato and os.path.exists(retrato):
        ir = cv2.imdecode(np.fromfile(retrato, np.uint8), cv2.IMREAD_COLOR)
        fr = R.detectar(det, ir, todas=True) if ir is not None else None
        if fr:
            i2, e2 = _medidas(max(fr, key=lambda g: g[2] * g[3]))
            if i2 > 0 and 0.8 <= e2 / i2 <= 1.25: k = e2 / i2
    regla = max(ipd, em / k)
    girada = regla > ipd * 1.12
    cm_px = PUPILAS[quien] / regla
    med = abs(float(y1) - float(y0)) * cm_px
    r = med / float(real)
    ok = abs(r - 1) <= TOL
    print(f"{'OK' if ok else '✗ '} {os.path.basename(p)}: producto {med:.1f} cm contra {float(real):g} reales "
          f"({(r - 1) * 100:+.0f} %) · pupilas {ipd:.0f} px, ojos-boca {em:.0f} px"
          f"{' · cara girada: regla ojos-boca' if girada else ''} ({quien})")
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main(*sys.argv[1:])
