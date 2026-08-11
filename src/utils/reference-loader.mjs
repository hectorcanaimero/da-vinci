import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB por referencia

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
};

/**
 * Descarga una URL a un file temporal y devuelve metadata.
 * @param {string} url
 * @returns {Promise<{ path: string, mime: string, bytes: number, buffer: Buffer, base64: () => string, dataUrl: () => string }>}
 */
export async function fetchReference(url) {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Referencia inválida: se esperaba URL http(s), recibido "${url}"`);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Referencia falló (${res.status}): ${url}`);

  const contentLength = parseInt(res.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_BYTES) {
    throw new Error(`Referencia demasiado grande (${contentLength}B > ${MAX_BYTES}B): ${url}`);
  }

  const mime = (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim();
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    throw new Error(`Referencia demasiado grande tras descarga (${buf.length}B): ${url}`);
  }

  const dir = await mkdtemp(join(tmpdir(), 'davinci-ref-'));
  const ext = MIME_EXT[mime] ?? extname(new URL(url).pathname) ?? '.bin';
  const path = join(dir, `ref${ext}`);
  await writeFile(path, buf);

  return {
    path,
    mime,
    bytes: buf.length,
    buffer: buf,
    base64: () => buf.toString('base64'),
    dataUrl: () => `data:${mime};base64,${buf.toString('base64')}`,
  };
}

/**
 * Procesa múltiples referencias en paralelo.
 * @param {string[]} urls
 */
export async function fetchReferences(urls = []) {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  return Promise.all(urls.map(fetchReference));
}

/**
 * Lee un archivo local y devuelve el mismo shape que fetchReference.
 */
export async function loadLocalReference(path) {
  const buf = await readFile(path);
  const ext = extname(path).toLowerCase();
  const reverseMime = Object.entries(MIME_EXT).find(([, e]) => e === ext);
  const mime = reverseMime ? reverseMime[0] : 'application/octet-stream';
  return {
    path,
    mime,
    bytes: buf.length,
    buffer: buf,
    base64: () => buf.toString('base64'),
    dataUrl: () => `data:${mime};base64,${buf.toString('base64')}`,
  };
}

export function isImageMime(mime) {
  return mime.startsWith('image/');
}

export function isVideoMime(mime) {
  return mime.startsWith('video/');
}
