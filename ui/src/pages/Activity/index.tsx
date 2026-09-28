import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  discardJob, estimate, getGeneration, getQueue, getSpend, listJobs, pauseQueue, resumeJob, resumeQueue,
} from '../../api';
import { upsertJob, useJobs, useServerEvents } from '../../sse';
import type { Job } from '../../types';
import RecoveryBanner from './RecoveryBanner';
import JobList from './JobList';

type Filter = 'all' | 'active' | 'failed' | 'ready';
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Activos' },
  { key: 'failed', label: 'Fallidos' },
  { key: 'ready', label: 'Listos' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const usd = (n: number) => `$${n.toFixed(n !== 0 && Math.abs(n) < 0.1 ? 3 : 2)}`;

// Mismo cálculo que Sidebar/Spend: el tope diario sólo sale por /api/estimate (ponytail
// ahí mismo explica por qué no hay un endpoint que lo exponga directo).
function useDailyBudget() {
  const [budget, setBudget] = useState<{ spent: number; cap: number | null } | null>(null);
  useEffect(() => {
    let live = true;
    const tick = () => {
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      Promise.all([
        getSpend({ from: dayStart.toISOString(), to: now.toISOString(), groupBy: 'day' }),
        estimate({ kind: 'image' }),
      ]).then(([spend, est]) => {
        if (live) setBudget({ spent: spend.totalUsd, cap: est.budgetLeftUsd == null ? null : est.budgetLeftUsd + spend.totalUsd });
      }).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { live = false; clearInterval(id); };
  }, []);
  return budget;
}

function useQueueStatus() {
  const [queue, setQueue] = useState<{ concurrency: number; paused: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    const tick = () => getQueue().then((q) => live && setQueue(q)).catch(() => {});
    tick();
    const id = setInterval(tick, 5000);
    return () => { live = false; clearInterval(id); };
  }, []);
  return [queue, setQueue] as const;
}

// El costo no vive en Job — sólo en la Generation que el job produce al terminar.
function useJobCosts(jobs: Job[]) {
  const [costs, setCosts] = useState<Record<string, number>>({});
  useEffect(() => {
    const pending = jobs
      .filter((j) => j.status === 'done' && j.generationIds[0] && !(j.generationIds[0] in costs))
      .map((j) => j.generationIds[0]);
    if (pending.length === 0) return;
    let live = true;
    Promise.all(pending.map((id) => getGeneration(id).then((g) => [id, g.costUsd] as const)))
      .then((pairs) => { if (live) setCosts((c) => ({ ...c, ...Object.fromEntries(pairs) })); })
      .catch(() => {});
    return () => { live = false; };
  }, [jobs, costs]);
  return costs;
}

export default function Activity() {
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const [sessionSpend, setSessionSpend] = useState(0);
  const [queue, setQueue] = useQueueStatus();
  const budget = useDailyBudget();

  useServerEvents((g) => setSessionSpend((s) => s + g.costUsd));
  useEffect(() => { listJobs(undefined, 200).then((r) => r.items.forEach(upsertJob)).catch(() => {}); }, []);

  const jobs = useJobs();
  const costs = useJobCosts(jobs);

  const interrupted = useMemo(() => jobs.filter((j) => j.status === 'interrupted'), [jobs]);
  const visible = useMemo(() => jobs.filter((j) => j.status !== 'interrupted' && j.status !== 'discarded'), [jobs]);
  const filtered = useMemo(() => visible.filter((j) => {
    if (filter === 'active') return j.status === 'queued' || j.status === 'running';
    if (filter === 'failed') return j.status === 'failed';
    if (filter === 'ready') return j.status === 'done';
    return true;
  }), [visible, filter]);

  const running = visible.filter((j) => j.status === 'running').length;
  const queued = visible.filter((j) => j.status === 'queued').length;
  const failed24h = visible.filter((j) => j.status === 'failed' && Date.now() - Date.parse(j.updatedAt) < DAY_MS).length;

  const resumeAll = () => {
    setBusy(true);
    Promise.all(interrupted.map((j) => resumeJob(j.id).then(upsertJob))).finally(() => setBusy(false));
  };
  const discardAll = () => {
    setBusy(true);
    Promise.all(interrupted.map((j) => discardJob(j.id).then(upsertJob))).finally(() => setBusy(false));
  };
  const togglePause = () => {
    if (!queue) return;
    const next = !queue.paused;
    setQueue({ ...queue, paused: next });
    (next ? pauseQueue() : resumeQueue()).catch(() => setQueue(queue));
  };

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <h1 style={title}>Actividad</h1>
          <p style={subtitle}>{running} corriendo · {queued} en cola · {failed24h} fallidos en las últimas 24 h</p>
        </div>
        <div role="group" aria-label="Filtro" style={tabs}>
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} style={tab(filter === f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <RecoveryBanner jobs={interrupted} busy={busy} onResumeAll={resumeAll} onDiscardAll={discardAll} />

      <div style={stats}>
        <Stat label="Concurrencia" value={queue ? `${running} / ${queue.concurrency}` : '…'} />
        <Stat label="En cola" value={String(queued)} />
        <Stat label="Gasto de la sesión" value={usd(sessionSpend)} />
        <Stat label="Presupuesto de hoy" value={budget ? `${usd(budget.spent)}${budget.cap == null ? '' : ` / ${usd(budget.cap)}`}` : '…'} />
        <button type="button" onClick={togglePause} disabled={!queue} style={pauseBtn}>
          {queue?.paused ? 'Reanudar cola' : 'Pausar cola'}
        </button>
      </div>

      <JobList jobs={filtered} costs={costs} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={stat}>
      <span style={statLabel}>{label}</span>
      <strong style={statValue}>{value}</strong>
    </div>
  );
}

const page: CSSProperties = { padding: 24, display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'var(--font-ui)' };
const header: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' };
const title: CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-primary)', margin: 0 };
const subtitle: CSSProperties = { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' };
const tabs: CSSProperties = { display: 'flex', gap: 4, background: 'var(--bg-elevated)', padding: 4, borderRadius: 10 };
const tab = (active: boolean): CSSProperties => ({
  padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  background: active ? 'var(--bg-surface)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
});
const stats: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap',
  padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10,
};
const stat: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 6 };
const statLabel: CSSProperties = { fontSize: 12.5, color: 'var(--text-secondary)' };
const statValue: CSSProperties = { fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' };
const pauseBtn: CSSProperties = {
  marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
