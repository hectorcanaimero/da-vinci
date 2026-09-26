import { classifyProviderError, DavinciError } from './errors.mjs';
import { saveRemoteAsset, saveB64Asset, saveBufferAsset } from './storage.mjs';
import { fetchReference, loadLocalReference } from '../utils/reference-loader.mjs';
import * as fal from '../providers/fal.mjs';
import * as openai from '../providers/openai.mjs';
import * as gemini from '../providers/gemini.mjs';
import * as kie from '../providers/kie.mjs';
import * as heygen from '../providers/heygen.mjs';
import * as elevenlabs from '../providers/elevenlabs.mjs';
import * as tripo from '../providers/tripo.mjs';

const invalid = (msg) => new DavinciError('invalid_request', msg);
const need = (v, name) => {
  if (!v) throw invalid(`Falta ${name}`);
  return v;
};

// req.inputs → referencias con { buffer, mime, base64(), dataUrl() }.
// `{id}` se resuelve a ruta con ctx.resolveInputPath (lo inyecta el router).
async function loadInputs(inputs = [], ctx) {
  return Promise.all(inputs.map(async (i) => {
    if (i.url) return fetchReference(i.url);
    if (i.path) return loadLocalReference(i.path);
    if (i.id) {
      if (!ctx.resolveInputPath) throw invalid('ctx.resolveInputPath requerido para inputs {id}');
      const path = await ctx.resolveInputPath(i.id);
      if (!path) throw new DavinciError('not_found', `Input no encontrado: ${i.id}`);
      return loadLocalReference(path);
    }
    throw invalid('Input inválido: se espera {id}, {url} o {path}');
  }));
}

// Guarda todos los items en orden; con más de uno el nombre lleva -1, -2…
const saveAll = (items, save) =>
  Promise.all(items.map((it, index) => save(it, { index, total: items.length })));

const openaiSize = (aspect) =>
  aspect === '16:9' ? '1536x1024' : aspect === '9:16' ? '1024x1536' : '1024x1024';

/**
 * Ejecuta el proveedor de `entry` y guarda los archivos. Sin gate de costo ni registro.
 * @returns {Promise<Array<{ filePath: string, mime: string, bytes: number }>>}
 */
export async function generate(entry, req, ctx) {
  try {
    return await dispatch(entry, req, ctx);
  } catch (err) {
    throw classifyProviderError(err);
  }
}

async function dispatch(entry, req, ctx) {
  const { provider, model, kind } = entry;
  const p = req.params ?? {};
  const aspect = p.aspect ?? '16:9';
  const n = Number(p.n ?? 1);
  const durationSeconds = Number(p.duration ?? 5);
  const refs = await loadInputs(req.inputs, ctx);
  const remote = (kindName, ext) => (url, slot) => saveRemoteAsset(url, kindName, ext, ctx, slot);
  const b64 = (kindName, ext) => (data, slot) => saveB64Asset(data, kindName, ext, ctx, slot);
  const one = async (save, value) => [await save(value, { index: 0, total: 1 })];

  switch (kind) {
    case 'image': {
      const prompt = need(req.prompt, 'prompt');
      if (provider === 'fal') {
        const r = await fal.generateImage({
          prompt, model, aspect, numImages: n,
          imageUrls: refs.map((x) => x.dataUrl()),
        });
        return saveAll(r.images.map((i) => i.url), remote('image', 'png'));
      }
      if (provider === 'openai') {
        const r = await openai.generateImage({
          prompt, model, quality: p.quality ?? 'medium', size: openaiSize(aspect), n,
        });
        return saveAll(r.images.map((i) => i.b64), b64('image', 'png'));
      }
      if (provider === 'gemini') {
        const imageInputs = refs
          .filter((x) => x.mime?.startsWith('image/'))
          .map((x) => ({ b64: x.base64(), mime: x.mime }));
        const r = await gemini.generateImage({ prompt, model, aspect, numImages: n, imageInputs });
        return saveAll(r.images.map((i) => i.b64), b64('image', 'png'));
      }
      if (provider === 'kie') {
        const r = await kie.generateImage({ prompt, model, aspect, numImages: n });
        return saveAll(r.imageUrls, remote('image', 'png'));
      }
      if (provider === 'heygen') {
        const r = await heygen.generateHyperFrame({ prompt, aspect: 'landscape', numImages: n });
        return saveAll(r.imageUrls, remote('image', 'png'));
      }
      break;
    }
    case 'svg': {
      const r = await fal.generateSvg({ prompt: need(req.prompt, 'prompt') });
      return one(remote('svg', 'svg'), r.svgUrl);
    }
    case 'video': {
      const prompt = need(req.prompt, 'prompt');
      if (provider === 'fal') {
        const r = await fal.generateVideo({
          prompt, model, duration: String(durationSeconds), aspect, imageUrl: refs[0]?.dataUrl(),
        });
        return one(remote('video', 'mp4'), r.videoUrl);
      }
      if (provider === 'gemini') {
        const r = await gemini.generateVideo({
          prompt, model, durationSeconds, aspect,
          imageInput: refs[0] ? { b64: refs[0].base64(), mime: refs[0].mime } : undefined,
        });
        const v = r.videos[0];
        return v.b64 ? one(b64('video', 'mp4'), v.b64) : one(remote('video', 'mp4'), v.uri);
      }
      if (provider === 'kie') {
        const r = await kie.generateVideo({
          prompt, model, aspect, durationSeconds, imageUrl: refs[0]?.dataUrl(),
        });
        return one(remote('video', 'mp4'), r.videoUrls[0]);
      }
      break;
    }
    case 'model-3d': {
      const opts = {
        model: model === 'default' ? undefined : model,
        texture: p.texture !== false && p.texture !== 'false',
        pbr: p.pbr !== false && p.pbr !== 'false',
        faceLimit: p.faceLimit ? Number(p.faceLimit) : undefined,
      };
      const r = refs.length
        ? await tripo.generateFromImage({ buffer: refs[0].buffer, mime: refs[0].mime, ...opts })
        : await tripo.generateFromText({ prompt: need(req.prompt, 'prompt'), style: p.style, ...opts });
      return one(remote('model', 'glb'), r.modelUrl);
    }
    case 'avatar-video': {
      const r = await heygen.generateAvatarVideo({
        avatarId: need(req.avatar, 'avatar'),
        voiceId: need(req.voice, 'voice'),
        script: need(req.script, 'script'),
      });
      return one(remote('video', 'mp4'), r.videoUrl);
    }
    case 'audio': {
      const { audioBuffer, format } = await elevenlabs.textToSpeech({
        text: need(req.text, 'text'),
        voiceId: req.voice ?? elevenlabs.DEFAULT_VOICES['rachel-en'],
        model,
      });
      const ext = format.startsWith('mp3') ? 'mp3' : 'wav';
      return one((buf, slot) => saveBufferAsset(buf, 'audio', ext, ctx, slot), audioBuffer);
    }
    case 'sfx': {
      const { audioBuffer } = await elevenlabs.generateSoundEffect({
        text: need(req.text, 'text'),
        durationSeconds: p.duration ? Number(p.duration) : undefined,
      });
      return one((buf, slot) => saveBufferAsset(buf, 'sfx', 'mp3', ctx, slot), audioBuffer);
    }
    case 'bg-remove': {
      const imageUrl = need(refs[0], 'inputs[0]').dataUrl();
      const r = await fal.removeBackground({ imageUrl });
      return one(remote('image', 'png'), r.imageUrl);
    }
    case 'upscale': {
      const imageUrl = need(refs[0], 'inputs[0]').dataUrl();
      const r = await fal.upscaleImage({ imageUrl, engine: p.engine ?? model });
      return one(remote('image', 'png'), r.imageUrl);
    }
  }
  throw invalid(`Modelo no soportado: ${entry.id ?? `${provider}/${model}`} (${kind})`);
}
