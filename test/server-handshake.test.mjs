import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../src/server/cli.mjs', import.meta.url).pathname;

function readFirstLine(stream) {
  return new Promise((ok, fail) => {
    let buf = '';
    const onData = (d) => {
      buf += d;
      const i = buf.indexOf('\n');
      if (i === -1) return;
      stream.off('data', onData);
      ok(buf.slice(0, i));
    };
    stream.on('data', onData);
    stream.once('error', fail);
  });
}

test('handshake: puerto 0, línea JSON en stdout, cierre por stdin', async () => {
  const home = await mkdtemp(join(tmpdir(), 'reveron-handshake-'));
  const child = spawn(process.execPath, [CLI, '--port', '0', '--host', '127.0.0.1'], {
    env: { ...process.env, DAVINCI_HOME: home, REVERON_PARENT: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  try {
    const firstLine = await readFirstLine(child.stdout);
    const handshake = JSON.parse(firstLine);
    assert.equal(handshake.event, 'ready');
    assert.equal(typeof handshake.port, 'number');
    assert.equal(handshake.url, `http://127.0.0.1:${handshake.port}`);

    const res = await fetch(`${handshake.url}/api/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);

    const exitCode = new Promise((ok) => child.once('exit', (code) => ok(code)));
    child.stdin.end();
    assert.equal(await exitCode, 0);
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});
