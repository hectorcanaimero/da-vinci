import { loadConfig } from '../core/config.mjs';

// Cola en proceso: FIFO, hasta `concurrency` jobs a la vez; estado en library.jobs.

// FR-29: espera creciente entre reintentos antes de rendirse.
const RETRY_DELAYS_MS = [2000, 8000, 32000];
// Mismos códigos que habilitan el fallback entre proveedores (D9): son transitorios,
// límite de tasa del proveedor incluido — no se dan por perdidos al primer intento.
const RETRYABLE_CODES = new Set(['provider_error', 'provider_unavailable']);

export function createJobQueue({ library, router, events, concurrency = 2, outDir }) {
  const pending = []; // ids en espera
  let running = 0;
  let scheduled = 0; // reintentos esperando su backoff: no cuentan como running ni pending
  let waiters = [];
  let paused = false; // FR-28: pausada, no arranca nada nuevo; lo que ya corre, termina

  // Lo que quedó `queued`/`running` en la corrida anterior queda recuperable; decide el usuario (FR-27).
  library.jobs.markInterrupted();

  const emit = (job) => { events.emit('job', job); return job; };
  const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
  const interrupted = (id) => {
    const job = library.jobs.get(id);
    if (!job) fail('not_found', `no existe el trabajo ${id}`);
    if (job.status !== 'interrupted') fail('invalid_state', `el trabajo ${id} está ${job.status}, no interrupted`);
    return job;
  };

  const settle = () => {
    if (running === 0 && pending.length === 0 && scheduled === 0) { waiters.forEach((r) => r()); waiters = []; }
  };

  async function exec(id) {
    const job = library.jobs.get(id);
    const attempt = (job.attempts ?? 0) + 1;
    try {
      emit(library.jobs.update(id, { status: 'running', attempts: attempt }));
      const gens = await router.run(job.request, { source: job.source, outDir, library });
      emit(library.jobs.update(id, { status: 'done', generationIds: gens.map((g) => g.id) }));
      for (const g of gens) events.emit('generation', g);
    } catch (err) {
      const code = err?.code ?? 'error';
      const message = err?.message ?? String(err);
      const { maxAttempts } = loadConfig();
      if (RETRYABLE_CODES.has(code) && attempt < maxAttempts) {
        scheduled++;
        emit(library.jobs.update(id, { status: 'queued', error: { code, message } }));
        const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
        setTimeout(() => { scheduled--; pending.push(id); pump(); }, delay).unref();
        return;
      }
      try {
        emit(library.jobs.update(id, { status: 'failed', error: { code, message } }));
      } catch { /* nunca tumbar la cola */ }
    }
  }

  function pump() {
    while (!paused && running < concurrency && pending.length) {
      const id = pending.shift();
      running++;
      exec(id).finally(() => { running--; pump(); settle(); });
    }
  }

  return {
    enqueue(req, source) {
      const job = library.jobs.create({ request: req, source, status: 'queued' });
      emit(job);
      pending.push(job.id);
      pump();
      return job;
    },
    get: (id) => library.jobs.get(id),
    list: (filter) => library.jobs.list(filter),

    // Reanudar lo vuelve a poner en la cola; el intento anterior pudo haberse cobrado igual.
    resume(id) {
      interrupted(id);
      const job = emit(library.jobs.update(id, { status: 'queued', error: null }));
      pending.push(id);
      pump();
      return job;
    },

    // Descartar lo cierra sin ejecutarlo. Conserva el error que explica cómo quedó a medias.
    discard(id) {
      interrupted(id);
      return emit(library.jobs.update(id, { status: 'discarded' }));
    },
    idle: () => (running === 0 && pending.length === 0 && scheduled === 0 ? Promise.resolve() : new Promise((r) => waiters.push(r))),

    // FR-28: la concurrencia sigue saliendo de config.json; pausar sólo frena el arranque de trabajos nuevos.
    pauseQueue() { paused = true; },
    resumeQueue() { paused = false; pump(); },
    isPaused: () => paused,
  };
}
