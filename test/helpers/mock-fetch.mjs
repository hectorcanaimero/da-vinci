// Se carga con `node --import` en el proceso hijo del CLI: mockea fetch (flujo FAL) y los polls.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...a) => realSetTimeout(fn, 0, ...a);

const json = (o) => new Response(JSON.stringify(o), { status: 200 });
const routes = [
  [/queue\.fal\.run\/fal-ai/, () => json({ status_url: 'https://s/status', response_url: 'https://s/result' })],
  [/s\/status/, () => json({ status: 'COMPLETED' })],
  [/s\/result/, () => json({ images: [{ url: 'https://cdn/a.png' }] })],
  [/cdn\/a/, () => new Response(Buffer.from('png-bytes'), { headers: { 'content-type': 'image/png' } })],
];

globalThis.fetch = async (url) => {
  const hit = routes.find(([re]) => re.test(String(url)));
  if (!hit) throw new Error(`fetch sin mock: ${url}`);
  return hit[1]();
};
