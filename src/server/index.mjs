import http from 'node:http';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { DavinciError } from '../core/errors.mjs';
import { authorized, createRouter, isLocalHost, needsAuth, readJson, sendError, sendJson } from './http.mjs';
import { events as sharedEvents, sseHandler } from './events.mjs';
import { routes as apiRoutes } from './routes/api.mjs';
import { routes as filesRoutes } from './routes/files.mjs';
import { routes as openaiRoutes } from './routes/openai.mjs';
import { routes as providersRoutes } from './routes/providers.mjs';

const UI_DIR = new URL('../../dist/ui', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json' };
const PLACEHOLDER = '<!doctype html><meta charset="utf-8"><title>Da Vinci</title>'
  + '<h1>Da Vinci</h1><p>El dashboard no está compilado (falta <code>dist/ui</code>). La API sigue disponible en <code>/api</code>.</p>';

function serveFile(res, file, method) {
  res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': statSync(file).size });
  if (method === 'HEAD') return res.end();
  pipeline(createReadStream(file), res, () => {});
}

function serveStatic(res, pathname, method, uiDir) {
  if (!existsSync(uiDir)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(PLACEHOLDER);
  }
  let rel;
  try { rel = normalize(decodeURIComponent(pathname)); } catch { rel = '/'; }
  const ok = (f) => f.startsWith(uiDir + sep) && existsSync(f) && statSync(f).isFile();
  const file = join(uiDir, rel);
  if (ok(file)) return serveFile(res, file, method);
  const index = join(uiDir, 'index.html'); // fallback SPA
  if (ok(index)) return serveFile(res, index, method);
  res.writeHead(404).end();
}

// `events` y `uiDir` son opcionales (por defecto el bus compartido y dist/ui).
export function createServer({ config, library, router, jobs, events = sharedEvents, uiDir = UI_DIR }) {
  if (!isLocalHost(config.host) && !config.apiKey) {
    throw new Error(`host "${config.host}" no es local: configura apiKey en config.json para exponer el servidor (o usa host 127.0.0.1)`);
  }
  // FR-43 / F6.4.T2: Ajustes > Servidor puede apagar el endpoint compatible
  // con OpenAI; `openaiCompatEnabled` en config.json no está en DEFAULTS
  // (igual que otras claves de Ajustes) — ausente u otro valor que no sea
  // `false` significa habilitado, que es el comportamiento histórico.
  const compat = config.openaiCompatEnabled !== false ? openaiRoutes : [];
  const match = createRouter([...apiRoutes, ...filesRoutes, ...compat, ...providersRoutes,
    { method: 'GET', path: '/api/events', handler: sseHandler(events) }]);

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const { pathname } = url;
      const guarded = needsAuth(pathname);
      if (guarded && !authorized(config, req, url)) {
        res.setHeader('WWW-Authenticate', 'Bearer');
        return sendJson(res, 401, { error: { code: 'unauthorized', message: 'falta o es inválido el token Bearer', details: null } });
      }
      const m = match(req.method === 'HEAD' ? 'GET' : req.method, pathname);
      if (m) {
        const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readJson(req) : undefined;
        return await m.handler(req, res, {
          config, library, router, jobs, events,
          params: m.params, query: Object.fromEntries(url.searchParams), body,
          send: (status, data) => sendJson(res, status, data),
        });
      }
      if (guarded) return sendError(res, new DavinciError('not_found', `ruta no encontrada: ${req.method} ${pathname}`));
      if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
      serveStatic(res, pathname, req.method, uiDir);
    } catch (e) {
      sendError(res, e);
    }
  });
}
