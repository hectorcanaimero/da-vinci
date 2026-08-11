/**
 * KIE.ai provider — gateway multi-modelo unificado.
 * Docs: https://docs.kie.ai/market/quickstart
 * Auth: `Authorization: Bearer <KIE_API_KEY>`
 *
 * Arquitectura KIE: UN endpoint para todo (jobs/createTask) + polling (jobs/recordInfo).
 * El modelo específico se especifica en el body como { model: '...', input: {...} }.
 *
 * Ventaja: si mañana KIE agrega Sora 3 o cualquier modelo nuevo, solo agregamos
 * su nombre a KIE_MODELS y ya funciona — no hay que tocar el resto del código.
 */

const API_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS = 900_000; // 15 min (video puede tardar)

/**
 * Registry de modelos KIE.
 * Formato: { alias: { model: 'string-oficial-de-KIE', category: 'image|video|audio' } }
 * Fuente: https://kie.ai/market — actualizar cuando agreguen nuevos.
 */
export const KIE_MODELS = {
  // ── Video ────────────────────────────────────────────────
  'veo-3':          { model: 'veo3',              category: 'video' },
  'veo-3-fast':     { model: 'veo3_fast',         category: 'video' },
  'sora-2':         { model: 'sora2',             category: 'video' },
  'kling-2.1':      { model: 'kling-v2.1',        category: 'video' },
  'kling-2.5':      { model: 'kling-v2.5',        category: 'video' },
  'hailuo':         { model: 'hailuo',            category: 'video' },
  'wan-turbo':      { model: 'wan-turbo',         category: 'video' },
  'bytedance-pro':  { model: 'bytedance-v1-pro',  category: 'video' },
  'bytedance-lite': { model: 'bytedance-v1-lite', category: 'video' },
  'grok-video':     { model: 'grok-imagine-video', category: 'video' },

  // ── Image ────────────────────────────────────────────────
  'flux-2':         { model: 'flux-2',            category: 'image' },
  'imagen-4':       { model: 'imagen-4',          category: 'image' },
  'imagen-4-fast':  { model: 'imagen-4-fast',     category: 'image' },
  'imagen-4-ultra': { model: 'imagen-4-ultra',    category: 'image' },
  'ideogram':       { model: 'ideogram',          category: 'image' },
  'qwen-image':     { model: 'qwen-image',        category: 'image' },
  'recraft':        { model: 'recraft',           category: 'image' },
  'z-image':        { model: 'z-image',           category: 'image' },
  'grok-image':     { model: 'grok-imagine',      category: 'image' },
  'topaz':          { model: 'topaz',             category: 'image' },

  // ── Audio ────────────────────────────────────────────────
  'elevenlabs-tts': { model: 'elevenlabs-tts',    category: 'audio' },
};

function authHeader() {
  const key = process.env.KIE_API_KEY;
  if (!key) throw new Error('KIE_API_KEY no configurada.');
  return { Authorization: `Bearer ${key}` };
}

async function createTask({ model, input }) {
  const res = await fetch(`${API_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) throw new Error(`KIE createTask falló (${res.status}): ${await res.text()}`);
  return res.json();
}

async function recordInfo(taskId) {
  const url = new URL(`${API_BASE}/jobs/recordInfo`);
  url.searchParams.set('taskId', taskId);
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) throw new Error(`KIE recordInfo falló (${res.status}): ${await res.text()}`);
  return res.json();
}

async function pollTask(taskId) {
  const start = Date.now();
  while (Date.now() - start < POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const data = await recordInfo(taskId);
    const status = (data.data?.state ?? data.data?.status ?? data.status ?? '').toLowerCase();
    if (status === 'success' || status === 'completed' || status === 'succeeded') return data;
    if (status === 'failed' || status === 'error') {
      throw new Error(`KIE task ${taskId} FAILED: ${JSON.stringify(data)}`);
    }
  }
  throw new Error(`KIE polling timeout (>${POLL_MAX_MS / 1000}s) para task ${taskId}`);
}

/**
 * Ejecuta un modelo cualquiera de KIE con el body input tal cual lo espera.
 * Útil para modelos que no tienen wrapper específico.
 * @param {string} modelAlias - key en KIE_MODELS
 * @param {object} input      - body específico del modelo
 * @returns {Promise<object>} - respuesta cruda de recordInfo tras completar
 */
export async function runKie(modelAlias, input) {
  const entry = KIE_MODELS[modelAlias];
  if (!entry) throw new Error(`Modelo KIE desconocido: ${modelAlias}. Ver KIE_MODELS.`);
  const submit = await createTask({ model: entry.model, input });
  const taskId = submit.data?.taskId ?? submit.taskId;
  if (!taskId) throw new Error(`KIE submit sin taskId: ${JSON.stringify(submit)}`);
  return pollTask(taskId);
}

// ── High-level helpers ───────────────────────────────────────────────

/**
 * Extrae la URL del resultado (video o imagen) del payload de KIE.
 * KIE devuelve el resultado en distintos paths según el modelo.
 */
function extractResultUrls(payload) {
  const d = payload.data ?? payload;
  return (
    d.response?.resultUrls ??
    d.resultUrls ??
    (d.videoUrl ? [d.videoUrl] : null) ??
    (d.imageUrl ? [d.imageUrl] : null) ??
    []
  );
}

/**
 * Genera video con cualquier modelo de video de KIE.
 * @param {object} args
 * @param {string} args.prompt
 * @param {string} args.model - key en KIE_MODELS (categoría video)
 * @param {'16:9'|'9:16'|'1:1'} [args.aspect='16:9']
 * @param {number} [args.durationSeconds=5]
 * @param {string} [args.imageUrl] - image-to-video si el modelo lo soporta
 */
export async function generateVideo({ prompt, model = 'veo-3-fast', aspect = '16:9', durationSeconds = 5, imageUrl }) {
  const entry = KIE_MODELS[model];
  if (!entry || entry.category !== 'video') {
    throw new Error(`Modelo KIE "${model}" no es de video.`);
  }
  const input = {
    prompt,
    aspectRatio: aspect,
    duration: durationSeconds,
    ...(imageUrl && { imageUrl }),
  };
  const result = await runKie(model, input);
  return {
    videoUrls: extractResultUrls(result),
    raw: result,
  };
}

/**
 * Genera imagen con cualquier modelo de imagen de KIE.
 */
export async function generateImage({ prompt, model = 'flux-2', aspect = '1:1', numImages = 1 }) {
  const entry = KIE_MODELS[model];
  if (!entry || entry.category !== 'image') {
    throw new Error(`Modelo KIE "${model}" no es de imagen.`);
  }
  const input = {
    prompt,
    aspectRatio: aspect,
    numImages,
  };
  const result = await runKie(model, input);
  return {
    imageUrls: extractResultUrls(result),
    raw: result,
  };
}
