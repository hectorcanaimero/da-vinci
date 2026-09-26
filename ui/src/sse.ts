import { useEffect, useSyncExternalStore } from 'react';
import { eventsUrl, listJobs } from './api';
import type { Generation, Job } from './types';

// Minimal store (no libraries): jobs by id, newest first.
let jobs: Job[] = [];
const subs = new Set<() => void>();

export function upsertJob(job: Job) {
  jobs = [job, ...jobs.filter((j) => j.id !== job.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  subs.forEach((f) => f());
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useJobs = () => useSyncExternalStore(subscribe, () => jobs);
export const useActiveJobCount = () =>
  useJobs().filter((j) => j.status === 'queued' || j.status === 'running').length;

// The server filters by a single status, so ask for each one and merge.
export async function loadActiveJobs() {
  const [q, r] = await Promise.all([listJobs('queued'), listJobs('running')]);
  [...q.items, ...r.items].forEach(upsertJob);
}

/** SSE with auto-reconnect (backoff up to 10s); re-syncs active jobs on every (re)connect. */
export function useServerEvents(onGeneration?: (g: Generation) => void, onDeleted?: (id: string) => void) {
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    let stopped = false;
    const connect = () => {
      es = new EventSource(eventsUrl());
      es.onopen = () => { delay = 1000; loadActiveJobs().catch(() => {}); };
      es.addEventListener('job', (e) => upsertJob(JSON.parse((e as MessageEvent).data)));
      es.addEventListener('generation', (e) => onGeneration?.(JSON.parse((e as MessageEvent).data)));
      es.addEventListener('generation.deleted', (e) => onDeleted?.(JSON.parse((e as MessageEvent).data).id));
      es.onerror = () => {
        es?.close();
        if (!stopped) { timer = setTimeout(connect, delay); delay = Math.min(delay * 2, 10_000); }
      };
    };
    connect();
    return () => { stopped = true; clearTimeout(timer); es?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
