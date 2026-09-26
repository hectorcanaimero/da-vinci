import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveHome } from '../core/config.mjs';

// Silence only node:sqlite's ExperimentalWarning.
const emitWarning = process.emitWarning;
process.emitWarning = function (w, ...rest) {
  const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type;
  if ((type ?? w?.name) === 'ExperimentalWarning' && /SQLite/i.test(String(w?.message ?? w))) return;
  return emitWarning.call(this, w, ...rest);
};
const { DatabaseSync } = await import('node:sqlite');
process.emitWarning = emitWarning;

const MIGRATIONS = [
  `CREATE TABLE generations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    prompt TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    requested_model TEXT,
    params TEXT NOT NULL DEFAULT '{}',
    cost_usd REAL NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL,
    mime TEXT,
    bytes INTEGER,
    source TEXT NOT NULL,
    project_dir TEXT,
    favorite INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT
  );
  CREATE INDEX generations_created ON generations(created_at DESC);
  CREATE INDEX generations_file ON generations(file_path);
  CREATE TABLE generation_inputs (
    generation_id TEXT NOT NULL REFERENCES generations(id),
    position INTEGER NOT NULL,
    input_id TEXT REFERENCES generations(id),
    input_ref TEXT,
    PRIMARY KEY (generation_id, position)
  );
  CREATE INDEX generation_inputs_input ON generation_inputs(input_id);
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    request TEXT NOT NULL,
    generation_ids TEXT,
    error TEXT
  );`,
];

const json = (s) => (s == null ? null : JSON.parse(s));
const now = () => new Date().toISOString();

const toGeneration = (r, inputs) => ({
  id: r.id, createdAt: r.created_at, kind: r.kind, prompt: r.prompt,
  provider: r.provider, model: r.model, requestedModel: r.requested_model,
  params: json(r.params) ?? {}, costUsd: r.cost_usd, filePath: r.file_path,
  mime: r.mime, bytes: r.bytes, source: r.source, projectDir: r.project_dir,
  favorite: !!r.favorite, deletedAt: r.deleted_at,
  inputs, url: `/files/${r.id}`,
});

const toJob = (r) => r && ({
  id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, status: r.status,
  source: r.source, request: json(r.request), generationIds: json(r.generation_ids),
  error: json(r.error),
});

// A date-only upper bound covers the whole day.
const hi = (v) => (v.length === 10 ? `${v}T23:59:59.999Z` : v);

export function openLibrary(home = resolveHome()) {
  mkdirSync(home, { recursive: true });
  const db = new DatabaseSync(join(home, 'davinci.db'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');

  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);

  const version = () => one('PRAGMA user_version').user_version;
  if (version() < MIGRATIONS.length) {
    tx(() => {
      // re-read under the write lock: another process may have migrated meanwhile
      for (let v = version(); v < MIGRATIONS.length; v++) {
        db.exec(MIGRATIONS[v]);
        db.exec(`PRAGMA user_version = ${v + 1}`);
      }
    });
  }

  const inputsOf = (id) =>
    all('SELECT input_id, input_ref FROM generation_inputs WHERE generation_id = ? ORDER BY position', id)
      .map((r) => ({ id: r.input_id, ref: r.input_ref }));
  const hydrate = (rows) => rows.map((r) => toGeneration(r, inputsOf(r.id)));

  const lib = {
    resolveInputId(ref) {
      if (!ref) return null;
      const m = /^davinci:(.+)$/.exec(ref) || /(?:^|^https?:\/\/[^/]+)\/files\/([^/?#]+)$/.exec(ref);
      if (m) return one('SELECT id FROM generations WHERE id = ?', m[1])?.id ?? null;
      return one('SELECT id FROM generations WHERE file_path = ? ORDER BY created_at DESC LIMIT 1', ref)?.id ?? null;
    },

    // inputs: [{ id?, ref? }]; id or ref may be any form resolveInputId accepts.
    record(g) {
      const id = g.id ?? randomUUID();
      tx(() => {
        run(
          `INSERT INTO generations (id, created_at, kind, prompt, provider, model, requested_model,
             params, cost_usd, file_path, mime, bytes, source, project_dir, favorite)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          id, g.createdAt ?? now(), g.kind, g.prompt ?? null, g.provider, g.model,
          g.requestedModel ?? null, JSON.stringify(g.params ?? {}), g.costUsd ?? 0, g.filePath,
          g.mime ?? null, g.bytes ?? null, g.source, g.projectDir ?? null, g.favorite ? 1 : 0,
        );
        (g.inputs ?? []).forEach((inp, i) => {
          const ref = inp.ref ?? inp.id ?? null;
          const inputId = lib.resolveInputId(inp.id) ?? lib.resolveInputId(inp.ref)
            ?? (inp.id && one('SELECT id FROM generations WHERE id = ?', inp.id)?.id) ?? null;
          run('INSERT INTO generation_inputs (generation_id, position, input_id, input_ref) VALUES (?,?,?,?)',
            id, i, inputId, inputId ? null : ref);
        });
      });
      return lib.get(id);
    },

    get(id) {
      const r = one('SELECT * FROM generations WHERE id = ? AND deleted_at IS NULL', id);
      return r ? toGeneration(r, inputsOf(id)) : null;
    },

    list({ q, kind, provider, model, project, from, to, favorite, cursor, limit = 60 } = {}) {
      const w = ['deleted_at IS NULL'];
      const a = [];
      if (q) { w.push("prompt LIKE ? ESCAPE '\\'"); a.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`); }
      if (kind) { w.push('kind = ?'); a.push(kind); }
      if (provider) { w.push('provider = ?'); a.push(provider); }
      if (model) { w.push('model = ?'); a.push(model); }
      if (project) { w.push('project_dir = ?'); a.push(project); }
      if (from) { w.push('created_at >= ?'); a.push(from); }
      if (to) { w.push('created_at <= ?'); a.push(hi(to)); }
      if (favorite != null) { w.push('favorite = ?'); a.push(favorite ? 1 : 0); }
      if (cursor) {
        const s = Buffer.from(cursor, 'base64').toString();
        const i = s.indexOf('|');
        w.push('(created_at < ? OR (created_at = ? AND id < ?))');
        a.push(s.slice(0, i), s.slice(0, i), s.slice(i + 1));
      }
      const rows = all(
        `SELECT * FROM generations WHERE ${w.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`,
        ...a, limit + 1,
      );
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: hydrate(page),
        nextCursor: rows.length > limit ? Buffer.from(`${last.created_at}|${last.id}`).toString('base64') : null,
      };
    },

    // Parents keep deleted rows (deletedAt set) so a child still shows its origin; children exclude them.
    lineage(id) {
      return {
        parents: hydrate(all(
          `SELECT g.* FROM generation_inputs i JOIN generations g ON g.id = i.input_id
           WHERE i.generation_id = ? ORDER BY i.position`, id)),
        children: hydrate(all(
          `SELECT DISTINCT g.* FROM generation_inputs i JOIN generations g ON g.id = i.generation_id
           WHERE i.input_id = ? AND g.deleted_at IS NULL ORDER BY g.created_at DESC, g.id DESC`, id)),
      };
    },

    setFavorite(id, bool) {
      tx(() => run('UPDATE generations SET favorite = ? WHERE id = ?', bool ? 1 : 0, id));
    },

    remove(id, { deleteFile = false } = {}) {
      const r = one('SELECT file_path FROM generations WHERE id = ?', id);
      if (!r) return;
      tx(() => run('UPDATE generations SET deleted_at = ? WHERE id = ?', now(), id));
      if (deleteFile) rmSync(r.file_path, { force: true });
    },

    spend({ from, to, groupBy = 'day' } = {}) {
      const col = { day: 'date(created_at)', provider: 'provider', model: 'model' }[groupBy];
      if (!col) throw new Error(`invalid groupBy: ${groupBy}`);
      const w = ['deleted_at IS NULL'];
      const a = [];
      if (from) { w.push('created_at >= ?'); a.push(from); }
      if (to) { w.push('created_at <= ?'); a.push(hi(to)); }
      return all(
        `SELECT ${col} AS key, SUM(cost_usd) AS costUsd, COUNT(*) AS count
         FROM generations WHERE ${w.join(' AND ')} GROUP BY key ORDER BY key`, ...a,
      ).map((r) => ({ key: r.key, costUsd: r.costUsd, count: r.count }));
    },

    spentToday() {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return one(
        'SELECT COALESCE(SUM(cost_usd), 0) AS s FROM generations WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?',
        start.toISOString(), end.toISOString(),
      ).s;
    },

    jobs: {
      create(j) {
        const t = now();
        const id = j.id ?? randomUUID();
        tx(() => run(
          'INSERT INTO jobs (id, created_at, updated_at, status, source, request, generation_ids, error) VALUES (?,?,?,?,?,?,?,?)',
          id, j.createdAt ?? t, j.updatedAt ?? t, j.status ?? 'queued', j.source,
          JSON.stringify(j.request), j.generationIds ? JSON.stringify(j.generationIds) : null,
          j.error ? JSON.stringify(j.error) : null,
        ));
        return lib.jobs.get(id);
      },
      update(id, patch) {
        const cols = { status: 'status', request: 'request', generationIds: 'generation_ids', error: 'error' };
        const sets = ['updated_at = ?'];
        const a = [now()];
        for (const [k, c] of Object.entries(cols)) {
          if (!(k in patch)) continue;
          sets.push(`${c} = ?`);
          a.push(k === 'status' || patch[k] == null ? patch[k] ?? null : JSON.stringify(patch[k]));
        }
        tx(() => run(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`, ...a, id));
        return lib.jobs.get(id);
      },
      get: (id) => toJob(one('SELECT * FROM jobs WHERE id = ?', id)) ?? null,
      list({ status, limit = 50 } = {}) {
        return all(
          `SELECT * FROM jobs ${status ? 'WHERE status = ?' : ''} ORDER BY created_at DESC, id DESC LIMIT ?`,
          ...(status ? [status] : []), limit,
        ).map(toJob);
      },
      failInterrupted() {
        return tx(() => Number(run(
          "UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE status IN ('queued','running')",
          JSON.stringify({ code: 'interrupted', message: 'Interrupted by server restart' }), now(),
        ).changes));
      },
    },

    close: () => db.close(),
  };
  return lib;
}
