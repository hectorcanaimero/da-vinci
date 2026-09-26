# Changelog

All notable changes to Da Vinci are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), [SemVer](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-09-25

### Breaking Changes
- **Node ≥ 22.13.0 required** (previously 18+). See `package.json` `engines` field.

### Added
- **Local dashboard + API server**: `davinci serve` opens UI at `http://127.0.0.1:20130` with Studio, Library, Providers, Spend sections
- **Global library**: All generations saved to `~/.davinci/` (SQLite + assets); `davinci import` migrates from project-local manifests
- **REST API**: Full `{/api/health, /models, /estimate, /generations, /jobs, /library, /spend, /import}`; OpenAI-compatible `/v1/images/generations` endpoint
- **Network exposure**: Optional `apiKey` in `config.json` for sharing server with `X-Davinci-API-Key` header
- **Reference chaining**: `--refs davinci:<id>` for using saved generations as input to new generations
- **Cost tracking**: Spend dashboard with daily/monthly totals, grouped by provider/model/date
- **Job queue**: Real-time job tracking with concurrency control and budget guards
- Comprehensive README sections: installation, dashboard, API, library, import command

### Changed
- CLI commands now use global script (`davinci` instead of `node src/generate.mjs`)
- Library stored in SQLite instead of flat JSON manifests
- Config location: `~/.davinci/config.json` (instead of `~/.config/da-vinci/.env` — that's still supported)

### Technical
- `src/server/` — HTTP server + route handlers
- `src/library/` — SQLite database + lineage tracking
- `ui/src/pages/{Studio,Library,Providers,Spend}` — React dashboard
- Tripo3D provider (`src/providers/tripo.mjs`) — text-to-3D and image-to-3D generation, GLB output
- `TRIPO_API_KEY` as a 7th expected secret (Infisical / `.env` / env var)
- Cost table entries for `tripo:text-to-model` and `tripo:image-to-model` (textured and untextured)

## [1.0.0] — 2026-08-10

### Initial release 🎨

**Providers supported:**
- OpenAI (`gpt-image-1`, `gpt-image-2`)
- Google Gemini (`nano-banana`, `nano-banana-pro`, Imagen 4 family, Veo 3, Veo 3 Fast)
- FAL.ai (FLUX 2 + Schnell/Dev/Pro/Ultra, Recraft V3 raster + SVG, Ideogram v2/v3, Kling 1.6/2.1, Luma Dream Machine, Minimax Hailuo, Sora 2, Veo 3.1, Wan Turbo, BRIA, Clarity Upscaler, Real-ESRGAN)
- KIE.ai gateway (Sora 2, Kling 2.1/2.5, Hailuo, Bytedance, Grok Imagine, Flux 2, Ideogram, Recraft, Topaz, ElevenLabs)
- HeyGen (HyperFrames, Avatar Video)
- ElevenLabs (Multilingual v2/v1, Turbo v2.5, Flash v2.5, Sound Effects)

**Core features:**
- Smart model routing based on intent (photorealistic, vector, text-in-image, video, edit-with-reference, etc.)
- Cost gating: under $0.10 auto, $0.10-$1 warn, over $1 requires `--force`
- Three secret sources with auto-detection: Infisical (self-hosted or cloud) → `.env` file → direct env vars
- Reference-driven generation with local files or URLs
- Audit trail in `assets/generated/manifest.json`
- Zero runtime dependencies (Node 18+ only)

**Docs:**
- Bilingual READMEs (English, Português) — Español as follow-up
- Full model decision matrix at `docs/references/model-matrix.md`
- GitHub Pages landing page at `docs/index.html`
- SKILL.md for Claude Code integration

**Tooling:**
- `install.mjs` cross-platform interactive setup
- GitHub Actions workflow for syntax linting

[2.0.0]: https://github.com/hectorcanaimero/da-vinci/releases/tag/v2.0.0
[1.0.0]: https://github.com/hectorcanaimero/da-vinci/releases/tag/v1.0.0
