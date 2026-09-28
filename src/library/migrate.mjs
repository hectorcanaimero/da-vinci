import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { openLibrary } from './db.mjs';

export const DEFAULT_DAVINCI_HOME = join(homedir(), '.davinci');

const dbPath = (home) => join(home, 'davinci.db');

async function openReadOnly(path) {
  const { DatabaseSync } = await import('node:sqlite');
  return new DatabaseSync(path, { readOnly: true });
}

// Counts what a previous Da Vinci install holds without touching it — feeds the
// "found N generations, import?" first-run prompt.
export async function detectDavinci(home = DEFAULT_DAVINCI_HOME) {
  const path = dbPath(home);
  if (!existsSync(path)) return null;
  const db = await openReadOnly(path);
  try {
    return { home, count: db.prepare('SELECT COUNT(*) AS n FROM generations').get().n };
  } finally {
    db.close();
  }
}

// Copies rows from a previous install into destHome's library. Never touches the
// source files: file_path is carried over as-is, still pointing at sourceHome/library.
// INSERT OR IGNORE on the uuid primary key makes re-running this a no-op.
export async function migrateFromDavinci({ sourceHome = DEFAULT_DAVINCI_HOME, destHome } = {}) {
  const detected = await detectDavinci(sourceHome);
  if (!detected) return { total: 0, migrated: 0 };

  openLibrary(destHome).close(); // ensure destination schema exists

  const src = await openReadOnly(dbPath(sourceHome));
  const { DatabaseSync } = await import('node:sqlite');
  const dest = new DatabaseSync(dbPath(destHome));
  dest.exec('PRAGMA busy_timeout=5000');
  try {
    const rows = src.prepare('SELECT * FROM generations').all();
    const insert = dest.prepare(
      `INSERT OR IGNORE INTO generations (id, created_at, kind, prompt, provider, model, requested_model,
         params, cost_usd, file_path, mime, bytes, source, project_dir, favorite, deleted_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    let migrated = 0;
    for (const r of rows) {
      const res = insert.run(
        r.id, r.created_at, r.kind, r.prompt, r.provider, r.model, r.requested_model,
        r.params, r.cost_usd, r.file_path, r.mime, r.bytes, r.source, r.project_dir,
        r.favorite, r.deleted_at,
      );
      if (res.changes) migrated++;
    }
    return { total: detected.count, migrated };
  } finally {
    src.close();
    dest.close();
  }
}
