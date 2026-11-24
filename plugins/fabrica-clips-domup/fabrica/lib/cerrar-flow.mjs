// Cierra el Chrome del perfil de google-flow-mcp. subir-imagen.mjs abre su propio Chrome con ese mismo perfil y falla
// si el del conector está abierto; el conector lo vuelve a abrir solo en la próxima llamada.
import { execFileSync } from 'node:child_process';
const ps = "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*google-flow-mcp*profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }";
const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
console.log(`Chrome de Flow cerrado (${out.trim().split(/\s+/).filter(Boolean).length} procesos)`);
