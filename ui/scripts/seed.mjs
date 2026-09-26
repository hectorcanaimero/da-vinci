// Usage: node ui/scripts/seed.mjs <DAVINCI_HOME> [count=5000]
import { openLibrary } from '../../src/library/db.mjs';

const [home, n = '5000'] = process.argv.slice(2);
if (!home) { console.error('usage: seed.mjs <DAVINCI_HOME> [count]'); process.exit(1); }

const KINDS = [
  ['image', 'openai', 'gpt-image-1', 'image/png', 'png'],
  ['image', 'fal', 'flux-pro', 'image/png', 'png'],
  ['svg', 'fal', 'recraft-v3', 'image/svg+xml', 'svg'],
  ['video', 'gemini', 'veo-3', 'video/mp4', 'mp4'],
  ['audio', 'elevenlabs', 'eleven-tts', 'audio/mpeg', 'mp3'],
  ['sfx', 'elevenlabs', 'eleven-sfx', 'audio/mpeg', 'mp3'],
  ['model-3d', 'tripo3d', 'tripo-v2', 'model/gltf-binary', 'glb'],
];
const SUBJECTS = ['a red fox', 'neon city', 'ancient temple', 'robot chef', 'misty forest', 'space station', 'ocean waves', 'lofi cafe'];
const PROJECTS = ['alpha', 'beta', 'gamma'];

const lib = openLibrary(home);
const t0 = Date.now();
const base = Date.now();
for (let i = 0; i < +n; i++) {
  const [kind, provider, model, mime, ext] = KINDS[i % KINDS.length];
  lib.record({
    createdAt: new Date(base - i * 60_000).toISOString(),
    kind, provider, model, mime,
    prompt: `${SUBJECTS[i % SUBJECTS.length]} #${i}, cinematic lighting, highly detailed`,
    costUsd: (((i % 17) + 1) * 0.01),
    filePath: `/tmp/davinci-seed/${i}.${ext}`, bytes: 1000 + i,
    source: 'cli', projectDir: `/proj/${PROJECTS[i % 3]}`, favorite: i % 25 === 0,
  });
}
console.log(`seeded ${n} rows in ${Date.now() - t0}ms`);
lib.close();
