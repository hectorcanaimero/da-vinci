<div align="center">

# 🎨 Da Vinci

**Generate images, SVG, videos, and audio — one skill, six providers, smart routing.**

A Claude Code skill (and standalone CLI) that orchestrates OpenAI, Google Gemini, FAL, KIE, HeyGen, and ElevenLabs — automatically picking the best model per use case with cost gating built in.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518-brightgreen)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)
[![Website](https://img.shields.io/badge/website-live-6366f1)](https://hectorcanaimero.github.io/da-vinci)

[Website](https://hectorcanaimero.github.io/da-vinci) · [Setup](#setup) · [Model Matrix](docs/references/model-matrix.md) · [Contributing](CONTRIBUTING.md)

[Português](README.pt.md) · [Español](README.es.md)

</div>

---

## Gallery

Real examples generated end-to-end via Da Vinci:

<table>
<tr>
<td width="33%" align="center">
  <img src="docs/examples/01-flux-schnell-tooth.png" width="100%" alt="Minimalist tooth illustration"><br>
  <sub><b>FAL FLUX Schnell</b> · $0.003 · 4.7s</sub><br>
  <sub><i>"Minimalist tooth illustration, flat blue tones"</i></sub>
</td>
<td width="33%" align="center">
  <img src="docs/examples/02-recraft-svg-logo-preview.png" width="100%" alt="Calendar clock logo SVG"><br>
  <sub><b>FAL Recraft V3 SVG</b> · $0.08 · 19s · <a href="docs/examples/02-recraft-svg-logo.svg">SVG</a></sub><br>
  <sub><i>"Minimalist logo, calendar + clock overlay"</i></sub>
</td>
<td width="33%" align="center">
  <img src="docs/examples/03-nano-banana-tooth-sparkles.png" width="100%" alt="Tooth with sparkles - edit"><br>
  <sub><b>Gemini Nano-Banana</b> · $0.039 · 7.7s</sub><br>
  <sub><i>Edit of the tooth on the left — added sparkles, preserved style</i></sub>
</td>
</tr>
</table>

**Total to generate all three: $0.125 (~12¢). Three minutes.**

---

## Why Da Vinci?

You're a developer building a landing page. You need a hero image, a logo, and a short video. Without Da Vinci, you'd:

- Compare pricing across 5+ providers
- Pick the wrong model for the job (spending too much or getting mediocre results)
- Manage 6 different API clients + auth flows
- Manually track what you spent

**With Da Vinci, Claude does all that for you.** You say "make me a hero image for a dental clinic landing", it picks the best model, estimates cost, generates, saves to `assets/generated/`, and logs it to `manifest.json`.

### Highlights

- 🧠 **Smart model routing** — Chooses between 30+ models across 6 providers based on your intent (photorealistic → FLUX Pro Ultra, vector logo → Recraft V3 SVG, character consistency → Nano-Banana, etc.)
- 💰 **Cost gating** — Under $0.10 runs automatically; $0.10-$1 warns; over $1 requires explicit `--force`. Never wake up to a surprise bill.
- 🎯 **Reference-driven** — Pass image URLs or local paths as references. Perfect for character consistency and style transfer via Nano-Banana.
- 📋 **Audit trail** — Every generation logged to `manifest.json` with prompt, model, cost, references, timestamp.
- 🔐 **Flexible secrets** — Auto-detects Infisical (self-hosted or cloud), local `.env` file, or shell environment variables. No lock-in.
- ⚡ **Zero-dep helper** — Pure Node.js 18+. No `npm install` needed.

---

## Supported Providers & Models

| Provider | Models | Best For |
|---|---|---|
| **OpenAI** | `gpt-image-1`, `gpt-image-2` | Illustration, editing with masks |
| **Google Gemini** | `nano-banana`, `nano-banana-pro`, `imagen-4`, `veo-3`, `veo-3-fast` | Reference-based edits, video with sync audio |
| **FAL.ai** | FLUX (Schnell/Dev/Pro/Ultra/2), Recraft V3 (raster & SVG), Ideogram v2/v3, Kling 1.6/2.1, Luma Dream Machine, Minimax Hailuo, Sora 2, Veo 3.1, Wan Turbo, BRIA, Clarity Upscaler | Almost everything — the Swiss army knife |
| **KIE.ai** | Sora 2, Kling 2.1/2.5, Hailuo, Bytedance, Grok Imagine, Flux 2, Ideogram, Recraft, Topaz, ElevenLabs | Gateway to models not on FAL |
| **HeyGen** | HyperFrames, Avatar Video | Talking-head videos, brand images |
| **ElevenLabs** | Multilingual v2/v1, Turbo v2.5, Flash v2.5, Sound Effects | TTS in 29 languages, SFX |

Full matrix with use cases and costs: [`docs/references/model-matrix.md`](docs/references/model-matrix.md)

---

## Setup

Choose ONE option:

### Option A — `.env` file (simplest)

```bash
mkdir -p ~/.config/da-vinci
cp .env.example ~/.config/da-vinci/.env
# edit the file and add your API keys (all optional)
chmod 600 ~/.config/da-vinci/.env
```

Get keys from: [OpenAI](https://platform.openai.com/api-keys) · [Gemini](https://aistudio.google.com/apikey) · [FAL](https://fal.ai/dashboard/keys) · [KIE](https://kie.ai) · [HeyGen](https://app.heygen.com/settings?nav=API) · [ElevenLabs](https://elevenlabs.io/app/settings/api-keys)

### Option B — Infisical (recommended for teams)

If you use [Infisical](https://infisical.com) (self-hosted or cloud), add to `~/.zshrc`:

```bash
export INFISICAL_URL="https://your-infisical.com"
export INFISICAL_CLIENT_ID="..."
export INFISICAL_CLIENT_SECRET="..."
export DAVINCI_PROJECT_ID="..."
export DAVINCI_ENV="prod"
```

Da Vinci auto-detects and fetches API keys via Infisical Universal Auth. See [`docs/references/infisical-setup.md`](docs/references/model-matrix.md) for the full guide.

### Option C — Direct environment variables (CI/CD)

```bash
export OPENAI_API_KEY="sk-..."
export FAL_API_KEY="xxx:yyy"
# etc.
```

Perfect for GitHub Actions, Docker, or scripts.

### Verify

```bash
node src/generate.mjs image --provider fal --model flux-schnell \
  --prompt "test" --dry-run --verbose
# Output: 🔑 Secretos cargados desde: dotenv (...) — keys: ...
```

---

## Usage

### As a Claude Code skill (recommended)

Just talk to Claude:

- *"Da Vinci, generate a hero image for a dental clinic landing page, modern minimalist style"*
- *"Da Vinci, I need a logo in SVG for AgendaZap"*
- *"Da Vinci, edit this photo and change the background to a beach"* (paste image URL)
- *"Da Vinci, make a 5-second product spin video"*

Claude reads [`docs/SKILL.md`](docs/SKILL.md), picks the model, estimates cost, runs it, saves the asset, and shows you the path.

### As a standalone CLI

```bash
# Photorealistic image
node src/generate.mjs image \
  --provider fal --model flux-pro-ultra \
  --prompt "..." --aspect 16:9

# SVG vector (always FAL Recraft V3)
node src/generate.mjs svg --prompt "minimalist logo for a clinic"

# Edit with reference (Nano-Banana — best for character consistency)
node src/generate.mjs image \
  --provider gemini --model nano-banana \
  --prompt "same character but with a beach background" \
  --refs "https://example.com/character.png"

# Video with sync audio (Veo 3 — requires --force due to cost)
node src/generate.mjs video \
  --provider gemini --model veo-3 \
  --prompt "..." --duration 5 --force

# Text-to-speech
node src/generate.mjs tts \
  --text "Welcome to AgendaZap" \
  --voice "21m00Tcm4TlvDq8ikWAM"

# List available voices
node src/generate.mjs list-voices --provider elevenlabs

# Estimate cost only (dry-run)
node src/generate.mjs video --provider fal --model kling-2.1-master \
  --prompt "..." --dry-run
```

Full command reference: `node src/generate.mjs --help`

---

## Cost Gates

| Estimated cost | Behavior |
|---|---|
| `< $0.10` | Runs automatically, prints cost to stderr |
| `$0.10 – $1.00` | Warns to stderr, runs anyway |
| `> $1.00` | **Requires** explicit `--force` — blocks otherwise |

Typical over-$1 cases: Kling 2.1 Master videos, Veo 3 at 8s duration, batches of 5+ premium images.

Override thresholds by editing `src/utils/cost-estimator.mjs`.

---

## Project Structure

```
da-vinci/
├── LICENSE                      Apache 2.0
├── README.md
├── package.json
├── .env.example                 Template — copy to ~/.config/da-vinci/.env
├── .gitignore
├── SKILL.md                     → docs/SKILL.md (symlink)
├── src/
│   ├── generate.mjs             CLI entrypoint
│   ├── providers/               One file per provider
│   │   ├── openai.mjs
│   │   ├── gemini.mjs
│   │   ├── fal.mjs
│   │   ├── kie.mjs
│   │   ├── heygen.mjs
│   │   └── elevenlabs.mjs
│   └── utils/
│       ├── secrets.mjs          Auto-detects Infisical/dotenv/env
│       ├── infisical.mjs        HTTP client for Infisical /api/v3
│       ├── dotenv.mjs           Zero-dep .env parser
│       ├── cost-estimator.mjs   Cost table + thresholds
│       ├── reference-loader.mjs URL & local file loader
│       └── manifest.mjs         Audit trail writer
└── docs/
    ├── index.html               GitHub Pages landing
    ├── SKILL.md                 Instructions for Claude
    ├── examples/                Real generation gallery
    └── references/
        └── model-matrix.md      Full decision matrix
```

---

## Manifest & Audit Trail

Every generation appends to `<projectRoot>/assets/generated/manifest.json`:

```json
{
  "generated": [
    {
      "id": "84ac4a32-...",
      "timestamp": "2026-08-10T21:35:30.453Z",
      "prompt": "modern minimalist tooth illustration...",
      "provider": "fal",
      "model": "flux-schnell",
      "outputPath": "/abs/path/to/asset.jpg",
      "costUsd": 0.003,
      "references": [],
      "params": { "aspect": "1:1", "n": "1" }
    }
  ]
}
```

Total spent in current project:
```bash
node -e "import('./src/utils/manifest.mjs').then(m => m.totalSpent().then(t => console.log('$' + t.toFixed(3))))"
```

---

## Security

- API keys **never** touch disk in plaintext (with Infisical) or live only in a `chmod 600` `.env` file
- JWTs cached in-memory only (never persisted)
- Machine Identity with `Viewer` role for Infisical (least-privilege)
- `.gitignore` excludes all secrets, generated assets, and node modules by default
- Manifest logs prompts but **never** API keys

See [`.env.example`](.env.example) for the safe template.

---

## Contributing

PRs welcome. Adding a provider or model is a 20-minute job:

1. Add entry to `src/providers/<provider>.mjs` (or create new file)
2. Add cost estimate to `src/utils/cost-estimator.mjs`
3. Update `docs/references/model-matrix.md` with the use case
4. Bump `metadata.version` in `docs/SKILL.md`

Full guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)

---

## Roadmap

- [ ] Cache generated assets by prompt hash (skip re-generation)
- [ ] Batch mode: read prompts from JSON array, generate in parallel
- [ ] `variations` command to regenerate the last asset with new seed
- [ ] Cloudflare Images / R2 auto-upload integration
- [ ] Local model fallback (Ollama Vision + SD) for offline use
- [ ] Web UI dashboard for browsing manifest

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).

## Author

Built by **[Héctor Rodríguez](https://github.com/hectorcanaimero)** for [Claude Code](https://claude.ai/code).

If Da Vinci saved you time or money, drop a ⭐ on the repo. It really helps.
