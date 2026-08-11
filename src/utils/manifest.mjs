import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Cada entry en el manifest es un registro auditable de una generación.
 * Vive en <projectDir>/assets/generated/manifest.json
 */

export function resolveOutputDir(projectRoot = process.cwd()) {
  return resolve(projectRoot, 'assets', 'generated');
}

export function resolveManifestPath(projectRoot = process.cwd()) {
  return join(resolveOutputDir(projectRoot), 'manifest.json');
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

/**
 * Registra una nueva generación en el manifest.
 * @param {object} entry
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

  const manifest = await readManifest(manifestPath);
  const id = randomUUID();
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
  manifest.generated.push(record);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
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
