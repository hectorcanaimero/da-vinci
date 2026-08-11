# Changelog

All notable changes to Da Vinci are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/hectorcanaimero/da-vinci/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/hectorcanaimero/da-vinci/releases/tag/v1.0.0
