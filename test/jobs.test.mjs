import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { createJobQueue } from '../src/server/jobs.mjs';
import { openLibrary } from '../src/library/db.mjs';

let library, events, log;
beforeEach(async () => {
  process.env.DAVINCI_HOME = await mkdtemp(join(tmpdir(), 'davinci-jobs-'));
  library = openLibrary();
  events = new EventEmitter();
  log = [];
  events.on('job', (j) => log.push(`${j.id}:${j.status}`));
});

test('concurrencia 2 con 5 jobs, un fallo no frena la cola, eventos en orden, persistido', async () => {
  let active = 0, max = 0;
  const router = {
    async run(req) {
      active++; max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      // provider_rejected: no reintentable (D9) — este test cubre que un fallo no frena la cola, no el reintento.
      if (req.boom) throw Object.assign(new Error('boom'), { code: 'provider_rejected' });
      return [{ id: `g${req.n}` }];
    },
  };
  const gens = [];
  events.on('generation', (g) => gens.push(g.id));
  const q = createJobQueue({ library, router, events, concurrency: 2, outDir: '/tmp' });
  const jobs = [0, 1, 2, 3, 4].map((n) => q.enqueue({ n, boom: n === 1 }, 'api'));
  await q.idle();

  assert.equal(max, 2);
  for (const j of jobs) {
    const seq = log.filter((l) => l.startsWith(j.id)).map((l) => l.split(':')[1]);
    assert.deepEqual(seq, ['queued', 'running', j.request.boom ? 'failed' : 'done']);
  }
  const f = library.jobs.get(jobs[1].id);
  assert.equal(f.status, 'failed');
  assert.deepEqual(f.error, { code: 'provider_rejected', message: 'boom' });
  const d = library.jobs.get(jobs[4].id);
  assert.equal(d.status, 'done');
  assert.deepEqual(d.generationIds, ['g4']);
  assert.equal(gens.length, 4);
  assert.equal(q.list({ status: 'done' }).length, 4);
});
