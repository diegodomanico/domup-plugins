# ESCALA (Diego, 18-Oct-2026): «tiene que ser exactamente la proporción» del producto y de sus accesorios contra las personas.
# Origen: ep09 Tetris. Escribí la escala a ojo («antebrazo + mano», «pieza del tamaño de la palma») y el tablero salió casi del
# doble; el paquete de la ficha decía 24 × 20 × 3 cm. Diego marcó lo mismo con los dardos del ep04. Un comprador que ve el
# producto más grande en el video y lo recibe chico es un reclamo.
#
# Paso obligatorio ANTES de escribir el guion:
#   1. Medidas reales: SELLER_PACKAGE_* de la ficha (Supabase, tabla items_ficha_tecnica_snapshot) y, si están, los atributos
#      de medida del producto (HEIGHT, WIDTH, LENGTH, DIAMETER...). El producto entra en el paquete: el paquete es el tope.
#   2. Accesorios y piezas: se miden en la foto real CONTRA el producto (fracción del ancho o del alto), con una grilla
#      encima de la foto. Nunca a ojo.
#   3. Este script traduce todo a frases de escala contra la mano y la cara de cada personaje, SIN números (Flow dibuja cotas).
#   4. Al revisar el storyboard se mide cada panel: alto del producto ÷ largo de la mano de la persona (± 20 %).
#
# Uso:
#   python escala.py --paquete 24x20x3 --producto "board:22x18" --pieza "little square of a block:1.2" --pieza "long block:4.5" \
#                    --persona nene7 --persona adulta
# Medidas en cm. Producto: alto x ancho (x prof). Pieza: la medida más larga.
import argparse, sys

# Referencias antropométricas aproximadas (largo de mano: muñeca a punta del dedo mayor; cara: mentón a frente; uña del índice).
PERSONAS = {
    'adulta': {'mano': 17.5, 'cara': 19.0, 'uña': 1.2, 'indice': 7.0, 'quien': 'her'},
    'adulto': {'mano': 19.0, 'cara': 20.5, 'uña': 1.4, 'indice': 7.5, 'quien': 'his'},
    'nena7':  {'mano': 13.0, 'cara': 16.0, 'uña': 0.9, 'indice': 5.0, 'quien': 'her'},
    'nene7':  {'mano': 13.0, 'cara': 16.0, 'uña': 0.9, 'indice': 5.0, 'quien': 'his'},
    'bebe':   {'mano': 8.5,  'cara': 12.0, 'uña': 0.6, 'indice': 3.0, 'quien': 'the baby\'s'},
}
FRAC = [(0, 'exactly'), (0.15, 'plus a little'), (0.3, 'plus a quarter of it'), (0.42, 'plus a third of it'),
        (0.58, 'plus half of it'), (0.75, 'plus two thirds of it'), (0.9, 'plus three quarters of it')]

def frase(medida, ref, nombre_ref, quien):
    k = medida / ref
    if k < 0.85:
        for lim, txt in ((0.2, 'about a fifth'), (0.3, 'about a quarter'), (0.4, 'about a third'), (0.6, 'about half'),
                         (0.72, 'about two thirds'), (0.85, 'about three quarters')):
            if k <= lim: return f'{txt} of {quien} {nombre_ref}', k
    n = int(k); r = k - n
    if r > 0.9 or n == 0: n, r = max(n, 0) + 1, 0   # ep12: entre 0,85 y 1 decía «0 times … plus two thirds»
    base = {1: f'as long as {quien} {nombre_ref}', 2: f'twice {quien} {nombre_ref}', 3: f'three times {quien} {nombre_ref}'}.get(n, f'{n} times {quien} {nombre_ref}')
    extra = next(t for lim, t in reversed(FRAC) if r >= lim)
    return (f'about {base}' + ('' if extra == 'exactly' else f' {extra}')), k

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--paquete', required=True, help='AxBxC en cm (SELLER_PACKAGE_*)')
    ap.add_argument('--producto', required=True, help='"nombre:alto x ancho[x prof]" en cm')
    ap.add_argument('--pieza', action='append', default=[], help='"nombre:@fracción" = medida más larga como fracción del ALTO del producto, '
                    'leída en la foto con grilla (ej. "esponja:@0.30"). "nombre:cm" queda solo para medidas que salen de la ficha.')
    # ep16 (19-Oct): supuse la esponja de 6 cm («medida típica») y el frasco salió +51 %. Medida contra el frasco en la foto daba 4,5.
    ap.add_argument('--persona', action='append', default=[], choices=list(PERSONAS))
    # Producto flexible que viaja doblado (máscara de látex, ropa, funda): el paquete no es tope del tamaño (ep10, 18-Oct)
    ap.add_argument('--flexible', action='store_true')
    a = ap.parse_args()
    paq = sorted(float(x) for x in a.paquete.lower().split('x'))
    nom, dims = a.producto.split(':'); dims = [float(x) for x in dims.lower().split('x')]
    errores = []
    for d, p in ([] if a.flexible else zip(sorted(dims, reverse=True), sorted(paq, reverse=True))):
        if d > p: errores.append(f'el producto ({d} cm) no entra en el paquete ({p} cm): revisar la medida')
    print(f'Paquete {a.paquete} cm · {nom} {"x".join(f"{d:g}" for d in dims)} cm')
    for e in errores: print('✗', e)
    for per in a.persona or ['adulta']:
        P = PERSONAS[per]; q = P['quien']
        print(f'\n== {per} (mano {P["mano"]} cm, uña {P["uña"]} cm)')
        alto, k = frase(dims[0], P['mano'], 'hand is long', q)
        ancho, k2 = frase(dims[1], P['mano'], 'hand is long', q)
        print(f'  {nom}: tall {alto} (×{k:.2f}); wide {ancho} (×{k2:.2f})')
        print(f'  REVISIÓN DEL PANEL: alto del {nom} ÷ largo de la mano de {per} tiene que dar {k:.2f} ± 20 % ({k*0.8:.2f}-{k*1.2:.2f})')
        for pz in a.pieza:
            n, m = pz.split(':')
            if m.startswith('@'): m = float(m[1:]) * dims[0]   # fracción del alto del producto, medida en la foto
            else:
                m = float(m); print(f'  ⚠ {n}: medida en cm sin fracción de la foto; si no sale de la ficha, medila contra el producto (@fracción)')
            ref, rn = (P['uña'], 'fingernail') if m < 2.5 else ((P['indice'], 'index finger') if m < 9 else (P['mano'], 'hand is long'))
            f, kk = frase(m, ref, rn, q)
            print(f'  {n} (~{m:.1f} cm): {f} (×{kk:.2f} de la {rn})')
    sys.exit(1 if errores else 0)

if __name__ == '__main__':
    main()
