import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLibrary } from '../src/library/db.mjs';

const CLI = new URL('../src/generate.mjs', import.meta.url).pathname;

test('serve arranca, responde /api/health y deja recuperables los jobs interrumpidos', async () => {
  const home = await mkdtemp(join(tmpdir(), 'davinci-start-'));
  const seed = openLibrary(home);
  const { id } = seed.jobs.create({ request: { intent: 'image' }, source: 'test', status: 'running' });
  seed.close();

  const child = spawn(process.execPath, [CLI, 'serve', '--port', '0', '--no-open'], {
    cwd: home, env: { ...process.env, DAVINCI_HOME: home }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    const url = await new Promise((ok, fail) => {
      let out = '';
      child.stdout.on('data', (d) => {
        out += d;
        const i = out.indexOf('\n');
        if (i !== -1) ok(JSON.parse(out.slice(0, i)).url);
      });
      child.once('exit', () => fail(new Error(`salió sin URL: ${out}`)));
    });
    const res = await fetch(`${url}/api/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);

    const lib = openLibrary(home);
    const job = lib.jobs.get(id);
    lib.close();
    assert.equal(job.status, 'interrupted');
    assert.equal(job.error.code, 'interrupted');
  } finally {
    const exited = new Promise((r) => child.once('exit', r));
    child.kill('SIGTERM');
    assert.equal(await exited, 0);
  }
});
