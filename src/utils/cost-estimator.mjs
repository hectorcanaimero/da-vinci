/**
 * Tabla de costos en USD (por unidad). Actualizada Aug 2026.
 * Fuentes: pricing pages oficiales de cada proveedor.
 * Formato: costo por 1 generación al tamaño/duración default de cada modelo.
 */
export const COST_TABLE = {
  // ── Images: OpenAI ─────────────────────────────────────────────────
  'openai:gpt-image-1:low': 0.011,
  'openai:gpt-image-1:medium': 0.042,
  'openai:gpt-image-1:high': 0.167,
  'openai:gpt-image-2:low': 0.015,
  'openai:gpt-image-2:medium': 0.055,
  'openai:gpt-image-2:high': 0.190,

  // ── Images: Gemini (Nano-Banana + Imagen) ──────────────────────────
  'gemini:nano-banana': 0.039,          // Gemini 2.5 Flash Image
  'gemini:nano-banana-pro': 0.134,      // Gemini 3 Pro Image
  'gemini:imagen-4-fast': 0.02,
  'gemini:imagen-4': 0.04,
  'gemini:imagen-4-ultra': 0.06,

  'fal:flux-schnell': 0.003,
  'fal:flux-dev': 0.025,
  'fal:flux-pro': 0.05,
  'fal:flux-pro-ultra': 0.06,
  'fal:recraft-v3': 0.04,        // el mejor para SVG
  'fal:recraft-v3-svg': 0.08,    // output SVG vectorial
  'fal:ideogram-v2': 0.08,
  'fal:ideogram-v2-turbo': 0.04,
  'fal:bria-bg-remove': 0.002,
  'fal:clarity-upscaler': 0.05,
  'fal:real-esrgan': 0.008,

  // ── Video ──────────────────────────────────────────────────────────
  'gemini:veo-3-fast:5s': 0.75,
  'gemini:veo-3:5s': 2.50,
  'gemini:veo-3:8s': 4.00,

  'fal:kling-1.6-standard:5s': 0.28,
  'fal:kling-1.6-pro:5s': 0.42,
  'fal:kling-2.1-master:5s': 1.40,
  'fal:luma-dream-machine:5s': 0.35,
  'fal:minimax-hailuo:6s': 0.48,

  'kie:veo-3:5s': 1.80,          // más barato que Gemini directo a veces
  'kie:kling-2.1:5s': 1.20,
  'kie:midjourney-v7': 0.10,     // imagen vía KIE gateway

  // ── HeyGen ─────────────────────────────────────────────────────────
  'heygen:hyperframes:image': 0.05,
  'heygen:avatar-video:1min': 0.30,

  // ── Audio (ElevenLabs) ─────────────────────────────────────────────
  'elevenlabs:tts:1k-chars': 0.30,      // Multilingual v2
  'elevenlabs:tts-turbo:1k-chars': 0.15,
  'elevenlabs:sfx:generation': 0.08,

  // ── Tripo3D (modelo 3D / GLB) ────────────────────────────────────────
  'tripo:text-to-model': 0.20,            // sin textura
  'tripo:text-to-model:textured': 0.30,   // con textura + PBR
  'tripo:image-to-model': 0.20,           // sin textura
  'tripo:image-to-model:textured': 0.30,  // con textura + PBR
};

const THRESHOLDS = {
  auto: 0.10,
  warn: 1.00,
};

/**
 * Estima el costo de una generación.
 * @param {string} modelKey - key en COST_TABLE
 * @param {number} [quantity=1] - # de generaciones o unidades (ej: 3 imágenes, 10s video)
 * @returns {{ unitCost: number, totalCost: number, level: 'auto'|'warn'|'confirm', known: boolean }}
 */
export function estimateCost(modelKey, quantity = 1) {
  const unitCost = COST_TABLE[modelKey];
  const known = unitCost !== undefined;
  const totalCost = known ? unitCost * quantity : 0;
  let level = 'auto';
  if (totalCost > THRESHOLDS.warn) level = 'confirm';
  else if (totalCost > THRESHOLDS.auto) level = 'warn';
  return { unitCost: unitCost ?? null, totalCost, level, known };
}

export function formatCost(usd) {
  if (usd < 0.01) return `$${(usd * 100).toFixed(2)}¢`;
  return `$${usd.toFixed(3)}`;
}

/**
 * Retorna un mensaje humano-friendly según el nivel.
 */
export function costMessage({ totalCost, level, known }, modelKey) {
  if (!known) {
    return `⚠️  Costo desconocido para "${modelKey}". Revisar pricing manualmente.`;
  }
  const cost = formatCost(totalCost);
  if (level === 'auto') return `💰 ${cost} — dentro del umbral automático.`;
  if (level === 'warn') return `⚠️  ${cost} — costo moderado, ejecutando.`;
  return `🛑 ${cost} — costo alto. REQUIERE CONFIRMACIÓN EXPLÍCITA.`;
}

export { THRESHOLDS };
