import { useEffect, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { deleteGeneration, getMigration, listLibrary, runMigration } from '../../api';
import ConfirmDelete from '../../components/ConfirmDelete';

// `maxAttempts` es FR-29 (F1.x): intentos totales por job, 1 corrida + reintentos
// (server/jobs.mjs ya lo consume). `requestTimeoutMs` y `logLevel` no tienen
// consumidor todavía del lado Node — quedan guardados en config.json igual que
// `agent` en Settings/Agents.tsx, listos para cuando esa lectura aterrice.
type AdvancedConfig = { maxAttempts?: number; requestTimeoutMs?: number; logLevel?: 'error' | 'warn' | 'info' | 'debug' };
type Migration = { detected: boolean; count?: number };

const RETRY_OPTIONS = [{ value: 1, label: 'Off' }, { value: 3, label: '3 intentos' }, { value: 5, label: '5 intentos' }];
const LOG_LEVELS: Array<'error' | 'warn' | 'info' | 'debug'> = ['error', 'warn', 'info', 'debug'];
const CONFIRM_TEXT = 'BORRAR TODO';

export default function Advanced() {
  const [cfg, setCfg] = useState<AdvancedConfig | null>(null);
  const [migration, setMigration] = useState<Migration | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrated, setMigrated] = useState<{ total: number; migrated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [danger, setDanger] = useState(false);
  const [counting, setCounting] = useState<{ ids: string[] } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    invoke<AdvancedConfig>('config_get').then(setCfg).catch((e) => setError(String(e)));
    getMigration().then(setMigration).catch(() => setMigration({ detected: false }));
  }, []);

  const patch = (next: Partial<AdvancedConfig>) => {
    setCfg((prev) => ({ ...prev, ...next }));
    invoke('config_set', { patch: next }).catch((e) => setError(String(e)));
  };

  const migrate = async () => {
    setMigrating(true);
    try {
      setMigrated(await runMigration());
    } catch (e) {
      setError(String(e));
    } finally {
      setMigrating(false);
    }
  };

  // No hay endpoint de borrado masivo (F4.3.T1 sólo dejó DELETE por id): se
  // pagina toda la biblioteca una vez para contar y de nuevo para confirmar,
  // reusando `listLibrary`/`deleteGeneration` tal cual las usa la Galería.
  const openDanger = async () => {
    setDanger(true);
    setCounting(null);
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listLibrary({ cursor, limit: 200 });
      ids.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    setCounting({ ids });
  };

  const purge = async () => {
    if (!counting) return;
    setDeleting(true);
    try {
      const BATCH = 10;
      for (let i = 0; i < counting.ids.length; i += BATCH) {
        await Promise.all(counting.ids.slice(i, i + BATCH).map((id) => deleteGeneration(id, true)));
      }
      setDanger(false);
      setCounting(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  };

  if (!cfg) return <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>;

  const maxAttempts = cfg.maxAttempts ?? 4;
  const retryValue = RETRY_OPTIONS.find((o) => o.value === maxAttempts) ? maxAttempts : 3;
  const timeoutSec = Math.round((cfg.requestTimeoutMs ?? 120000) / 1000);
  const logLevel = cfg.logLevel ?? 'warn';

  return (
    <div style={wrap}>
      <section>
        <h2 style={h2}>Resiliencia</h2>
        <p style={lead}>Qué hace Reverón cuando un proveedor falla o cuando la app se cierra en medio de un job.</p>

        {error && <div style={errorBox}>{error}</div>}

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Reintento automático</div>
            <div style={hint}>Sólo ante 429 y 5xx. Los errores de prompt o de llave no se reintentan.</div>
          </div>
          <div style={segmentWrap}>
            {RETRY_OPTIONS.map((o) => (
              <button key={o.value} type="button" style={segmentBtn(o.value === retryValue)} onClick={() => patch({ maxAttempts: o.value })}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Timeout por pedido</div>
            <div style={hint}>Si el proveedor no responde, el job se aborta y libera el slot.</div>
          </div>
          <div style={inputRow}>
            <input
              type="number" min={5} style={input} value={timeoutSec}
              onChange={(e) => patch({ requestTimeoutMs: Math.max(5, Number(e.target.value) || 120) * 1000 })}
            />
            <span style={unitLabel}>s</span>
          </div>
        </div>
      </section>

      <section>
        <h3 style={h3}>Datos</h3>

        {migration?.detected && (
          <div style={field}>
            <div style={labelWrap}>
              <div style={label}>Migrar desde Da Vinci</div>
              <div style={hint}>
                {migrated
                  ? `Importados ${migrated.migrated} de ${migrated.total} registros.`
                  : `~/.davinci detectado · ${migration.count} registros`}
              </div>
            </div>
            {!migrated && (
              <button type="button" style={btn} onClick={migrate} disabled={migrating}>
                {migrating ? 'Migrando…' : 'Migrar ahora'}
              </button>
            )}
          </div>
        )}

        <div style={field}>
          <div style={labelWrap}>
            <div style={label}>Nivel de log</div>
            <div style={hint}>debug guarda payloads completos; cuidado con las llaves.</div>
          </div>
          <div style={segmentWrap}>
            {LOG_LEVELS.map((l) => (
              <button key={l} type="button" style={segmentBtn(l === logLevel)} onClick={() => patch({ logLevel: l })}>{l}</button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h3 style={h3}>Zona de peligro</h3>
        <div style={dangerBox}>
          <div style={labelWrap}>
            <div style={label}>Borrar toda la biblioteca</div>
            <div style={hint}>Elimina todas las generaciones, su historial de costos y sus archivos.</div>
          </div>
          <button type="button" style={dangerTriggerBtn} onClick={openDanger}>Borrar todo</button>
        </div>
      </section>

      {danger && (
        counting ? (
          <ConfirmDelete
            mode="library"
            recordCount={counting.ids.length}
            fileCount={counting.ids.length}
            confirmText={CONFIRM_TEXT}
            busy={deleting}
            onCancel={() => { setDanger(false); setCounting(null); }}
            onConfirm={purge}
          />
        ) : (
          <div style={overlay}><div style={loadingPanel}>Contando la biblioteca…</div></div>
        )
      )}
    </div>
  );
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 760 };
const h2: CSSProperties = { fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' };
const h3: CSSProperties = { fontSize: 13.5, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' };
const lead: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' };

const errorBox: CSSProperties = {
  marginBottom: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--danger)',
  color: 'var(--danger)', fontSize: 12.5, background: 'var(--bg-surface)',
};

const field: CSSProperties = {
  display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'center',
  padding: '14px 0', borderTop: '1px solid var(--border-soft)',
};
const labelWrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
const label: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' };
const hint: CSSProperties = { fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 };

const inputRow: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };
const input: CSSProperties = {
  width: 100, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-primary)', outline: 'none',
};
const unitLabel: CSSProperties = { fontSize: 12, color: 'var(--text-muted)' };
const btn: CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 500, padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const segmentWrap: CSSProperties = {
  display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, padding: 2, background: 'var(--bg-input)', width: 'fit-content',
};
const segmentBtn = (active: boolean): CSSProperties => ({
  border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'var(--font-ui)', background: active ? 'var(--bg-elevated)' : 'transparent',
  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
});

const dangerBox: CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center',
  padding: '14px 16px', border: '1px solid var(--danger)', borderRadius: 10, background: 'var(--bg-surface)',
};
const dangerTriggerBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--danger)', border: '1px solid var(--danger)',
  borderRadius: 8, padding: '8px 14px', color: 'var(--bone)', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const overlay: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const loadingPanel: CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
  padding: '20px 28px', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', fontSize: 13.5,
};
