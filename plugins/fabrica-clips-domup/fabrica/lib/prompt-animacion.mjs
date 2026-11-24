// Arma el prompt de VIDEO de cada escena con los bloques fijos del método (los del ep17 aprobado, anim.py): Claude escribe solo
// la acción («accion»); cámara, tamaño, boca, audio, fondo e idioma los pone este script, siempre iguales.
// Por qué (23-Oct-2026, auditoría del programa contra el método manual): la consigna pedía «lenta, sin cortes» y nadie lo
// verificaba; faltaban «Nobody speaks» con la boca cerrada en las escenas en off (Est.: «lo que va en off se anima con la boca
// cerrada»), «keeps exactly its size» y el lint de prevuelo --tipo animacion. Un bloque fijo no se puede olvidar.
// Uso: node lib/prompt-animacion.mjs <dir>   (escribe escenas[].prompt en anim-plan.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IDIOMA = { MLA: 'Argentine Spanish (Rioplatense, voseo)', MLU: 'Uruguayan Spanish (voseo)', MLM: 'Mexican Spanish',
  MLC: 'Chilean Spanish', MCO: 'Colombian Spanish', MPE: 'Peruvian Spanish', MLB: 'Brazilian Portuguese' };

export function armarPrompts(dir) {
  const a = JSON.parse(readFileSync(join(dir, 'anim-plan.json'), 'utf8'));
  const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  const pedido = JSON.parse(readFileSync(join(dir, 'pedido.json'), 'utf8'));
  const idioma = IDIOMA[pedido.item.id.slice(0, 3)] || 'Spanish';
  const prod = a.producto_corto || 'the product';
  const man = (() => { try { return JSON.parse(readFileSync(join(dir, 'paneles', 'manifest.json'), 'utf8')); } catch { return []; } })();
  for (const [i, e] of a.escenas.entries()) {
    const cuadro = plan.cuadros[i] || {};
    const cam = (e.frases || []).find((f) => f.modo === 'camara');
    // Escena sin personas (27-Oct, caja de señuelos): «Same proportion to the hand» invitaba a Flow a meter una mano dos veces
    // seguidas. Sin personas en el cuadro, ni se nombra la mano y se prohíbe que entre alguien.
    const solo = Array.isArray(man[i]?.personajes) && man[i].personajes.length === 0;
    const ref = cam ? (plan.personajes?.[cam.personaje]?.ref || 'the person') : null;
    const partes = [
      'Use the attached image as the FIRST FRAME. Photorealistic, natural motion, no AI look.',
      'STATIC LOCKED-OFF CAMERA: no zoom, no pan, no push-in, single continuous shot, NO cuts.',
      e.accion.trim(),
      cuadro.muestra_producto ? `${prod[0].toUpperCase()}${prod.slice(1)} keeps exactly its size and shape, exactly as in the first frame.${solo ? '' : ' Same proportion to the hand as in the first frame.'}` : '',
      solo ? 'Nobody is in this shot: NO hands, NO arms, NO people enter the frame at any moment, nobody touches anything; the only motion is light and the action described.' : '',
      cam
        ? `${ref[0].toUpperCase()}${ref.slice(1)} looks straight into the camera and, starting within the first half second, SPEAKS this line in ${idioma}, with clear natural lip movement matching every syllable: "${cam.texto}" Then closes the mouth and smiles. AUDIO: only that voice saying exactly that line, NO music, quiet room tone. Nobody else speaks.`
        : 'Nobody speaks: mouths closed or smiling, no words. AUDIO: NO voice, NO speech, NO music: only soft room ambience.',
      'Keep the background objects untouched. No text, no captions, no extra logos, no other people.',
    ];
    e.prompt = partes.filter(Boolean).join(' ');
  }
  writeFileSync(join(dir, 'anim-plan.json'), JSON.stringify(a, null, 1));
  return a;
}

if (process.argv[1]?.endsWith('prompt-animacion.mjs')) { armarPrompts(process.argv[2] || '.'); console.log('prompts armados'); }
