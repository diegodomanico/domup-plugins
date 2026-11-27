// Cierra el Chrome del perfil de Flow de ESTE carril. subir-imagen.mjs abre su propio Chrome con ese mismo perfil y falla
// si el del conector está abierto; el conector lo vuelve a abrir solo en la próxima llamada.
// 09-Nov: con carriles en paralelo cada uno tiene su perfil (FLOW_PROFILE_DIR). Sin esa variable es el principal
// (…\.google-flow-mcp\profile) y los demás perfiles (profile-gmail, …) no se tocan.
import { execFileSync } from 'node:child_process';
const perfil = (process.env.FLOW_PROFILE_DIR || '').split(/[\/]/).pop();
const filtro = perfil && perfil !== 'profile'
  ? `$_.CommandLine -match 'google-flow-mcp.${perfil.replace(/[^A-Za-z0-9_-]/g, '')}([^A-Za-z0-9_-]|$)'`   // sin barras invertidas: dentro de una plantilla se perdian y el filtro no encontraba nada (09-Nov)
  : `$_.CommandLine -like '*google-flow-mcp*profile*' -and $_.CommandLine -notmatch 'google-flow-mcp.profile-'`;
const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { ${filtro} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }`;
const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
console.log(`Chrome de Flow cerrado (${out.trim().split(/\s+/).filter(Boolean).length} procesos${perfil ? `, perfil ${perfil}` : ''})`);
