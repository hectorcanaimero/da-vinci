import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

const KIND_BY_EXT = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', svg: 'svg',
  mp4: 'video', webm: 'video', mov: 'video', mp3: 'audio', wav: 'audio', m4a: 'audio', glb: 'model-3d',
};
const MIME_BY_EXT = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', glb: 'model/gltf-binary',
};

const kindOf = (prompt, ext) => /^(bg-remove|upscale)/.exec(prompt ?? '')?.[1] ?? KIND_BY_EXT[ext] ?? 'image';

// Importa un manifest.json existente; idempotente por id.
export async function importManifest(path, lib) {
  const file = resolve(path);
  const { generated = [] } = JSON.parse(await readFile(file, 'utf8'));
  const projectDir = resolve(dirname(file), '..', '..');
  let imported = 0;
  let skipped = 0;
  for (const e of generated) {
    if (e.id && lib.get(e.id)) { skipped++; continue; }
    const ext = extname(e.outputPath ?? '').slice(1).toLowerCase();
    // el archivo puede haber desaparecido: se importa igual, sin bytes
    const bytes = await stat(e.outputPath).then((s) => s.size, () => null);
    try {
      lib.record({
        id: e.id, createdAt: e.timestamp, kind: kindOf(e.prompt, ext), prompt: e.prompt,
        provider: e.provider ?? 'unknown', model: e.model ?? 'unknown', params: e.params,
        costUsd: e.costUsd, filePath: e.outputPath, mime: MIME_BY_EXT[ext] ?? null, bytes,
        source: 'import', projectDir, inputs: (e.references ?? []).map((ref) => ({ ref })),
      });
      imported++;
    } catch (err) {
      // id borrado (soft-delete): sigue en la tabla, cuenta como ya importado
      if (!/UNIQUE|constraint/i.test(err.message)) throw err;
      skipped++;
    }
  }
  return { imported, skipped };
}
