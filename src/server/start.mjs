import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { loadConfig } from '../core/config.mjs';
import * as router from '../core/router.mjs';
import { openLibrary } from '../library/db.mjs';
import { importManifest } from '../library/import.mjs';
import { resolveOutputDir } from '../utils/manifest.mjs';
import { events } from './events.mjs';
import { createJobQueue } from './jobs.mjs';
import { createServer } from './index.mjs';

const OPENERS = { linux: ['xdg-open'], darwin: ['open'], win32: ['cmd', '/c', 'start', '""'] };

function openBrowser(url) {
  const [cmd, ...args] = OPENERS[process.platform] ?? [];
  if (!cmd) return;
  try {
    const p = spawn(cmd, [...args, url], { stdio: 'ignore', detached: true });
    p.on('error', () => {}); // sin navegador/opener: no fallar
    p.unref();
  } catch { /* idem */ }
}

/** Arranca API + dashboard. Flags (port/host) pisan a config.json. */
export async function startServer({ port, host, open = true, cwd = process.cwd() } = {}) {
  const config = loadConfig();
  if (port != null) config.port = Number(port);
  if (host) config.host = host;

  const library = openLibrary();
  const manifest = join(cwd, 'assets', 'generated', 'manifest.json');
  if (existsSync(manifest)) await importManifest(manifest, library).catch(() => {});

  const jobs = createJobQueue({ library, router, events, concurrency: config.concurrency, outDir: resolveOutputDir(cwd) });
  const server = createServer({ config, library, router, jobs, events });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(config.port, config.host, ok); });

  const url = `http://${config.host.includes(':') ? `[${config.host}]` : config.host}:${server.address().port}`;
  console.error(`Da Vinci escuchando en ${url}`);
  console.log(JSON.stringify({ event: 'ready', port: server.address().port, url }));
  if (open) openBrowser(url);

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    library.close();
  };
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => close().then(() => process.exit(0)));
  if (process.env.REVERON_PARENT === '1') {
    // D10, segunda defensa: sin padre viendo el pid, el cierre de stdin es la única señal de huérfano.
    process.stdin.on('end', () => close().then(() => process.exit(0)));
    process.stdin.resume();
  }
  return { server, url, close };
}
