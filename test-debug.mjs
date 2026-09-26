import { createServer } from './src/server/index.mjs';
import { openLibrary } from './src/library/db.mjs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'test-'));
process.env.DAVINCI_HOME = dir;
process.env.HOME = dir;

const library = openLibrary();
const config = { host: '127.0.0.1', apiKey: null };
console.log('Config:', config);

const server = createServer({ config, library });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
console.log('Server listening on:', base);

const res = await fetch(`${base}/api/providers`);
console.log('Response status:', res.status);
console.log('Response headers:', Object.fromEntries(res.headers));
const body = await res.text();
console.log('Response body:', body);

server.close();
process.exit(0);
