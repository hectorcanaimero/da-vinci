import { createReadStream, statSync } from 'node:fs';
import { extname } from 'node:path';
import { pipeline } from 'node:stream';
import { DavinciError } from '../../core/errors.mjs';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary' };

export const routes = [{
  method: 'GET',
  path: '/files/:id',
  handler(req, res, { params, library }) {
    const g = library.get(params.id);
    let st;
    try { st = g && statSync(g.filePath); } catch { /* archivo ausente en disco */ }
    if (!st?.isFile()) throw new DavinciError('not_found', 'archivo no encontrado');

    const size = st.size;
    const headers = {
      'Content-Type': g.mime || MIME[extname(g.filePath).toLowerCase()] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
    };
    let status = 200, opts = {};
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = m && m[1] !== '' ? Number(m[1]) : null;
      let end = m && m[2] !== '' ? Number(m[2]) : null;
      if (m && start === null && end !== null) { start = Math.max(0, size - end); end = size - 1; } // sufijo
      else if (end === null || end >= size) end = size - 1;
      if (!m || start === null || start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        return res.end();
      }
      status = 206;
      opts = { start, end };
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      headers['Content-Length'] = end - start + 1;
    } else {
      headers['Content-Length'] = size;
    }
    res.writeHead(status, headers);
    pipeline(createReadStream(g.filePath, opts), res, () => {});
  },
}];
