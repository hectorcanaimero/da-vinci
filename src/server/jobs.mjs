// Cola en proceso: FIFO, hasta `concurrency` jobs a la vez; estado en library.jobs.
export function createJobQueue({ library, router, events, concurrency = 2, outDir }) {
  const pending = []; // ids en espera
  let running = 0;
  let waiters = [];

  const emit = (job) => { events.emit('job', job); return job; };
  const settle = () => {
    if (running === 0 && pending.length === 0) { waiters.forEach((r) => r()); waiters = []; }
  };

  async function exec(id) {
    const job = library.jobs.get(id);
    try {
      emit(library.jobs.update(id, { status: 'running' }));
      const gens = await router.run(job.request, { source: job.source, outDir, library });
      emit(library.jobs.update(id, { status: 'done', generationIds: gens.map((g) => g.id) }));
      for (const g of gens) events.emit('generation', g);
    } catch (err) {
      try {
        emit(library.jobs.update(id, {
          status: 'failed', error: { code: err?.code ?? 'error', message: err?.message ?? String(err) },
        }));
      } catch { /* nunca tumbar la cola */ }
    }
  }

  function pump() {
    while (running < concurrency && pending.length) {
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
    idle: () => (running === 0 && pending.length === 0 ? Promise.resolve() : new Promise((r) => waiters.push(r))),
  };
}
