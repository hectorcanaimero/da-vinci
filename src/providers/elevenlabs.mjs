/**
 * ElevenLabs provider — TTS + sound effects + voice cloning.
 * Docs: https://elevenlabs.io/docs/api-reference/introduction
 * Auth: `xi-api-key: <ELEVENLABS_API_KEY>`
 */

const API_BASE = 'https://api.elevenlabs.io/v1';

function authHeader() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY no configurada. Cargá el valor en Infisical.');
  return { 'xi-api-key': key };
}

/**
 * Modelos TTS.
 */
export const ELEVENLABS_MODELS = {
  'multilingual-v2':    'eleven_multilingual_v2',       // best quality, 29 langs
  'multilingual-v1':    'eleven_multilingual_v1',
  'turbo-v2.5':         'eleven_turbo_v2_5',            // fast + low latency
  'flash-v2.5':         'eleven_flash_v2_5',            // fastest, streaming
  'monolingual-v1':     'eleven_monolingual_v1',        // english only, legacy
};

/**
 * Text-to-Speech: genera audio desde texto.
 * @param {object} args
 * @param {string} args.text
 * @param {string} args.voiceId          - de listVoices()
 * @param {string} [args.model='multilingual-v2']
 * @param {number} [args.stability=0.5]
 * @param {number} [args.similarityBoost=0.75]
 * @param {'mp3_44100_128'|'mp3_44100_192'|'pcm_44100'|'wav_44100'} [args.format='mp3_44100_128']
 * @returns {Promise<{ audioBuffer: Buffer, format: string }>}
 */
export async function textToSpeech({ text, voiceId, model = 'multilingual-v2', stability = 0.5, similarityBoost = 0.75, format = 'mp3_44100_128' }) {
  const modelId = ELEVENLABS_MODELS[model] ?? model;
  const url = `${API_BASE}/text-to-speech/${voiceId}?output_format=${format}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
      },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS falló (${res.status}): ${await res.text()}`);
  return {
    audioBuffer: Buffer.from(await res.arrayBuffer()),
    format,
  };
}

/**
 * Genera sound effects (SFX) desde una descripción textual.
 * @param {object} args
 * @param {string} args.text
 * @param {number} [args.durationSeconds] - 0.5..22, o null para auto
 * @param {number} [args.promptInfluence=0.3]
 */
export async function generateSoundEffect({ text, durationSeconds, promptInfluence = 0.3 }) {
  const res = await fetch(`${API_BASE}/sound-generation`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      ...(durationSeconds !== undefined && { duration_seconds: durationSeconds }),
      prompt_influence: promptInfluence,
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs SFX falló (${res.status}): ${await res.text()}`);
  return {
    audioBuffer: Buffer.from(await res.arrayBuffer()),
    format: 'mp3_44100_128',
  };
}

/**
 * Lista las voices disponibles en la cuenta.
 */
export async function listVoices() {
  const res = await fetch(`${API_BASE}/voices`, { headers: authHeader() });
  if (!res.ok) throw new Error(`ElevenLabs listVoices falló (${res.status})`);
  const data = await res.json();
  return data.voices ?? [];
}

/**
 * Voices default de Da Vinci (curadas por calidad multilingüe).
 * Sirven como fallback cuando no se especifica una.
 */
export const DEFAULT_VOICES = {
  'rachel-en':       '21m00Tcm4TlvDq8ikWAM',
  'domi-en':         'AZnzlk1XvdvUeBnXmlld',
  'antoni-en':       'ErXwobaYiN019PkySvjV',
  'brian-es':        'nPczCjzI2devNBz1zQrb',
  'sarah-es':        'EXAVITQu4vr4xnSDxMaL',
};
