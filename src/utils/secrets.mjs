import { loadSecrets as loadInfisicalSecrets } from './infisical.mjs';
import { loadDotenv, searchPaths as dotenvSearchPaths } from './dotenv.mjs';

/**
 * Facade para cargar secretos de Da Vinci desde múltiples fuentes.
 *
 * Auto-detección (primera que aplique gana):
 *   1. Infisical      — si INFISICAL_URL + INFISICAL_CLIENT_ID + INFISICAL_CLIENT_SECRET + DAVINCI_PROJECT_ID están seteados
 *   2. .env file      — si existe archivo en una de las rutas conocidas (ver dotenv.mjs)
 *   3. process.env    — si al menos una de las keys esperadas ya vive en el shell
 *
 * Override explícito con DAVINCI_SECRETS_SOURCE=infisical|dotenv|env
 *
 * Las 6 keys que Da Vinci espera:
 *   OPENAI_API_KEY, GEMINI_API_KEY, FAL_API_KEY, KIE_API_KEY, HEYGEN_API_KEY,
 *   ELEVENLABS_API_KEY, TRIPO_API_KEY
 *
 * Las 3 primeras son necesarias para el 80% de casos; el resto son opcionales.
 */

const EXPECTED_KEYS = [
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'FAL_API_KEY',
  'KIE_API_KEY',
  'HEYGEN_API_KEY',
  'ELEVENLABS_API_KEY',
  'TRIPO_API_KEY',
];

const INFISICAL_ENV = [
  'INFISICAL_URL',
  'INFISICAL_CLIENT_ID',
  'INFISICAL_CLIENT_SECRET',
  'DAVINCI_PROJECT_ID',
];

function detectSource() {
  const override = process.env.DAVINCI_SECRETS_SOURCE;
  if (override) return override.toLowerCase();

  const hasAllInfisical = INFISICAL_ENV.every((k) => process.env[k]);
  if (hasAllInfisical) return 'infisical';

  return 'auto'; // fallback: probamos dotenv → env
}

/**
 * Carga secretos desde la mejor fuente disponible.
 * @returns {Promise<{ source: string, path?: string|null, secrets: Record<string,string> }>}
 */
export async function loadSecrets() {
  const source = detectSource();

  if (source === 'infisical') {
    const secrets = await loadInfisicalSecrets();
    return { source: 'infisical', secrets };
  }

  if (source === 'dotenv' || source === 'auto') {
    const result = await loadDotenv();
    if (result.found) {
      return { source: 'dotenv', path: result.path, secrets: result.secrets };
    }
    if (source === 'dotenv') {
      throw new Error(
        `Da Vinci: DAVINCI_SECRETS_SOURCE=dotenv pero no encontré .env en:\n  ${dotenvSearchPaths().join('\n  ')}\n` +
        `Crealo o cambiá DAVINCI_SECRETS_SOURCE.`
      );
    }
  }

  // Último recurso: leer directo de process.env
  const envSecrets = {};
  for (const key of EXPECTED_KEYS) {
    if (process.env[key]) envSecrets[key] = process.env[key];
  }
  if (Object.keys(envSecrets).length > 0) {
    return { source: 'env', secrets: envSecrets };
  }

  throw new Error(buildSetupError());
}

/**
 * Inyecta las keys en process.env (sin pisar las que ya existan) y devuelve metadata.
 */
export async function injectSecretsIntoEnv() {
  const { source, path, secrets } = await loadSecrets();
  for (const [k, v] of Object.entries(secrets)) {
    if (!process.env[k]) process.env[k] = v;
  }
  return { source, path, keys: Object.keys(secrets) };
}

function buildSetupError() {
  return `Da Vinci: no encontré credenciales configuradas.

Elegí UNA de estas opciones:

── OPCIÓN A — Infisical (recomendado para uso profesional / multi-máquina) ──
Configurá en tu shell (~/.zshrc o ~/.bashrc):
  export INFISICAL_URL="https://tu-infisical.com"
  export INFISICAL_CLIENT_ID="..."
  export INFISICAL_CLIENT_SECRET="..."
  export DAVINCI_PROJECT_ID="..."
  export DAVINCI_ENV="prod"

── OPCIÓN B — archivo .env (más simple para uso personal) ──
Creá cualquiera de estos files con las keys que tengas:
${dotenvSearchPaths().map((p) => `  ${p}`).join('\n')}
Ejemplo del contenido:
  OPENAI_API_KEY=sk-...
  GEMINI_API_KEY=AIza...
  FAL_API_KEY=xxx:yyy
  # las demás son opcionales

── OPCIÓN C — variables de entorno directas (útil para CI/CD) ──
Simplemente exportá las keys en tu shell:
  export OPENAI_API_KEY="sk-..."
  export FAL_API_KEY="xxx:yyy"
  # etc.

Ver README completo: ~/.claude/skills/da-vinci/README.md#setup`;
}

export { EXPECTED_KEYS };
