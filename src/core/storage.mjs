import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const MIME_TO_EXT = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/webp':    'webp',
  'image/gif':     'gif',
  'image/svg+xml': 'svg',
  'video/mp4':     'mp4',
  'video/webm':    'webm',
  'video/quicktime': 'mov',
  'audio/mpeg':    'mp3',
  'audio/wav':     'wav',
  'audio/mp4':     'm4a',
  'model/gltf-binary': 'glb',
};

const EXT_TO_MIME = Object.fromEntries(Object.entries(MIME_TO_EXT).map(([m, e]) => [e, m]));

const pad = (n) => String(n).padStart(2, '0');

export function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Guarda un buffer y devuelve { filePath, mime, bytes }.
 * `slot` = { index, total }: con total > 1 el nombre lleva `-1`, `-2`… y ctx.outPath se ignora.
 */
export async function saveBufferAsset(buffer, kind, ext, ctx, slot = { index: 0, total: 1 }) {
  const multi = slot.total > 1;
  const filePath = ctx.outPath && !multi
    ? resolve(ctx.outPath)
    : resolve(ctx.outDir, `${kind}-${timestamp()}${multi ? `-${slot.index + 1}` : ''}.${ext}`);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return { filePath, mime: EXT_TO_MIME[ext] ?? 'application/octet-stream', bytes: buffer.length };
}

export async function downloadWithMime(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download falló (${res.status}): ${url}`);
  const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mime };
}

export async function saveRemoteAsset(url, kind, fallbackExt, ctx, slot) {
  const { buffer, mime } = await downloadWithMime(url);
  return saveBufferAsset(buffer, kind, MIME_TO_EXT[mime] ?? fallbackExt, ctx, slot);
}

export function saveB64Asset(b64, kind, ext, ctx, slot) {
  return saveBufferAsset(Buffer.from(b64, 'base64'), kind, ext, ctx, slot);
}
