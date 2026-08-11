/**
 * FAL provider — swiss army knife.
 * Docs: https://docs.fal.ai
 * Auth: `Authorization: Key <FAL_API_KEY>` (format: id:secret)
 * Queue API: async submit + poll pattern.
 */

const QUEUE_BASE = 'https://queue.fal.run';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 300_000; // 5 min

/**
 * Model registry — maps abstract intent → FAL app path.
 * NOTE: FAL app IDs son versionados. Verificar en https://fal.ai/models si hay bumps.
 * Actualizado: Aug 2026 con modelos post-cutoff (FLUX 2, Nano-Banana 2, Veo 3.1, Sora 2).
 */
export const FAL_MODELS = {
  // Images ─ FLUX family (photorealistic + general purpose)
  'flux-schnell':     'fal-ai/flux/schnell',
  'flux-dev':         'fal-ai/flux/dev',
  'flux-pro':         'fal-ai/flux-pro/v1.1',
  'flux-pro-ultra':   'fal-ai/flux-pro/v1.1-ultra',
  'flux-2':           'fal-ai/flux-2',                   // FLUX 2 (2026)
  'flux-2-flex':      'fal-ai/flux-2-flex',              // FLUX 2 con controles avanzados

  // Images ─ Nano-Banana (Gemini image family via FAL proxy)
  'nano-banana':      'fal-ai/nano-banana',
  'nano-banana-2':    'fal-ai/nano-banana-2',            // Nano-Banana Pro / v2

  // Images ─ vector / brand (Recraft es EL rey del vector look)
  'recraft-v3':       'fal-ai/recraft-v3',               // raster output con estilos vector
  'recraft-v3-svg':   'fal-ai/recraft/v3/text-to-image/svg', // SVG output vectorial

  // Images ─ text-in-image (Ideogram gana en tipografía dentro de la imagen)
  'ideogram-v2':       'fal-ai/ideogram/v2',
  'ideogram-v2-turbo': 'fal-ai/ideogram/v2/turbo',
  'ideogram-v3':       'fal-ai/ideogram/v3',

  // Post-processing
  'bria-bg-remove':   'fal-ai/bria/background/remove',
  'clarity-upscaler': 'fal-ai/clarity-upscaler',
  'real-esrgan':      'fal-ai/real-esrgan',

  // Video ─ Veo family (Google)
  'veo-3':            'fal-ai/veo3/text-to-video',
  'veo-3.1':          'fal-ai/veo3.1/text-to-video',
  'veo-3-fast':       'fal-ai/veo3/fast/text-to-video',

  // Video ─ Sora family (OpenAI)
  'sora-2':           'fal-ai/sora-2/text-to-video',

  // Video ─ Kling family (Kuaishou)
  'kling-1.6-std':    'fal-ai/kling-video/v1.6/standard/text-to-video',
  'kling-1.6-pro':    'fal-ai/kling-video/v1.6/pro/text-to-video',
  'kling-2.1-master': 'fal-ai/kling-video/v2.1/master/text-to-video',

  // Video ─ otros
  'luma-dream':       'fal-ai/luma-dream-machine/ray-2/text-to-video',
  'minimax-hailuo':   'fal-ai/minimax/hailuo-02/standard/text-to-video',
  'wan-turbo':        'fal-ai/wan/turbo/text-to-video',
};

function authHeader() {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY no configurada.');
  return { Authorization: `Key ${key}` };
}

async function submitRequest(appPath, payload) {
  const res = await fetch(`${QUEUE_BASE}/${appPath}`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`FAL submit falló (${res.status}): ${await res.text()}`);
  }
  return res.json(); // { request_id, status_url, response_url, ... }
}

async function pollStatus(statusUrl) {
  const start = Date.now();
  while (Date.now() - start < POLL_MAX_MS) {
    const res = await fetch(statusUrl, { headers: authHeader() });
    if (!res.ok) throw new Error(`FAL status falló (${res.status})`);
    const data = await res.json();
    if (data.status === 'COMPLETED') return data;
    if (data.status === 'FAILED') {
      throw new Error(`FAL job FAILED: ${JSON.stringify(data)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`FAL polling timeout (>${POLL_MAX_MS / 1000}s)`);
}

async function fetchResult(responseUrl) {
  const res = await fetch(responseUrl, { headers: authHeader() });
  if (!res.ok) throw new Error(`FAL result fetch falló (${res.status}): ${await res.text()}`);
  return res.json();
}

/**
 * Ejecuta un modelo de FAL de forma async + polling.
 * @param {string} modelKey - una de las keys en FAL_MODELS o un app-path completo
 * @param {object} payload  - body específico del modelo (prompt, image_url, etc.)
 * @returns {Promise<object>} - el JSON de respuesta del modelo
 */
export async function runFal(modelKey, payload) {
  const appPath = FAL_MODELS[modelKey] ?? modelKey;
  const submitted = await submitRequest(appPath, payload);
  await pollStatus(submitted.status_url);
  return fetchResult(submitted.response_url);
}

// ── High-level helpers ───────────────────────────────────────────────

/**
 * Genera una imagen.
 * @param {object} args
 * @param {string} args.prompt
 * @param {string} [args.model='flux-pro-ultra']
 * @param {string} [args.aspect='16:9'] - '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
 * @param {number} [args.numImages=1]
 * @param {string[]} [args.imageUrls]    - referencias (para modelos que lo soportan)
 * @param {number} [args.seed]
 */
export async function generateImage({ prompt, model = 'flux-pro-ultra', aspect = '16:9', numImages = 1, imageUrls, seed }) {
  const payload = {
    prompt,
    num_images: numImages,
    ...aspectToFalPayload(model, aspect),
    ...(seed !== undefined && { seed }),
    ...(imageUrls?.length && { image_url: imageUrls[0] }),
  };
  const result = await runFal(model, payload);
  return {
    images: (result.images ?? []).map((img) => ({
      url: img.url,
      width: img.width,
      height: img.height,
      contentType: img.content_type,
    })),
    seed: result.seed,
    raw: result,
  };
}

/**
 * Traduce aspect abstracto ('1:1', '16:9', etc.) al param correcto por modelo.
 * FLUX Schnell/Dev usan `image_size` con nombres.
 * FLUX Pro / Ultra / Recraft / Ideogram usan `aspect_ratio` con "W:H".
 */
function aspectToFalPayload(model, aspect) {
  const IMAGE_SIZE_MODELS = new Set(['flux-schnell', 'flux-dev']);
  if (IMAGE_SIZE_MODELS.has(model)) {
    const map = {
      '1:1':  'square_hd',
      '16:9': 'landscape_16_9',
      '9:16': 'portrait_16_9',
      '4:3':  'landscape_4_3',
      '3:4':  'portrait_4_3',
    };
    return { image_size: map[aspect] ?? 'square_hd' };
  }
  return { aspect_ratio: aspect };
}

/**
 * Genera un vector-styled asset con Recraft V3.
 * NOTA: usa endpoint main con style='vector_illustration' → devuelve raster PNG con look vectorial.
 * Para SVG PURO, el endpoint dedicado (recraft-v3-svg) hay que verificar path exacto en FAL UI.
 */
export async function generateSvg({ prompt, style = 'vector_illustration' }) {
  const result = await runFal('recraft-v3', {
    prompt,
    style,
    image_size: 'square_hd',
  });
  return {
    svgUrl: result.images?.[0]?.url,
    raw: result,
  };
}

/**
 * Genera un video corto.
 * @param {object} args
 * @param {string} args.prompt
 * @param {string} [args.model='kling-1.6-pro']
 * @param {string} [args.duration='5'] - segundos
 * @param {string} [args.aspect='16:9']
 * @param {string} [args.imageUrl] - image-to-video si el modelo lo soporta
 */
export async function generateVideo({ prompt, model = 'kling-1.6-pro', duration = '5', aspect = '16:9', imageUrl }) {
  const payload = {
    prompt,
    duration,
    aspect_ratio: aspect,
    ...(imageUrl && { image_url: imageUrl }),
  };
  const result = await runFal(model, payload);
  return {
    videoUrl: result.video?.url,
    raw: result,
  };
}

/**
 * Remueve el fondo de una imagen.
 */
export async function removeBackground({ imageUrl }) {
  const result = await runFal('bria-bg-remove', { image_url: imageUrl });
  return {
    imageUrl: result.image?.url ?? result.images?.[0]?.url,
    raw: result,
  };
}

/**
 * Upscale de una imagen.
 * @param {'clarity'|'real-esrgan'} [engine='clarity']
 */
export async function upscaleImage({ imageUrl, engine = 'clarity', scale = 2 }) {
  const modelKey = engine === 'real-esrgan' ? 'real-esrgan' : 'clarity-upscaler';
  const result = await runFal(modelKey, { image_url: imageUrl, scale });
  return {
    imageUrl: result.image?.url ?? result.images?.[0]?.url,
    raw: result,
  };
}
