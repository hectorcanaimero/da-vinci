# Da Vinci — Matriz de decisión de modelos

Guía para elegir el mejor proveedor/modelo según el caso. Actualizada Aug 2026.
Los costos son estimados y viven en `scripts/utils/cost-estimator.mjs`.

## Decisión rápida por caso de uso

| Necesito... | Provider primario | Modelo | Costo | Notas |
|---|---|---|---|---|
| **Foto realista de producto** | FAL | `flux-pro-ultra` | $0.06 | Mejor detalle + coherencia |
| **Foto realista fast** | FAL | `flux-schnell` | $0.003 | 1-2s, para iteración rápida |
| **Ilustración con estilo** | OpenAI | `gpt-image-2` medium | $0.055 | Excelente para arte comercial |
| **Editar imagen (character consistency)** | Gemini | `nano-banana` | $0.039 | El rey del edit con refs |
| **Editar imagen premium** | Gemini | `nano-banana-pro` | $0.134 | Máxima fidelidad |
| **Editar imagen con máscara** | OpenAI | `gpt-image-2` + edit | $0.055 | Inpainting preciso |
| **SVG / vector / logo** | FAL | `recraft-v3-svg` | $0.08 | ÚNICO que genera SVG real |
| **Ícono / brand asset raster** | FAL | `recraft-v3` | $0.04 | Estilo profesional |
| **Texto legible en imagen** | FAL | `ideogram-v3` | $0.08 | Tipografía perfecta |
| **Texto legible en imagen (barato)** | FAL | `ideogram-v2-turbo` | $0.04 | Trade-off aceptable |
| **Foto con caras / personajes** | Gemini | `nano-banana` | $0.039 | Consistencia entre generaciones |
| **Midjourney via API** | KIE | `midjourney-v7` | $0.10 | Único gateway "legal" |
| **Fondo de imagen** | FAL | `bria-bg-remove` | $0.002 | 2 centavos, instant |
| **Upscale calidad** | FAL | `clarity-upscaler` | $0.05 | Preserva detalles |
| **Upscale rápido** | FAL | `real-esrgan` | $0.008 | Sirve para thumbnails |
| **Video corto (5s), calidad** | FAL | `kling-1.6-pro` | $0.42 | Sweet spot precio/calidad |
| **Video corto premium** | FAL | `kling-2.1-master` | $1.40 | ⚠️ >$1, pide confirmación |
| **Video premium con audio** | Gemini | `veo-3` | $2.50 | Único que genera audio sync |
| **Video fast/barato** | Gemini | `veo-3-fast` 5s | $0.75 | Bueno para drafts |
| **Video con avatar hablando** | HeyGen | `avatar-video` 1min | $0.30 | RRHH, ventas, tutoriales |
| **Voz TTS multilingüe** | ElevenLabs | `multilingual-v2` 1k chars | $0.30 | Español + inglés + 27 más |
| **Voz TTS fast/live** | ElevenLabs | `turbo-v2.5` 1k chars | $0.15 | Latencia baja |
| **Sound effect** | ElevenLabs | `sfx` | $0.08 | Explosiones, ambient, etc. |

## Reglas de routing (heurística para Claude)

Cuando alguien pide algo visual, aplicar en este orden:

### 1. Detectar el tipo de output requerido

```
¿pidió SVG explícito o mencionó vector/logo?    → fal recraft-v3-svg
¿pidió video?                                     → ver sección Video
¿pidió audio/voz/narración?                       → ElevenLabs
¿pidió avatar hablando/presentador?               → HeyGen avatar-video
¿pasó imágenes como referencia?                   → Gemini nano-banana (edit)
resto (imagen desde texto)                        → FAL flux-pro-ultra (default)
```

### 2. Ajustes por contexto del proyecto

| Contexto | Ajuste |
|---|---|
| Landing page hero / banner | flux-pro-ultra o gpt-image-2 high |
| Icon set / branding | recraft-v3 |
| Redes sociales (thumbnails) | flux-schnell o flux-dev |
| Presentación / slides | gpt-image-2 medium |
| Blog post header | flux-pro |
| Mockup de producto | flux-pro-ultra + ref del producto |
| Retrato / avatar | nano-banana |
| Ilustración editorial | gpt-image-2 high o ideogram-v3 |

### 3. Ajustes por prompt

- Prompt menciona "texto en la imagen" → **ideogram** family
- Prompt menciona "estilo Studio Ghibli", "anime", "manga" → OpenAI `gpt-image-2` high o FAL `flux-pro-ultra`
- Prompt menciona "3D render", "cinemático", "hyperrealistic" → FAL `flux-pro-ultra`
- Prompt menciona "vector", "flat", "minimal" → `recraft-v3`
- Prompt en español coloquial (variedades rioplatense/mexicano) → OpenAI o FAL entienden mejor la sutileza cultural que Gemini

## Fallback strategy

Si el proveedor primario falla:

| Primario | Fallback 1 | Fallback 2 |
|---|---|---|
| FAL flux-pro | OpenAI gpt-image-2 | Gemini imagen-4 |
| FAL kling video | KIE kling-2.1 | Gemini veo-3-fast |
| Gemini veo-3 | KIE veo-3 | FAL veo-3 |
| OpenAI gpt-image-2 | Gemini nano-banana | FAL flux-pro |
| HeyGen avatar-video | (no fallback directo — reportar) | |
| ElevenLabs | (no fallback directo — reportar) | |

## Notas de costo

**Umbrales de confirmación:**
- `< $0.10` → ejecuta automático
- `$0.10 - $1.00` → warn en stderr, ejecuta
- `> $1.00` → **REQUIERE** `--force` explícito

**Casos que casi siempre superan $1:**
- Videos con `kling-2.1-master`, `veo-3`, `veo-3-8s`
- N > 3 imágenes con gpt-image-2 high o flux-pro-ultra
- TTS multilingual > 3.3k chars

**Estrategia de ahorro:**
1. Iterá con modelos cheap (flux-schnell, imagen-4-fast) hasta que el prompt esté afinado
2. Recién en la última corrida usá el modelo premium
3. Para variaciones, usá seed fijo — te ahorra generar 5 para elegir 1

## Extensión: cómo agregar un modelo nuevo

Cuando salga un modelo que no está en el registry:

1. Agregar entry en el provider correspondiente:
   ```js
   // scripts/providers/fal.mjs → FAL_MODELS
   'flux-3': 'fal-ai/flux-3'
   ```
2. Agregar costo estimado en `cost-estimator.mjs`:
   ```js
   'fal:flux-3': 0.08
   ```
3. Actualizar esta matriz con el nuevo caso de uso
4. Bump version en `SKILL.md` (metadata.version)
