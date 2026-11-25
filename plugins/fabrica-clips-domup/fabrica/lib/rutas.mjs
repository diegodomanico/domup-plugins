// Rutas centralizadas del worker de clips (CLIPS-C36).
// Permite correr en Windows (PC) o Linux (VPS de Hostinger) mediante variables de entorno.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const AQUI = join(LIB_DIR, '..');

export const RAIZ = process.env.CLIPS_RAIZ || join(process.cwd(), 'clips').replace(/\\/g, '/');
export const RAIZ_SETS = process.env.CLIPS_RAIZ_SETS || join(RAIZ, '_sets').replace(/\\/g, '/');
export const ENV_SECRET = process.env.CLIPS_ENV_SECRET || '';
export const ENV_LOCAL = process.env.CLIPS_ENV_LOCAL || join(process.cwd(), '.env.local').replace(/\\/g, '/');
export const SKILL_SCRIPTS = process.env.CLIPS_SKILL_SCRIPTS || join(AQUI, '..', 'vendor', 'shorts-mtl', 'scripts').replace(/\\/g, '/');
export const PLAYWRIGHT_CORE = process.env.CLIPS_PLAYWRIGHT_CORE || join(AQUI, '..', 'vendor', 'google-flow-mcp', 'dist', 'lib.js').replace(/\\/g, '/');
export const FLOW_MCP_DIST = process.env.CLIPS_FLOW_MCP_DIST || join(AQUI, '..', 'vendor', 'google-flow-mcp', 'dist').replace(/\\/g, '/');

export const CHROME_RUTAS = [
  process.env.CLIPS_CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe').replace(/\\/g, '/'),
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean);
export const CHROME_BIN = CHROME_RUTAS.find(existsSync) || null;
