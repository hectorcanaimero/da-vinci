import { mkdir, readFile, writeFile, open, rename, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Cada entry en el manifest es un registro auditable de una generación.
 * Vive en <projectDir>/assets/generated/manifest.json, salvo que se pase
 * `assetsDir` explícito (Ajustes → Almacenamiento, FR-46, config.json). Se
 * recibe por parámetro en vez de leerse acá para no acoplar este módulo —lo
 * usa el CLI puro también— a `core/config.mjs` y a su estado ambiente.
 */

export function resolveOutputDir(projectRoot = process.cwd(), assetsDir = null) {
  return assetsDir ? resolve(assetsDir) : resolve(projectRoot, 'assets', 'generated');
}

export function resolveManifestPath(projectRoot = process.cwd(), assetsDir = null) {
  return join(resolveOutputDir(projectRoot, assetsDir), 'manifest.json');
}

async function readManifest(path) {
  if (!existsSync(path)) return { version: 1, generated: [] };
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.generated) parsed.generated = [];
    return parsed;
  } catch {
    return { version: 1, generated: [] };
  }
}

const LOCK_WAIT_MS = 10_000;
const LOCK_STALE_MS = 30_000;

async function withLock(lockPath, fn) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      await (await open(lockPath, 'wx')).close();
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        if (Date.now() - (await stat(lockPath)).mtimeMs > LOCK_STALE_MS) {
          await unlink(lockPath).catch(() => {});
          continue;
        }
      } catch {
        continue; // el lock desapareció entre open y stat
      }
      if (Date.now() > deadline) throw new Error(`manifest lock timeout: ${lockPath}`);
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
    }
  }
  try {
    return await fn();
  } finally {
    await unlink(lockPath).catch(() => {});
  }
}

/**
 * Registra una nueva generación en el manifest.
 * @param {object} entry
 * @param {string} [entry.id]              - si viene, se usa en vez de generar uno
 * @param {string} entry.prompt
 * @param {string} entry.provider          - 'fal' | 'openai' | 'gemini' | 'kie' | 'heygen' | 'elevenlabs'
 * @param {string} entry.model             - modelo específico (ej: 'flux-pro-ultra')
 * @param {string} entry.outputPath        - path absoluto del asset generado
 * @param {number} entry.costUsd           - costo estimado en USD
 * @param {string[]} [entry.references]    - URLs o paths de referencias usadas
 * @param {object} [entry.params]          - parámetros de la request (seed, size, etc.)
 * @param {string} [entry.projectRoot=cwd()]
 * @returns {Promise<{ id: string, manifestPath: string }>}
 */
export async function recordGeneration(entry) {
  const projectRoot = entry.projectRoot ?? process.cwd();
  const manifestPath = resolveManifestPath(projectRoot);
  await mkdir(dirname(manifestPath), { recursive: true });

  const id = entry.id ?? randomUUID();
  const record = {
    id,
    timestamp: new Date().toISOString(),
    prompt: entry.prompt,
    provider: entry.provider,
    model: entry.model,
    outputPath: entry.outputPath,
    costUsd: entry.costUsd,
    references: entry.references ?? [],
    params: entry.params ?? {},
  };
  await withLock(`${manifestPath}.lock`, async () => {
    const manifest = await readManifest(manifestPath);
    manifest.generated.push(record);
    const tmp = `${manifestPath}.tmp-${process.pid}`;
    await writeFile(tmp, JSON.stringify(manifest, null, 2), 'utf8');
    await rename(tmp, manifestPath);
  });
  return { id, manifestPath };
}

/**
 * Suma total gastado en el proyecto actual (según manifest).
 */
export async function totalSpent(projectRoot = process.cwd()) {
  const manifestPath = resolveManifestPath(projectRoot);
  const manifest = await readManifest(manifestPath);
  return manifest.generated.reduce((sum, e) => sum + (e.costUsd ?? 0), 0);
}

/**
 * Devuelve las últimas N generaciones (útil para "regenerar con más variaciones").
 */
export async function recentGenerations(n = 5, projectRoot = process.cwd()) {
  const manifestPath = resolveManifestPath(projectRoot);
  const manifest = await readManifest(manifestPath);
  return manifest.generated.slice(-n);
}
