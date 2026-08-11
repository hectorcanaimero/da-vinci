/**
 * HeyGen provider — Avatar video + HyperFrames (imagen).
 * Docs: https://docs.heygen.com/reference/quickstart
 * Auth: `X-Api-Key: <HEYGEN_API_KEY>`
 *
 * NOTA: HyperFrames y avatar-video son productos separados dentro del mismo tenant.
 * La API key cubre ambos.
 */

const API_BASE = 'https://api.heygen.com';
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS = 600_000;

function authHeader() {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error('HEYGEN_API_KEY no configurada. Skipeando HeyGen — cargá el valor en Infisical.');
  return { 'X-Api-Key': key };
}

async function postJson(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HeyGen POST ${path} falló (${res.status}): ${await res.text()}`);
  return res.json();
}

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`HeyGen GET ${path} falló (${res.status}): ${await res.text()}`);
  return res.json();
}

/**
 * Lista los avatares disponibles en la cuenta (útil para el usuario/Claude).
 */
export async function listAvatars() {
  const data = await getJson('/v2/avatars');
  return data.data?.avatars ?? [];
}

/**
 * Lista las voices disponibles.
 */
export async function listVoices() {
  const data = await getJson('/v2/voices');
  return data.data?.voices ?? [];
}

/**
 * Genera un video de avatar hablando.
 * @param {object} args
 * @param {string} args.avatarId
 * @param {string} args.voiceId
 * @param {string} args.script            - texto a decir (max ~1500 chars por escena)
 * @param {string} [args.background='#FFFFFF']
 * @param {number} [args.width=1920]
 * @param {number} [args.height=1080]
 * @param {string} [args.title='Da Vinci Generated Video']
 */
export async function generateAvatarVideo({ avatarId, voiceId, script, background = '#FFFFFF', width = 1920, height = 1080, title = 'Da Vinci Generated Video' }) {
  const submit = await postJson('/v2/video/generate', {
    title,
    video_inputs: [
      {
        character: {
          type: 'avatar',
          avatar_id: avatarId,
          avatar_style: 'normal',
        },
        voice: {
          type: 'text',
          input_text: script,
          voice_id: voiceId,
        },
        background: {
          type: 'color',
          value: background,
        },
      },
    ],
    dimension: { width, height },
  });
  const videoId = submit.data?.video_id;
  if (!videoId) throw new Error(`HeyGen submit sin video_id: ${JSON.stringify(submit)}`);

  const start = Date.now();
  while (Date.now() - start < POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const status = await getJson(`/v1/video_status.get?video_id=${videoId}`);
    const state = status.data?.status;
    if (state === 'completed') {
      return {
        videoUrl: status.data.video_url,
        thumbnailUrl: status.data.thumbnail_url,
        durationSeconds: status.data.duration,
        raw: status,
      };
    }
    if (state === 'failed') {
      throw new Error(`HeyGen video failed: ${JSON.stringify(status)}`);
    }
  }
  throw new Error(`HeyGen polling timeout (>${POLL_MAX_MS / 1000}s) para video ${videoId}`);
}

/**
 * Genera una imagen con HyperFrames.
 * @param {object} args
 * @param {string} args.prompt
 * @param {'square'|'portrait'|'landscape'} [args.aspect='landscape']
 * @param {number} [args.numImages=1]
 */
export async function generateHyperFrame({ prompt, aspect = 'landscape', numImages = 1 }) {
  const dimensions = {
    square:    { width: 1024, height: 1024 },
    portrait:  { width: 1024, height: 1536 },
    landscape: { width: 1536, height: 1024 },
  };
  const { width, height } = dimensions[aspect] ?? dimensions.landscape;

  const submit = await postJson('/v1/hyperframes/generate', {
    prompt,
    width,
    height,
    num_images: numImages,
  });
  const jobId = submit.data?.job_id ?? submit.data?.id;
  if (!jobId) throw new Error(`HeyGen HyperFrames submit sin job_id: ${JSON.stringify(submit)}`);

  const start = Date.now();
  while (Date.now() - start < POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const status = await getJson(`/v1/hyperframes/status?job_id=${jobId}`);
    const state = status.data?.status;
    if (state === 'completed' || state === 'success') {
      return {
        imageUrls: status.data.image_urls ?? status.data.images?.map((i) => i.url) ?? [],
        raw: status,
      };
    }
    if (state === 'failed' || state === 'error') {
      throw new Error(`HeyGen HyperFrames failed: ${JSON.stringify(status)}`);
    }
  }
  throw new Error(`HeyGen HyperFrames polling timeout (>${POLL_MAX_MS / 1000}s) para job ${jobId}`);
}
