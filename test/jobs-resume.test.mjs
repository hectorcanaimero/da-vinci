import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { createJobQueue } from '../src/server/jobs.mjs';
import { openLibrary } from '../src/library/db.mjs';

let home;
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'davinci-resume-')); });

// Un router que se cuelga en el primer job: deja uno `running` y otro `queued`, como un cierre real.
const hangingRouter = () => ({ run: () => new Promise(() => {}) });
const okRouter = (ran) => ({ run: async (req) => { ran.push(req.n); return [{ id: `g${req.n}` }]; } });

const queue = (library, router, events = new EventEmitter()) =>
  createJobQueue({ library, router, events, concurrency: 1, outDir: '/tmp' });

test('al reabrir, lo que quedó a medias queda interrupted y no failed', () => {
  const a = openLibrary(home);
  const q = queue(a, hangingRouter());
  const running = q.enqueue({ n: 0 }, 'test');
  const queued = q.enqueue({ n: 1 }, 'test');
  assert.equal(a.jobs.get(running.id).status, 'running');
  assert.equal(a.jobs.get(queued.id).status, 'queued');
  a.close(); // el servidor se muere con la cola a medias

  const b = openLibrary(home);
  queue(b, okRouter([]));
  for (const { id } of [running, queued]) {
    const job = b.jobs.get(id);
    assert.equal(job.status, 'interrupted');
    assert.notEqual(job.status, 'failed');
    assert.equal(job.error.code, 'interrupted');
    // Honestidad: el estado dice que quedó a medias, no que salió gratis.
    assert.match(job.error.message, /cobrado/);
  }
  assert.equal(b.jobs.list({ status: 'interrupted' }).length, 2);
  assert.equal(b.jobs.get(running.id).attempts, 1, 'el intento que se cortó ya está contado');
  assert.equal(b.jobs.get(queued.id).attempts, 0);
  b.close();
});

test('reanudar los vuelve a ejecutar', async () => {
  const a = openLibrary(home);
  const q0 = queue(a, hangingRouter());
  const ids = [q0.enqueue({ n: 0 }, 'test').id, q0.enqueue({ n: 1 }, 'test').id];
  a.close();

  const b = openLibrary(home);
  const ran = [];
  const events = new EventEmitter();
  const seen = [];
  events.on('job', (j) => seen.push(`${j.id}:${j.status}`));
  const q = queue(b, okRouter(ran), events);

  for (const id of ids) assert.equal(q.resume(id).status, 'queued');
  await q.idle();

  assert.deepEqual(ran.sort(), [0, 1]);
  for (const id of ids) {
    const job = b.jobs.get(id);
    assert.equal(job.status, 'done');
    assert.equal(job.error, null, 'reanudar limpia el error de la interrupción');
    assert.deepEqual(seen.filter((s) => s.startsWith(id)).map((s) => s.split(':')[1]),
      ['queued', 'running', 'done']);
  }
  assert.equal(b.jobs.get(ids[0]).attempts, 2);
  b.close();
});

test('descartar los cierra sin ejecutarlos', async () => {
  const a = openLibrary(home);
  const id = queue(a, hangingRouter()).enqueue({ n: 0 }, 'test').id;
  a.close();

  const b = openLibrary(home);
  const ran = [];
  const q = queue(b, okRouter(ran));

  const job = q.discard(id);
  assert.equal(job.status, 'discarded');
  assert.equal(job.error.code, 'interrupted', 'sigue diciendo cómo quedó a medias');
  await q.idle();
  assert.deepEqual(ran, [], 'descartar no ejecuta nada');
  assert.equal(b.jobs.get(id).attempts, 1, 'no suma intentos: sólo queda el que se cortó');
  assert.equal(b.jobs.list({ status: 'interrupted' }).length, 0);
  b.close();
});

test('reanudar o descartar algo que no está interrumpido es un error claro', async () => {
  const library = openLibrary(home);
  const ran = [];
  const q = queue(library, okRouter(ran));
  const { id } = q.enqueue({ n: 0 }, 'test');
  await q.idle();

  for (const op of ['resume', 'discard']) {
    assert.throws(() => q[op](id), (e) => e.code === 'invalid_state' && /done/.test(e.message));
    assert.throws(() => q[op]('no-existe'), (e) => e.code === 'not_found');
  }
  assert.deepEqual(ran, [0], 'no se reejecutó nada');
  library.close();
});

test('una fila vieja, sin attempts, sigue siendo válida tras la migración', () => {
  const lib = openLibrary(home);
  const { id } = lib.jobs.create({ source: 'test', request: { n: 0 }, status: 'done' });
  assert.equal(lib.jobs.get(id).attempts, 0);
  assert.equal(lib.jobs.update(id, { attempts: 3 }).attempts, 3);
  lib.close();
});
