import { timingSafeEqual } from 'node:crypto';
import { DavinciError } from '../core/errors.mjs';

export const MAX_BODY = 25 * 1024 * 1024;
const LOCAL = new Set(['127.0.0.1', 'localhost', '::1']);
export const isLocalHost = (host) => LOCAL.has(host);

export function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}

export function sendError(res, err) {
  const e = err instanceof DavinciError ? err : new DavinciError('internal_error', err?.message ?? String(err));
  if (res.headersSent) return res.destroy();
  sendJson(res, e.status, { error: { code: e.code, message: e.message, details: e.details ?? null } });
}

// '/api/library/:id' → RegExp con grupos con nombre.
const compile = (pattern) =>
  new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)').replace(/\/$/, '') + '/?$');

export function createRouter(routes) {
  const table = routes.map((r) => ({ ...r, re: compile(r.path) }));
  return function match(method, pathname) {
    for (const r of table) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (m) {
        const params = Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
        return { handler: r.handler, params };
      }
    }
    return null;
  };
}

export async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new DavinciError('invalid_request', 'body demasiado grande (máx 25 MB)');
    chunks.push(c);
  }
  if (!size) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new DavinciError('invalid_request', 'body no es JSON válido');
  }
}

const safeEq = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// `?key=` solo vale en /files y /api/events (<img> y EventSource no mandan headers).
export function authorized(config, req, url) {
  if (isLocalHost(config.host)) return true;
  const { pathname } = url;
  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  const query = pathname.startsWith('/files/') || pathname === '/api/events' ? url.searchParams.get('key') : null;
  const token = bearer ?? query;
  return !!token && safeEq(token, String(config.apiKey));
}

export const needsAuth = (pathname) => /^\/(api|v1|files)(\/|$)/.test(pathname);
