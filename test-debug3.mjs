import { createServer } from './src/server/index.mjs';
import { openLibrary } from './src/library/db.mjs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const realFetch = globalThis.fetch;
const home = await mkdtemp(join(tmpdir(), 'test-'));
const dir = await mkdtemp(join(tmpdir(), 'davinci-'));
process.env.DAVINCI_HOME = dir;
process.env.HOME = home;

// Clear provider keys
for (const k of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'FAL_API_KEY', 'KIE_API_KEY', 'HEYGEN_API_KEY', 'ELEVENLABS_API_KEY', 'TRIPO_API_KEY']) {
  delete process.env[k];
}

// Patch the http module to log authorized calls
import * as httpModule from './src/server/http.mjs';
const origAuthorized = httpModule.authorized;
httpModule.authorized = function(config, req, url) {
  const result = origAuthorized(config, req, url);
  console.log('authorized called:', { host: config?.host, result, pathname: url?.pathname });
  return result;
};

// Mock fetch like in test
globalThis.fetch = async (url, opts) => {
  console.log('fetch called:', url);
  const auth = opts?.headers?.Authorization || opts?.headers?.['x-goog-api-key'];
  if (!auth) {
    return new Response(JSON.stringify({ error: { message: 'no auth' } }), { status: 401 });
  }
  return new Response(JSON.stringify({ data: [] }), { status: 200 });
};

try {
  const library = openLibrary();
  const config = { host: '127.0.0.1', apiKey: null };
  console.log('Creating server with config:', config);

  const server = createServer({ config, library });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  console.log('Server listening on:', base);

  console.log('\n--- Making request ---');
  const res = await fetch(`${base}/api/providers`);
  console.log('Response status:', res.status);

  server.close();
} finally {
  globalThis.fetch = realFetch;
}
process.exit(0);
