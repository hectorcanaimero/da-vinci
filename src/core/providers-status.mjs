import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { injectSecretsIntoEnv, keySources } from '../utils/secrets.mjs';
import { listVoices as heygenVoices } from '../providers/heygen.mjs';
import { listVoices as elevenVoices } from '../providers/elevenlabs.mjs';
import { getBalance as tripoBalance } from '../providers/tripo.mjs';

/**
 * Estado de cada proveedor: { id, status: 'connected'|'missing'|'error', source, keyHint, error? }.
 * La key completa nunca sale de este módulo: solo keyHint (`…` + últimos 4).
 */

async function checkFetch(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

// Llamada barata real por proveedor; lanza si la key no sirve.
const CHECKS = {
  openai: (k) => checkFetch('https://api.openai.com/v1/models', { Authorization: `Bearer ${k}` }),
  gemini: (k) => checkFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { 'x-goog-api-key': k }),
  // Status de un request inexistente: 404 = key válida, 401/403 = key inválida.
  fal: async (k) => {
    const res = await fetch('https://queue.fal.run/fal-ai/flux/requests/00000000-0000-0000-0000-000000000000/status', {
      headers: { Authorization: `Key ${k}` },
    });
    if (res.status === 401 || res.status === 403) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  },
  kie: async (k) => {
    const res = await checkFetch('https://api.kie.ai/api/v1/chat/credit', { Authorization: `Bearer ${k}` });
    const body = await res.json().catch(() => ({}));
    if (body.code !== undefined && body.code !== 200) throw new Error(`KIE ${body.code}: ${body.msg ?? ''}`);
  },
  heygen: () => heygenVoices(),
  elevenlabs: () => elevenVoices(),
  tripo: () => tripoBalance(),
};

export const PROVIDER_IDS = Object.keys(CHECKS);

const envKey = (id) => `${id.toUpperCase()}_API_KEY`;
// Keys cortas (≤8) no muestran nada: los últimos 4 serían media key o la key entera.
const keyHint = (key) => (key.length > 8 ? `…${key.slice(-4)}` : '…');
const envFilePath = () => join(homedir(), '.config', 'da-vinci', '.env');

function assertKnown(id) {
  if (!CHECKS[id]) throw new Error(`Proveedor desconocido: ${id}`);
}

let loaded;
function ensureSecretsLoaded() {
  // Sin credenciales configuradas loadSecrets lanza: acá eso solo significa 'missing'.
  loaded ??= injectSecretsIntoEnv().catch(() => {});
  return loaded;
}

function baseStatus(id) {
  const key = process.env[envKey(id)];
  if (!key) return { id, status: 'missing', source: null, keyHint: null };
  return { id, status: 'connected', source: keySources.get(envKey(id)) ?? 'env', keyHint: keyHint(key) };
}

/** Prueba la key del proveedor con una llamada real barata. */
export async function testProvider(id) {
  assertKnown(id);
  await ensureSecretsLoaded();
  const status = baseStatus(id);
  if (status.status === 'missing') return status;
  const key = process.env[envKey(id)];
  try {
    await CHECKS[id](key);
    return status;
  } catch (err) {
    // Algunas APIs devuelven la key en el mensaje de error: nunca la dejamos salir.
    const msg = String(err?.message ?? err).split(key).join(status.keyHint);
    return { ...status, status: 'error', error: msg };
  }
}

/** Estado de todos los proveedores (prueba en paralelo los que tienen key). */
export async function getProvidersStatus() {
  return Promise.all(PROVIDER_IDS.map(testProvider));
}

/**
 * Guarda la key en ~/.config/da-vinci/.env (modo 600, conserva otras líneas),
 * actualiza process.env y devuelve el estado tras testProvider.
 */
export async function saveKey(id, key) {
  assertKnown(id);
  if (typeof key !== 'string' || !key.trim() || /[\r\n]/.test(key)) {
    throw new Error('Key inválida: debe ser un string no vacío de una sola línea');
  }
  key = key.trim();
  await ensureSecretsLoaded();

  const name = envKey(id);
  const path = envFilePath();
  await mkdir(join(homedir(), '.config', 'da-vinci'), { recursive: true, mode: 0o700 });
  const current = await readFile(path, 'utf8').catch((err) => {
    if (err.code === 'ENOENT') return '';
    throw err;
  });

  const re = new RegExp(`^\\s*${name}\\s*=`);
  const lines = current ? current.replace(/\r?\n$/, '').split(/\r?\n/) : [];
  const kept = lines.filter((l) => !re.test(l));
  kept.push(`${name}=${key}`);

  await writeFile(path, kept.join('\n') + '\n', { mode: 0o600 });
  await chmod(path, 0o600); // writeFile solo aplica mode al crear

  process.env[name] = key;
  keySources.set(name, `dotenv:${path}`);
  return testProvider(id);
}
