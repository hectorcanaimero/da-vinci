<div align="center">

# 🎨 Da Vinci

**Gere imagens, SVG, vídeos e áudio — uma skill, seis provedores, roteamento inteligente.**

Uma skill do Claude Code (e CLI standalone) que orquestra OpenAI, Google Gemini, FAL, KIE, HeyGen e ElevenLabs — escolhendo automaticamente o melhor modelo por caso de uso com controle de custos embutido.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518-brightgreen)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)
[![Website](https://img.shields.io/badge/website-live-6366f1)](https://davinci.guria.lat)

[Website](https://davinci.guria.lat) · [Setup](#setup) · [Matriz de Modelos](docs/references/model-matrix.md) · [Contribuir](CONTRIBUTING.md)

[English](README.md) · [Español](README.es.md)

</div>

---

## Galeria

Exemplos reais gerados end-to-end via Da Vinci:

<table>
<tr>
<td width="33%" align="center">
  <img src="docs/examples/01-flux-schnell-tooth.png" width="100%" alt="Ilustração minimalista de um dente"><br>
  <sub><b>FAL FLUX Schnell</b> · $0.003 · 4.7s</sub><br>
  <sub><i>"Ilustração de dente minimalista, tons azuis flat"</i></sub>
</td>
<td width="33%" align="center">
  <img src="docs/examples/02-recraft-svg-logo-preview.png" width="100%" alt="Logo SVG calendário e relógio"><br>
  <sub><b>FAL Recraft V3 SVG</b> · $0.08 · 19s · <a href="docs/examples/02-recraft-svg-logo.svg">SVG</a></sub><br>
  <sub><i>"Logo minimalista, calendário + relógio sobreposto"</i></sub>
</td>
<td width="33%" align="center">
  <img src="docs/examples/03-nano-banana-tooth-sparkles.png" width="100%" alt="Dente com brilhos - edição"><br>
  <sub><b>Gemini Nano-Banana</b> · $0.039 · 7.7s</sub><br>
  <sub><i>Edição do dente à esquerda — adicionou brilhos, preservou estilo</i></sub>
</td>
</tr>
</table>

**Total para gerar os três: $0.125 (~12¢). Três minutos.**

---

## Por que Da Vinci?

Você é um desenvolvedor construindo uma landing page. Precisa de uma hero image, um logo e um vídeo curto. Sem Da Vinci, você teria que:

- Comparar preços entre 5+ provedores
- Escolher o modelo errado para o job (gastando demais ou tendo resultados medíocres)
- Gerenciar 6 clients de API diferentes + fluxos de auth
- Trackear manualmente o que você gastou

**Com Da Vinci, o Claude faz tudo isso pra você.** Você diz "faz uma hero image pra landing de uma clínica dental", ele escolhe o melhor modelo, estima custo, gera, salva em `assets/generated/`, e loga no `manifest.json`.

### Destaques

- 🧠 **Roteamento inteligente de modelos** — Escolhe entre 30+ modelos de 6 provedores baseado na sua intenção (fotorealista → FLUX Pro Ultra, logo vetorial → Recraft V3 SVG, consistência de personagem → Nano-Banana, etc.)
- 💰 **Controle de custos** — Menos de $0.10 roda automático; $0.10-$1 avisa; acima de $1 requer `--force` explícito. Nunca acorde com uma conta surpresa.
- 🎯 **Baseado em referências** — Passe URLs de imagens ou paths locais como referências. Perfeito para consistência de personagem e transferência de estilo via Nano-Banana.
- 📋 **Trilha de auditoria** — Toda geração logada em `manifest.json` com prompt, modelo, custo, referências, timestamp.
- 🔐 **Secrets flexíveis** — Auto-detecta Infisical (self-hosted ou cloud), arquivo `.env` local ou variáveis de ambiente do shell. Sem lock-in.
- ⚡ **Zero dependências** — Node.js 18+ puro. Não precisa de `npm install`.

---

## Provedores e Modelos Suportados

| Provedor | Modelos | Melhor Para |
|---|---|---|
| **OpenAI** | `gpt-image-1`, `gpt-image-2` | Ilustração, edição com máscaras |
| **Google Gemini** | `nano-banana`, `nano-banana-pro`, `imagen-4`, `veo-3`, `veo-3-fast` | Edições baseadas em referência, vídeo com áudio sincronizado |
| **FAL.ai** | FLUX (Schnell/Dev/Pro/Ultra/2), Recraft V3 (raster & SVG), Ideogram v2/v3, Kling 1.6/2.1, Luma Dream Machine, Minimax Hailuo, Sora 2, Veo 3.1, Wan Turbo, BRIA, Clarity Upscaler | Quase tudo — o canivete suíço |
| **KIE.ai** | Sora 2, Kling 2.1/2.5, Hailuo, Bytedance, Grok Imagine, Flux 2, Ideogram, Recraft, Topaz, ElevenLabs | Gateway pra modelos que não estão no FAL |
| **HeyGen** | HyperFrames, Avatar Video | Vídeos com avatar falando, imagens de marca |
| **ElevenLabs** | Multilingual v2/v1, Turbo v2.5, Flash v2.5, Sound Effects | TTS em 29 idiomas (incluindo PT-BR), SFX |

Matriz completa com casos de uso e custos: [`docs/references/model-matrix.md`](docs/references/model-matrix.md)

---

## Setup

Escolha UMA opção:

### Opção A — Arquivo `.env` (mais simples)

```bash
mkdir -p ~/.config/da-vinci
cp .env.example ~/.config/da-vinci/.env
# edite o arquivo e adicione suas API keys (todas opcionais)
chmod 600 ~/.config/da-vinci/.env
```

Obter keys em: [OpenAI](https://platform.openai.com/api-keys) · [Gemini](https://aistudio.google.com/apikey) · [FAL](https://fal.ai/dashboard/keys) · [KIE](https://kie.ai) · [HeyGen](https://app.heygen.com/settings?nav=API) · [ElevenLabs](https://elevenlabs.io/app/settings/api-keys)

### Opção B — Infisical (recomendado para times)

Se você usa [Infisical](https://infisical.com) (self-hosted ou cloud), adicione ao `~/.zshrc`:

```bash
export INFISICAL_URL="https://your-infisical.com"
export INFISICAL_CLIENT_ID="..."
export INFISICAL_CLIENT_SECRET="..."
export DAVINCI_PROJECT_ID="..."
export DAVINCI_ENV="prod"
```

Da Vinci auto-detecta e busca as API keys via Infisical Universal Auth.

### Opção C — Variáveis de ambiente diretas (CI/CD)

```bash
export OPENAI_API_KEY="sk-..."
export FAL_API_KEY="xxx:yyy"
# etc.
```

Perfeito para GitHub Actions, Docker ou scripts.

### Verificar

```bash
node src/generate.mjs image --provider fal --model flux-schnell \
  --prompt "test" --dry-run --verbose
# Output: 🔑 Secretos cargados desde: dotenv (...) — keys: ...
```

---

## Uso

### Como skill do Claude Code (recomendado)

Fale direto com o Claude:

- *"Da Vinci, gera uma hero image pra landing de uma clínica dental, moderno e minimalista"*
- *"Da Vinci, preciso de um logo em SVG pra Rupies"*
- *"Da Vinci, edita essa foto e muda o fundo pra praia"* (cole URL da imagem)
- *"Da Vinci, faz um vídeo de 5 segundos do produto girando"*

Claude lê [`docs/SKILL.md`](docs/SKILL.md), escolhe o modelo, estima custo, roda, salva o asset e te mostra o path.

### Como CLI standalone

```bash
# Imagem fotorealista
node src/generate.mjs image \
  --provider fal --model flux-pro-ultra \
  --prompt "..." --aspect 16:9

# SVG vetorial (sempre FAL Recraft V3)
node src/generate.mjs svg --prompt "logo minimalista pra clínica"

# Edição com referência (Nano-Banana — melhor pra consistência de personagem)
node src/generate.mjs image \
  --provider gemini --model nano-banana \
  --prompt "mesmo personagem mas com fundo de praia" \
  --refs "https://example.com/character.png"

# Vídeo com áudio sincronizado (Veo 3 — requer --force pelo custo)
node src/generate.mjs video \
  --provider gemini --model veo-3 \
  --prompt "..." --duration 5 --force

# Text-to-speech (PT-BR funciona perfeito)
node src/generate.mjs tts \
  --text "Bem-vindo ao AgendaZap" \
  --voice "21m00Tcm4TlvDq8ikWAM"

# Listar vozes disponíveis
node src/generate.mjs list-voices --provider elevenlabs

# Estimar custo sem executar (dry-run)
node src/generate.mjs video --provider fal --model kling-2.1-master \
  --prompt "..." --dry-run
```

Referência completa de comandos: `node src/generate.mjs --help`

---

## Controle de Custos

| Custo estimado | Comportamento |
|---|---|
| `< $0.10` | Roda automaticamente, imprime custo no stderr |
| `$0.10 – $1.00` | Avisa no stderr, roda mesmo assim |
| `> $1.00` | **Requer** `--force` explícito — bloqueia caso contrário |

Casos típicos acima de $1: vídeos com Kling 2.1 Master, Veo 3 com 8s de duração, batches de 5+ imagens premium.

Ajuste os thresholds editando `src/utils/cost-estimator.mjs`.

---

## Estrutura do Projeto

```
da-vinci/
├── LICENSE                      Apache 2.0
├── README.md                    English
├── README.pt.md                 Português
├── README.es.md                 Español
├── package.json
├── .env.example                 Template — copie pra ~/.config/da-vinci/.env
├── .gitignore
├── SKILL.md                     → docs/SKILL.md (symlink)
├── src/
│   ├── generate.mjs             CLI entrypoint
│   ├── providers/               Um arquivo por provedor
│   │   ├── openai.mjs
│   │   ├── gemini.mjs
│   │   ├── fal.mjs
│   │   ├── kie.mjs
│   │   ├── heygen.mjs
│   │   └── elevenlabs.mjs
│   └── utils/
│       ├── secrets.mjs          Auto-detecta Infisical/dotenv/env
│       ├── infisical.mjs        HTTP client pra Infisical /api/v3
│       ├── dotenv.mjs           Parser .env sem dependências
│       ├── cost-estimator.mjs   Tabela de custos + thresholds
│       ├── reference-loader.mjs Loader de URL e arquivo local
│       └── manifest.mjs         Escritor da trilha de auditoria
└── docs/
    ├── index.html               Landing do GitHub Pages
    ├── SKILL.md                 Instruções pro Claude
    ├── examples/                Galeria de gerações reais
    └── references/
        └── model-matrix.md      Matriz completa de decisão
```

---

## Trilha de Auditoria

Toda geração é adicionada em `<projectRoot>/assets/generated/manifest.json`:

```json
{
  "generated": [
    {
      "id": "84ac4a32-...",
      "timestamp": "2026-08-10T21:35:30.453Z",
      "prompt": "ilustração minimalista de dente...",
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

Total gasto no projeto atual:
```bash
node -e "import('./src/utils/manifest.mjs').then(m => m.totalSpent().then(t => console.log('$' + t.toFixed(3))))"
```

---

## Segurança

- API keys **nunca** tocam o disco em texto plano (com Infisical) ou ficam só em um arquivo `.env` com `chmod 600`
- JWTs em cache só em memória (nunca persistidos)
- Machine Identity com role `Viewer` no Infisical (least-privilege)
- `.gitignore` exclui todos os secrets, assets gerados e node modules por default
- Manifest loga prompts mas **nunca** API keys

Veja [`.env.example`](.env.example) para o template seguro.

---

## Contribuir

PRs são bem-vindos. Adicionar um provedor ou modelo é um trabalho de 20 minutos:

1. Adicione entry em `src/providers/<provider>.mjs` (ou crie arquivo novo)
2. Adicione estimativa de custo em `src/utils/cost-estimator.mjs`
3. Atualize `docs/references/model-matrix.md` com o caso de uso
4. Bump `metadata.version` em `docs/SKILL.md`

Guia completo: [`CONTRIBUTING.md`](CONTRIBUTING.md)

---

## Roadmap

- [ ] Cache de assets gerados por hash do prompt (pula re-geração)
- [ ] Modo batch: ler prompts de um array JSON, gerar em paralelo
- [ ] Comando `variations` pra regenerar o último asset com nova seed
- [ ] Integração de auto-upload com Cloudflare Images / R2
- [ ] Fallback de modelo local (Ollama Vision + SD) pra uso offline
- [ ] Dashboard Web UI pra navegar o manifest

---

## Licença

Apache License 2.0 — veja [LICENSE](LICENSE).

## Autor

Feito por **[Héctor Rodríguez](https://github.com/hectorcanaimero)** para [Claude Code](https://claude.ai/code).

Se Da Vinci te economizou tempo ou grana, deixa uma ⭐ no repo. Ajuda muito.
