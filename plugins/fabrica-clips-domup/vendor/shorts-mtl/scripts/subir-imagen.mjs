// Sube una o mas imagenes locales a un proyecto de Flow y devuelve sus mediaId.
// Uso: node subir-imagen.mjs <PROYECTO_ID> <archivo1> [archivo2 ...]
// Sirve para subir el retrato oficial de Caro (assets/caro-retrato-oficial.png) a cada proyecto nuevo:
// la Caro que se crea con createCharacter en otro proyecto sale con OTRA cara.
import { FlowBrowser, optionsFromEnv } from '../../google-flow-mcp/dist/browser.js';
import { FlowClient } from '../../google-flow-mcp/dist/flow.js';
import { basename, resolve } from 'node:path';

const [PID, ...FILES] = process.argv.slice(2);
if (!PID || !FILES.length) { console.error('Uso: node subir-imagen.mjs <PROYECTO_ID> <archivo...>'); process.exit(1); }
const b = new FlowBrowser(optionsFromEnv()); const f = new FlowClient(b);
try {
  const antes = new Set((await f.contents(PID)).workflows.map((w) => w.mediaId));
  const page = await b.ready();
  await page.goto('https://flow.google.com/project/' + PID + '?hl=en', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  // 18-Oct: el menu dejo de abrir el filechooser; primero se prueba el input[type=file] oculto de la pagina.
  const inp = page.locator('input[type=file]');
  if (await inp.count()) { await inp.first().setInputFiles(FILES.map((x) => resolve(x))); }
  else {
    await page.locator('button[aria-label="Add media menu"], button[aria-label="Agregar menú de contenido multimedia"]').first().click();
    await page.waitForTimeout(1500);
    const up = page.locator('[role=menuitem], button').filter({ hasText: /upload|subir/i }).last();   // .first() agarraba «Uploads» del panel izquierdo
    const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), up.click()]);
    await fc.setFiles(FILES.map((x) => resolve(x)));
  }
  const nombres = FILES.map((x) => basename(x));
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(3000);
    const nuevos = (await f.contents(PID)).workflows.filter((w) => !antes.has(w.mediaId) && nombres.includes(w.caption));
    if (nuevos.length >= FILES.length) { for (const w of nuevos) console.log(w.caption, '->', w.mediaId); break; }
  }
} catch (e) { console.log('ERROR:', String(e.message || e).slice(0, 400)); }
finally { await b.close(); process.exit(0); }
