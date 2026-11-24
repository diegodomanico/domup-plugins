# Corta una lámina de personaje (4 columnas x 2 filas) por sus separadores claros, no por mitades: las filas no siempre miden
# igual (31-Oct, la lámina de Domi tenía la fila de arriba más baja y el corte por mitades partía las caras).
# Uso: python cortar_lamina.py <lamina.png> <carpeta> nombre1 ... nombre8
import sys, cv2, numpy as np

img = cv2.imread(sys.argv[1])
dest, nombres = sys.argv[2], sys.argv[3:]
gris = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
h, w = gris.shape

def cortes(perfil, n, largo):
    # Busca n-1 separadores: la línea más clara cerca de cada división pareja (±12 %). Si no hay una clara, usa la pareja.
    out = []
    for k in range(1, n):
        c = int(largo * k / n); r = int(largo * 0.12)
        tramo = perfil[max(0, c - r):min(largo, c + r)]
        i = int(np.argmax(tramo)) + max(0, c - r)
        out.append(i if perfil[i] > 225 else c)
    return [0] + out + [largo]

cols = cortes(gris.mean(axis=0), 4, w)
filas = cortes(gris.mean(axis=1), 2, h)
m = 4   # margen para no arrastrar la línea blanca
for idx, nombre in enumerate(nombres[:8]):
    f, c = divmod(idx, 4)
    y0, y1, x0, x1 = filas[f] + m, filas[f + 1] - m, cols[c] + m, cols[c + 1] - m
    cv2.imwrite(f'{dest}/{nombre}.png', img[y0:y1, x0:x1])
print('filas', filas, 'columnas', cols)
