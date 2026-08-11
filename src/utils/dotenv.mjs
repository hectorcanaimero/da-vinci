import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

/**
 * Loader minimalista de `.env` sin dependencias externas.
 *
 * Orden de búsqueda (primero que exista gana):
 *   1. $DAVINCI_ENV_FILE      — override explícito del usuario
 *   2. ./.da-vinci.env        — específico del proyecto actual (cwd)
 *   3. ~/.config/da-vinci/.env — nivel usuario (recomendado)
 *   4. ~/.claude/skills/da-vinci/.env — último recurso (menos ideal, mezcla config con código)
 */

const SEARCH_PATHS = () => [
  process.env.DAVINCI_ENV_FILE,
  resolve(process.cwd(), '.da-vinci.env'),
  resolve(homedir(), '.config', 'da-vinci', '.env'),
  resolve(homedir(), '.claude', 'skills', 'da-vinci', '.env'),
].filter(Boolean);

/**
 * Parser mínimo de formato .env:
 *   - Ignora líneas vacías y las que empiezan con #
 *   - KEY=value  o  KEY="value con espacios"  o  KEY='value'
 *   - No hace substitution (no interpola $OTHER_VAR)
 */
function parseEnvContent(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) out[key] = value;
  }
  return out;
}

/**
 * Busca y carga el primer .env que exista.
 * @returns {Promise<{ found: boolean, path: string|null, secrets: Record<string,string> }>}
 */
export async function loadDotenv() {
  for (const path of SEARCH_PATHS()) {
    if (path && existsSync(path)) {
      const content = await readFile(path, 'utf8');
      return { found: true, path, secrets: parseEnvContent(content) };
    }
  }
  return { found: false, path: null, secrets: {} };
}

export function searchPaths() {
  return SEARCH_PATHS();
}
