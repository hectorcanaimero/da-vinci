<div align="center">

# 🎨 Reverón

**Generate images, SVG, videos, audio, and 3D models — one skill, seven providers, smart routing.**

A Claude Code skill (and standalone CLI) that orchestrates OpenAI, Google Gemini, FAL, KIE, HeyGen, ElevenLabs, and Tripo3D — automatically picking the best model per use case with cost gating built in.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A522-brightgreen)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)
[![Website](https://img.shields.io/badge/website-live-6366f1)](https://reveron.guria.lat)

[Website](https://reveron.guria.lat) · [Setup](#setup) · [Model Matrix](docs/references/model-matrix.md) · [Contributing](CONTRIBUTING.md)

[Português](README.pt.md) · [Español](README.es.md)

</div>

---

## Gallery

Real examples generated end-to-end via Reverón:

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

## Why Reverón?

You're a developer building a landing page. You need a hero image, a logo, and a short video. Without Reverón, you'd:

- Compare pricing across 5+ providers
- Pick the wrong model for the job (spending too much or getting mediocre results)
- Manage 6 different API clients + auth flows
- Manually track what you spent

**With Reverón, Claude does all that for you.** You say "make me a hero image for a dental clinic landing", it picks the best model, estimates cost, generates, saves to `assets/generated/`, and logs it to `manifest.json`.

### Highlights

- 🧠 **Smart model routing** — Chooses between 30+ models across 7 providers based on your intent (photorealistic → FLUX Pro Ultra, vector logo → Recraft V3 SVG, character consistency → Nano-Banana, product photo → 3D GLB via Tripo3D, etc.)
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
| **Tripo3D** | Text-to-Model, Image-to-Model | 3D assets (GLB) for games, AR, 3D printing |

Full matrix with use cases and costs: [`docs/references/model-matrix.md`](docs/references/model-matrix.md)

---

## Installation

### Global (recommended)

```bash
npm install -g reveron
reveron --help
reveron serve                # starts dashboard + API at http://127.0.0.1:20130
```

### Local (development)

```bash
git clone https://github.com/hectorcanaimero/reveron.git
cd reveron
npm ci && npm run build:ui
npm run install:setup        # interactive setup
node src/generate.mjs --help
npm start image --provider fal --model flux-schnell --prompt "test" --dry-run
```

## Authorization (First Run)

Reverón is distributed **without notarization** to eliminate friction. Depending on your OS, you'll need to authorize it once:

### macOS — Gatekeeper

When you first run `reveron`, you'll see: _"reveron cannot be opened because the developer cannot be verified."_

**Steps:**

1. Go to **System Settings → Privacy & Security** (or **System Preferences → Security & Privacy** on older macOS)
2. Scroll down to find the message about **reveron** being blocked
3. Click **Open Anyway** (you may need to authenticate with your password)
4. The app will launch and you'll be able to use it going forward

Alternatively, from the command line:
```bash
xattr -d com.apple.quarantine /usr/local/lib/node_modules/reveron/src/generate.mjs
```

**Why:** Apple's Gatekeeper requires paid Developer certificates. We skip that cost and let you authorize once instead.

### Windows — SmartScreen

Windows may show: _"Windows protected your PC"_ and block the download or execution.

**Steps:**

1. If the download is blocked:
   - Open **Downloads** folder, right-click the `.msi` file
   - Click **Properties** → **General** (bottom area)
   - Check **Unblock** and click **Apply**

2. If the installation is blocked by SmartScreen:
   - Click **More info** on the security prompt
   - Click **Run anyway** (requires no additional authentication)

3. After installation, the app will work normally

**Why:** Windows SmartScreen checks if apps have been seen by millions of users. New apps require explicit user authorization.

### Linux — Executable Permissions

On Linux, you'll need to mark the AppImage as executable:

```bash
chmod +x reveron-*.AppImage
./reveron-*.AppImage
```

Or from your package manager (if available):
```bash
# Ubuntu/Debian
sudo apt-get install ./reveron-*.deb

# Fedora/RHEL
sudo dnf install ./reveron-*.rpm
```

**Supported Distribution:** Reverón v2.0 targets **Ubuntu 20.04 LTS and later** due to WebKitGTK dependencies. Other distributions (Fedora, Arch, openSUSE) require manual WebKitGTK installation. For details, see your distro's package manager.

**Why:** Linux requires explicit executable permissions by design. After that first step, the AppImage runs without further authorization.

## Setup

Choose ONE option for API keys:

### Option A — `.env` file (simplest)

```bash
mkdir -p ~/.config/reveron
cp .env.example ~/.config/reveron/.env
# edit the file and add your API keys (all optional)
chmod 600 ~/.config/reveron/.env
```

Get keys from: [OpenAI](https://platform.openai.com/api-keys) · [Gemini](https://aistudio.google.com/apikey) · [FAL](https://fal.ai/dashboard/keys) · [KIE](https://kie.ai) · [HeyGen](https://app.heygen.com/settings?nav=API) · [ElevenLabs](https://elevenlabs.io/app/settings/api-keys) · [Tripo3D](https://platform.tripo3d.ai/api-keys)

### Option B — Infisical (recommended for teams)

If you use [Infisical](https://infisical.com) (self-hosted or cloud), add to `~/.zshrc`:

```bash
export INFISICAL_URL="https://your-infisical.com"
export INFISICAL_CLIENT_ID="..."
export INFISICAL_CLIENT_SECRET="..."
export REVERON_PROJECT_ID="..."
export REVERON_ENV="prod"
```

Reverón auto-detects and fetches API keys via Infisical Universal Auth. See [`docs/references/infisical-setup.md`](docs/references/model-matrix.md) for the full guide.

### Option C — Direct environment variables (CI/CD)

```bash
export OPENAI_API_KEY="sk-..."
export FAL_API_KEY="xxx:yyy"
# etc.
```

Perfect for GitHub Actions, Docker, or scripts.

### Verify

```bash
reveron image --provider fal --model flux-schnell --prompt "test" --dry-run --verbose
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
reveron image \
  --provider fal --model flux-pro-ultra \
  --prompt "..." --aspect 16:9

# SVG vector (always FAL Recraft V3)
reveron svg --prompt "minimalist logo for a clinic"

# Edit with reference (Nano-Banana — best for character consistency)
reveron image \
  --provider gemini --model nano-banana \
  --prompt "same character but with a beach background" \
  --refs "https://example.com/character.png"

# Video with sync audio (Veo 3 — requires --force due to cost)
reveron video \
  --provider gemini --model veo-3 \
  --prompt "..." --duration 5 --force

# Text-to-speech
reveron tts \
  --text "Welcome to AgendaZap" \
  --voice "21m00Tcm4TlvDq8ikWAM"

# 3D model (GLB) from text — Tripo3D
reveron model-3d --prompt "a low poly medieval sword"

# 3D model (GLB) from a reference image — Tripo3D
reveron model-3d --refs "https://example.com/product.png"

# List available voices
reveron list-voices --provider elevenlabs

# Estimate cost only (dry-run)
reveron video --provider fal --model kling-2.1-master \
  --prompt "..." --dry-run
```

Full command reference: `reveron --help`

---

## Dashboard (`reveron serve`)

Start with `reveron serve` to open the local dashboard at `http://127.0.0.1:20130`.

### Four Sections

1. **Studio** — Generate new assets (image, video, SVG, 3D model, TTS, etc.). Shows cost estimates and real-time job status.

2. **Library** — Browse all generations (global and project-scoped). Search by prompt, provider, model. Mark favorites, delete with optional file cleanup, inspect lineage (generations that used this asset as reference).

3. **Providers** — Manage API keys. Shows connection status for each of 7 providers. Add keys directly (saved to `~/.davinci/config.json`) or use Infisical.

4. **Spend** — View cost trends. Filter by date range, group by provider/model/day. See daily budget alerts and YTD total.

### API Server

The same server also exposes a REST API (useful for CI/CD, automation, or custom frontends). Base URL: `http://127.0.0.1:20130` (default).

All routes require optional **API key** (for network exposure). Set in config:

```json
{
  "host": "0.0.0.0",
  "port": 20130,
  "apiKey": "sk-...",
  "dailyBudgetUsd": 10,
  "concurrency": 3
}
```

Then use `X-Reveron-API-Key` header:

```bash
curl http://<host>:20130/api/health \
  -H "X-Reveron-API-Key: sk-..."
```

### API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/health` | Server status + version |
| GET | `/api/models` | List 30+ models with costs; filter by `?kind=image` |
| POST | `/api/estimate` | Estimate cost: `{ intent, prompt, provider, model, ... }` → `{ costUsd, level, ... }` |
| POST | `/api/generations` | Queue generation: `{ ... }` → `{ job: { id, status, ... } }` |
| GET | `/api/jobs` | List jobs (filter by `?status=pending`); pagination with `?limit` |
| GET | `/api/jobs/:id` | Get single job (follow `result` field for asset ID when done) |
| GET | `/api/library` | List all generations; filter by `?favorite=true`, project, date range |
| GET | `/api/library/:id` | Get single asset + lineage (which generations used it as reference) |
| PATCH | `/api/library/:id` | Update asset: `{ favorite: boolean }` |
| DELETE | `/api/library/:id` | Delete asset; `?file=true` also deletes file |
| GET | `/api/spend` | Cost summary; `?groupBy=day\|provider\|model`, date filters |
| POST | `/api/import` | Import manifest: `{ path: "..." }` → `{ imported, skipped }` |

### Example: OpenAI SDK Compatibility

Use Da Vinci as an OpenAI-compatible endpoint:

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-...",           # (optional, if server has apiKey set)
    base_url="http://127.0.0.1:20130/v1",
)

# Works like OpenAI but routes to Da Vinci (picks best model per intent)
response = client.images.generate(
    prompt="minimalist tooth illustration",
    n=1,
)
image_url = response.data[0].url
```

Or with cURL:

```bash
curl http://127.0.0.1:20130/v1/images/generations \
  -H "Authorization: Bearer sk-..." \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "minimalist tooth illustration",
    "n": 1
  }'
```

---

## Global Library (`~/.reveron/`)

Every generation is saved to the global library (database + files). Use via CLI or dashboard.

### Directory Structure

```
~/.reveron/
├── config.json              Your settings (port, host, apiKey, budget, etc.)
├── orch.db                  SQLite database (generations, lineage, favorites)
└── assets/
    ├── <id>/
    │   ├── artifact.{jpg,png,mp4,glb,mp3}
    │   ├── metadata.json
    │   └── generation.json
    └── ...
```

### Reference Generations in Prompts

Use `--refs reveron:<id>` to reference a saved generation:

```bash
reveron image --provider gemini --model nano-banana \
  --prompt "same style but on a beach" \
  --refs reveron:84ac4a32-5c48-4f8e-8f4c-a8f8c8f8c8f8
```

Useful for building on prior work (character consistency, style chaining, iterative refinement).

---

## Import Command

Migrate from project-local manifests to the global library:

```bash
reveron import ./assets/generated/manifest.json
# Output: { imported: 42, skipped: 3 }
```

Each asset is copied to `~/.davinci/assets/` with full lineage preserved.

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
reveron/
├── LICENSE                      Apache 2.0
├── README.md
├── package.json
├── .env.example                 Template — copy to ~/.config/reveron/.env
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
│   │   ├── elevenlabs.mjs
│   │   └── tripo.mjs
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

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).

## Author

Built by **[Héctor Rodríguez](https://github.com/hectorcanaimero)** for [Claude Code](https://claude.ai/code).

If Reverón saved you time or money, drop a ⭐ on the repo. It really helps.

---

### Historical Note

Reverón was previously known as Da Vinci. The library continues to save to `~/.reveron/`, and your old project manifests can be imported via `reveron import ./assets/generated/manifest.json`.
