import { readFileSync } from 'node:fs';
import { DavinciError } from '../../core/errors.mjs';
import { MODELS, COST_TABLE } from '../../core/catalog.mjs';
import { importManifest } from '../../library/import.mjs';
import { detectDavinci, migrateFromDavinci } from '../../library/migrate.mjs';
import { loadConfig, resolveHome } from '../../core/config.mjs';

const { version } = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));

const KEY_ENV = { openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', fal: 'FAL_API_KEY', kie: 'KIE_API_KEY',
  heygen: 'HEYGEN_API_KEY', elevenlabs: 'ELEVENLABS_API_KEY', tripo: 'TRIPO_API_KEY' };

const unitCost = (m) => { try { return COST_TABLE[m.costKey({})] ?? null; } catch { return null; } };
const bool = (v) => (v == null ? undefined : v === 'true');
const num = (v) => (v == null ? undefined : Number(v));
const found = (v, what) => {
  if (!v) throw new DavinciError('not_found', `${what} no encontrado`);
  return v;
};

/**
 * Barrera de gasto (FR-17, FR-32): estima sin llamar a ningún proveedor y
 * decide qué pasaría. El tope diario va primero — `confirm` no lo saltea.
 */
function gate(request, { router, library }) {
  const est = router.estimate(request, { library }); // 400 si es inválido
  const dailyBudgetUsd = loadConfig().dailyBudgetUsd;
  const left = est.budgetLeftUsd;
  const blocked = left != null && (left <= 0 || est.costUsd > left);
  return { ...est, dailyBudgetUsd, spentTodayUsd: library.spentToday(), blocked,
    needsConfirm: !blocked && est.level === 'confirm' };
}

export const routes = [
  { method: 'GET', path: '/api/health', handler: (req, res, { send }) => send(200, { ok: true, version }) },

  { method: 'GET', path: '/api/models', handler: (req, res, { send, query }) => send(200, {
    items: MODELS.filter((m) => !query.kind || m.kind === query.kind).map((m) => ({
      id: m.id, kind: m.kind, provider: m.provider, model: m.model, acceptsInputs: !!m.acceptsInputs,
      unitCostUsd: unitCost(m), available: !!process.env[KEY_ENV[m.provider]],
    })),
  }) },

  // Modo de sólo estimar (FR-18): ni proveedor, ni gasto, ni asset.
  { method: 'POST', path: '/api/estimate', handler: (req, res, { send, body, router, library }) =>
    send(200, gate(body ?? {}, { router, library })) },

  { method: 'POST', path: '/api/generations', handler(req, res, { send, body, router, library, jobs }) {
    const request = body ?? {};
    const est = gate(request, { router, library });
    if (est.blocked) {
      throw new DavinciError('budget_exceeded', `Tope diario de $${est.dailyBudgetUsd} alcanzado`, est);
    }
    if (est.needsConfirm && !request.confirm) {
      throw new DavinciError('cost_confirm_required', `Costo alto ($${est.costUsd.toFixed(3)}): requiere confirmación`, est);
    }
    const source = req.headers['x-davinci-source'] === 'dashboard' ? 'dashboard' : 'api';
    send(202, { job: jobs.enqueue(request, source) });
  } },

  { method: 'GET', path: '/api/jobs', handler: (req, res, { send, query, jobs }) =>
    send(200, { items: jobs.list({ status: query.status, limit: num(query.limit) }) }) },

  { method: 'GET', path: '/api/jobs/:id', handler: (req, res, { send, params, jobs }) =>
    send(200, found(jobs.get(params.id), 'job')) },

  { method: 'GET', path: '/api/library', handler: (req, res, { send, query, library }) =>
    send(200, library.list({ ...query, favorite: bool(query.favorite), limit: num(query.limit) })) },

  { method: 'GET', path: '/api/library/:id', handler(req, res, { send, params, library }) {
    const g = found(library.get(params.id), 'asset');
    send(200, { ...g, ...library.lineage(g.id) });
  } },

  { method: 'PATCH', path: '/api/library/:id', handler(req, res, { send, params, body, library }) {
    found(library.get(params.id), 'asset');
    if (typeof body?.favorite !== 'boolean') throw new DavinciError('invalid_request', 'favorite debe ser boolean');
    library.setFavorite(params.id, body.favorite);
    send(200, library.get(params.id));
  } },

  { method: 'DELETE', path: '/api/library/:id', handler(req, res, { params, query, library, events }) {
    found(library.get(params.id), 'asset');
    library.remove(params.id, { deleteFile: query.file === 'true' });
    events.emit('generation.deleted', { id: params.id });
    res.writeHead(204).end();
  } },

  // ponytail: recorre toda la biblioteca; agregar un GROUP BY en db si crece.
  { method: 'GET', path: '/api/projects', handler(req, res, { send, library }) {
    const counts = new Map();
    let cursor;
    do {
      const page = library.list({ cursor, limit: 500 });
      for (const g of page.items) if (g.projectDir) counts.set(g.projectDir, (counts.get(g.projectDir) ?? 0) + 1);
      cursor = page.nextCursor;
    } while (cursor);
    send(200, { items: [...counts].map(([dir, count]) => ({ dir, count })) });
  } },

  { method: 'GET', path: '/api/spend', handler(req, res, { send, query, library }) {
    if (query.groupBy && !['day', 'provider', 'model'].includes(query.groupBy)) {
      throw new DavinciError('invalid_request', 'groupBy inválido');
    }
    const items = library.spend(query);
    send(200, { items, totalUsd: items.reduce((s, i) => s + i.costUsd, 0) });
  } },

  { method: 'POST', path: '/api/import', handler: async (req, res, { send, body, library }) => {
    if (!body?.path) throw new DavinciError('invalid_request', 'falta path');
    send(200, await importManifest(body.path, library));
  } },

  { method: 'GET', path: '/api/migration', handler: async (req, res, { send }) => {
    const detected = await detectDavinci();
    if (detected) {
      send(200, { detected: true, count: detected.count });
    } else {
      send(200, { detected: false });
    }
  } },

  { method: 'POST', path: '/api/migration/run', handler: async (req, res, { send }) => {
    const result = await migrateFromDavinci({ destHome: resolveHome() });
    send(200, result);
  } },

  { method: 'POST', path: '/api/jobs/:id/resume', handler: (req, res, { send, params, jobs }) => {
    try {
      const job = jobs.resume(params.id);
      send(200, job);
    } catch (e) {
      throw new DavinciError(e?.code ?? 'internal_error', e?.message ?? String(e));
    }
  } },

  { method: 'POST', path: '/api/jobs/:id/discard', handler: (req, res, { send, params, jobs }) => {
    try {
      const job = jobs.discard(params.id);
      send(200, job);
    } catch (e) {
      throw new DavinciError(e?.code ?? 'internal_error', e?.message ?? String(e));
    }
  } },

  { method: 'POST', path: '/api/queue/pause', handler: (req, res, { send, jobs }) => {
    jobs.pauseQueue();
    send(200, { paused: true });
  } },

  { method: 'POST', path: '/api/queue/resume', handler: (req, res, { send, jobs }) => {
    jobs.resumeQueue();
    send(200, { paused: false });
  } },

  { method: 'GET', path: '/api/spend/export', handler(req, res, { query, library }) {
    const csv = exportSpendCsv(library, query);
    const timestamp = new Date().toISOString().split('T')[0];
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gasto-${timestamp}.csv"`,
    });
    res.end(csv);
  } },
];

function escapeCsvField(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[,"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportSpendCsv(library, { from, to } = {}) {
  // ponytail: no pagination; if exports get huge, stream instead.
  const items = [];
  let cursor;
  do {
    const page = library.list({ from, to, cursor, limit: 500 });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  const header = ['fecha', 'tipo', 'proveedor', 'modelo', 'costo', 'prompt', 'id'];
  const rows = items.map((g) => {
    const promptTruncated = (g.prompt ?? '').slice(0, 200);
    return [
      g.createdAt,
      g.kind,
      g.provider,
      g.model,
      g.costUsd.toFixed(6),
      promptTruncated,
      g.id,
    ].map(escapeCsvField).join(',');
  });
  return [header.join(','), ...rows].join('\n') + '\n';
}
