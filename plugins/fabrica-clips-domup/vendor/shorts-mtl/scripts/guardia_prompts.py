# GUARDIA DE PROMPTS (Diego, 22-Oct-2026): «hay que atacar en el origen lo que se ve en el resultado… que no corramos varias
# veces con el mismo error». Revisa los prompts de un storyboard ANTES de generar una sola imagen. Cada defecto visto en un
# resultado (historial-rechazos.md) se convierte en una regla acá; así no se paga dos veces la misma falla.
#
# Uso: python guardia_prompts.py <plan.json>      (sale con 1 si alguna regla falla; imprime la lista)
# plan.json:
# { "producto_lock": "<bloque fijo que describe el producto real: forma, diseño, colores, partes>",
#   "apertura": "<cómo abre el producto real, sacado de las fotos>"  (null si no abre),
#   "casa_lock": "<bloque fijo que describe la casa/lugar, igual en todos>",
#   "escala": {"adulta": "<frase de escala.py>", "nena7": "<frase>", ...},
#   "personajes": {"<slot>": {"nombre": "<Nombre>", "ref": "<frase que lo ata a su retrato>", "rasgos": "<rasgos fijos>"}},
#   "cuadros": [{"n": 1, "prompt": "<texto>", "muestra_producto": true, "abierto": false,
#                "personajes": ["<slot>"], "sostiene": "<slot o null>", "persona_escala": "<adulta|nena7|...>"}] }
import json, os, re, subprocess, sys

PREVUELO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'prevuelo.py')

# Cada regla dice de qué rechazo salió. Cuando aparece una falla nueva en el resultado, se agrega una regla acá.
def revisar(plan):
    fallas = []
    cuadros = plan.get('cuadros', [])
    lock, casa, apertura = plan.get('producto_lock', '').strip(), plan.get('casa_lock', '').strip(), (plan.get('apertura') or '').strip()
    if len(cuadros) not in (6, 8):   # 8 desde el 30-Oct (Diego); 6 en los pedidos de antes
        fallas.append(f'el storyboard tiene {len(cuadros)} cuadros: son 8 (formato de la casa)')
    if len(lock) < 80:
        fallas.append('producto_lock muy corto: tiene que describir forma, diseño, colores y partes del producto real')
    for c in cuadros:
        n, p = c.get('n'), c.get('prompt', '')
        q = f'cuadro {n}'
        # R1 (22-Oct, set de arte: «vi tres productos distintos»): el MISMO bloque de producto, textual, en cada cuadro con producto.
        if c.get('muestra_producto') and lock and lock not in p:
            fallas.append(f'{q}: no trae el producto_lock textual (si cada cuadro lo describe distinto, Flow dibuja otro producto)')
        # R2 (22-Oct: «las medidas del producto están pésimas»): la frase de escala de quien aparece con el producto.
        if c.get('muestra_producto'):
            per = c.get('persona_escala')
            frase = (plan.get('escala') or {}).get(per or '', '')
            if per and frase and frase not in p:
                fallas.append(f'{q}: falta la frase de escala de {per}: «{frase}»')
            if not re.search(r'same proportion to the hand as in (the )?product photo', p, re.I):
                fallas.append(f'{q}: falta «same proportion to the hand as in product photo 1»')
        # R3 (22-Oct, cuadro 4: abría como libro y el real despliega bandejas): si se ve abierto, la apertura real textual.
        if c.get('abierto') and apertura and apertura not in p:
            fallas.append(f'{q}: el producto se ve abierto y no trae la apertura real: «{apertura[:90]}…»')
        if c.get('abierto') and not apertura:
            fallas.append(f'{q}: el producto se ve abierto pero el plan no describe cómo abre (apertura, sacada de las fotos)')
        # R3b (22-Oct, v4: dos revisores leyeron distinto la apertura y Flow la dibujó como libro tres veces): un mecanismo
        # no se explica con palabras; el cuadro abierto lleva la foto real abierta como referencia y la nombra.
        foto_ab = plan.get('apertura_foto')
        if c.get('abierto') and not foto_ab:
            fallas.append(f'{q}: falta apertura_foto en el plan (la foto real donde se ve abierto, para pasarla a Flow como referencia)')
        if c.get('abierto') and foto_ab and not re.search(r'opened exactly as in (the )?product photo', p, re.I):
            fallas.append(f'{q}: el cuadro abierto tiene que decir «opened exactly as in product photo N» y llevar {foto_ab} como referencia')
        # R4 (22-Oct: un cuadro en otra casa): la misma casa en todos.
        if c.get('confesionario'):
            # Estilo mini serie (Veoquiero): la cabina roja del confesionario, con su referencia y el tercio de arriba libre.
            if not re.search(r'red reality-show confession booth as the reference', p, re.I):
                fallas.append(f'{q}: cuadro de confesionario sin «the same red reality-show confession booth as the reference»')
            if not re.search(r'top third of the frame is plain red wall', p, re.I):
                fallas.append(f'{q}: cuadro de confesionario sin el tercio de arriba libre («The top third of the frame is plain red wall»)')
            if not c.get('ref_confesionario'):
                fallas.append(f'{q}: cuadro de confesionario sin ref_confesionario (la imagen de la cabina va como referencia)')
        elif casa and casa not in p:
            fallas.append(f'{q}: no trae el casa_lock textual (cada cuadro inventa otra casa)')
        # R5 (22-Oct, Pancho de otra raza; ep12 gato inventado): cada personaje o animal, atado a su retrato y con sus rasgos.
        for slot in c.get('personajes', []):
            per = (plan.get('personajes') or {}).get(slot)
            if not per:
                fallas.append(f'{q}: «{slot}» no está en el elenco del plan (nunca inventar personajes)'); continue
            if per.get('ref') and per['ref'] not in p:
                fallas.append(f'{q}: {per.get("nombre", slot)} no está atado a su retrato («{per["ref"]}»)')
            if per.get('rasgos') and per['rasgos'] not in p:
                fallas.append(f'{q}: faltan los rasgos fijos de {per.get("nombre", slot)}')
        # R6 (22-Oct, cuadro 3: el maletín chico contra las manos de la nena): quien lo sostiene usa la escala de su edad.
        if c.get('sostiene') and c.get('persona_escala') and c['sostiene'] in ('nina', 'nino') and not str(c['persona_escala']).endswith('7'):
            fallas.append(f'{q}: lo sostiene un chico y la escala es de {c["persona_escala"]} (tiene que ser nena7/nene7)')
        # R7 (prevuelo, reglas anteriores: contacto mano-producto, sin texto, rígido, apagado…).
        r = subprocess.run([sys.executable, PREVUELO, '--lint', p], capture_output=True, text=True, encoding='utf8',
                           env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
        if r.returncode != 0:
            fallas.append(f'{q}: prevuelo · {r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr.strip()[-200:]}')
    return fallas

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    plan = json.load(open(sys.argv[1], encoding='utf8'))
    f = revisar(plan)
    if f:
        print(f'✗ {len(f)} fallas en los prompts (corregir antes de generar):'); [print(' -', x) for x in f]; sys.exit(1)
    print(f'✓ prompts OK ({len(plan.get("cuadros", []))} cuadros)')
