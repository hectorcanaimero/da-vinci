<div align="center">

# 🎨 Reverón

**Gere imagens, SVG, vídeos, áudio e modelos 3D — uma skill, sete provedores, roteamento inteligente.**

Uma skill do Claude Code (e CLI standalone) que orquestra OpenAI, Google Gemini, FAL, KIE, HeyGen, ElevenLabs e Tripo3D — escolhendo automaticamente o melhor modelo por caso de uso com controle de custos embutido.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A522-brightgreen)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)
[![Website](https://img.shields.io/badge/website-live-6366f1)](https://reveron.guria.lat)

[Website](https://reveron.guria.lat) · [Setup](#setup) · [Matriz de Modelos](docs/references/model-matrix.md) · [Contribuir](CONTRIBUTING.md)

[English](README.md) · [Español](README.es.md)

</div>

---

## Galeria

Exemplos reais gerados end-to-end via Reverón:

<table>
<tr>
<td width="33%" align="center">
  <img src="docs/examples/01-flux-schnell-tooth.png" width="100%" alt="Ilustração minimalista de um dente"><br>
  <sub><b>FAL FLUX Schnell</b> · $0.003 · 4.7s</sub><br>
  <sub><i>"Ilustração minimalista de dente, tons azuis flat"</i></sub>
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

## Por que Reverón?

Você é um desenvolvedor construindo uma landing page. Precisa de uma hero image, um logo e um vídeo curto. Sem Reverón, você teria que:

- Comparar preços entre 5+ provedores
- Escolher o modelo errado para o job (gastando demais ou tendo resultados medíocres)
- Gerenciar 6 clients de API diferentes + fluxos de auth
- Rastrear manualmente o que você gastou

**Com Reverón, o Claude faz tudo isso pra você.** Você diz "faz uma hero image pra landing de uma clínica dental", ele escolhe o melhor modelo, estima custo, gera, salva em `assets/generated/`, e loga no `manifest.json`.

### Destaques

- 🧠 **Roteamento inteligente de modelos** — Escolhe entre 30+ modelos de 7 provedores baseado na sua intenção (fotorealista → FLUX Pro Ultra, logo vetorial → Recraft V3 SVG, consistência de personagem → Nano-Banana, foto de produto → GLB 3D via Tripo3D, etc.)
- 💰 **Controle de custos** — Menos de $0.10 roda automático; $0.10-$1 avisa; acima de $1 requer `--force` explícito. Nunca acorde com uma conta surpresa.
- 🎯 **Baseado em referências** — Passe URLs de imagens ou caminhos locais como referências. Perfeito para consistência de personagem e transferência de estilo via Nano-Banana.
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
| **ElevenLabs** | Multilingual v2/v1, Turbo v2.5, Flash v2.5, Sound Effects | TTS em 29 idiomas, SFX |
| **Tripo3D** | Text-to-Model, Image-to-Model | Assets 3D (GLB) para jogos, AR, impressão 3D |

Matriz completa com casos de uso e custos: [`docs/references/model-matrix.md`](docs/references/model-matrix.md)

---

## Instalação

### Global (recomendado)

```bash
npm install -g reveron
reveron --help
reveron serve                # inicia dashboard + API em http://127.0.0.1:20130
```

### Local (desenvolvimento)

```bash
git clone https://github.com/hectorcanaimero/reveron.git
cd reveron
npm ci && npm run build:ui
npm run install:setup        # setup interativo
node src/generate.mjs --help
npm start image --provider fal --model flux-schnell --prompt "test" --dry-run
```

## Autorização (Primeira Execução)

Reverón é distribuído **sem notarização** para eliminar atrito. Dependendo do seu SO, você precisará autorizá-lo uma vez:

### macOS — Gatekeeper

Quando você rodar `reveron` pela primeira vez, você verá: _"reveron não pode ser aberto porque o desenvolvedor não pode ser verificado."_

**Passos:**

1. Vá para **Configurações do Sistema → Privacidade e Segurança** (ou **Preferências do Sistema → Segurança e Privacidade** em macOS mais antigos)
2. Role para baixo para encontrar a mensagem sobre **reveron** sendo bloqueado
3. Clique em **Abrir Mesmo Assim** (você pode precisar se autenticar com sua senha)
4. O app será lançado e você conseguirá usá-lo daqui em diante

Alternativamente, pela linha de comando:
```bash
xattr -d com.apple.quarantine /usr/local/lib/node_modules/reveron/src/generate.mjs
```

**Por quê:** O Gatekeeper da Apple requer certificados de Desenvolvedor pagos. Ignoramos esse custo e deixamos você autorizar uma vez.

### Windows — SmartScreen

Windows pode mostrar: _"Windows protegeu seu PC"_ e bloquear o download ou execução.

**Passos:**

1. Se o download foi bloqueado:
   - Abra a pasta **Downloads**, clique com o botão direito no arquivo `.msi`
   - Clique em **Propriedades** → **Geral** (área inferior)
   - Marque **Desbloquear** e clique em **Aplicar**

2. Se a instalação foi bloqueada pelo SmartScreen:
   - Clique em **Mais informações** no prompt de segurança
   - Clique em **Executar mesmo assim** (não requer autenticação adicional)

3. Depois da instalação, o app funcionará normalmente

**Por quê:** O SmartScreen do Windows verifica se os apps foram vistos por milhões de usuários. Apps novos requerem autorização explícita do usuário.

### Linux — Permissões de Execução

No Linux, você precisa marcar o AppImage como executável:

```bash
chmod +x reveron-*.AppImage
./reveron-*.AppImage
```

Ou pelo gerenciador de pacotes (se disponível):
```bash
# Ubuntu/Debian
sudo apt-get install ./reveron-*.deb

# Fedora/RHEL
sudo dnf install ./reveron-*.rpm
```

**Distribuição Suportada:** Reverón v2.0 alvo **Ubuntu 20.04 LTS e posterior** devido a dependências do WebKitGTK. Outras distribuições (Fedora, Arch, openSUSE) requerem instalação manual do WebKitGTK. Para detalhes, veja o gerenciador de pacotes da sua distribuição.

**Por quê:** Linux requer permissões de execução explícitas por design. Após esse primeiro passo, o AppImage roda sem autorização adicional.

## Setup

Escolha UMA opção para API keys:

### Opção A — Arquivo `.env` (mais simples)

```bash
mkdir -p ~/.config/reveron
cp .env.example ~/.config/reveron/.env
# edite o arquivo e adicione suas API keys (todas opcionais)
chmod 600 ~/.config/reveron/.env
```

Obter keys em: [OpenAI](https://platform.openai.com/api-keys) · [Gemini](https://aistudio.google.com/apikey) · [FAL](https://fal.ai/dashboard/keys) · [KIE](https://kie.ai) · [HeyGen](https://app.heygen.com/settings?nav=API) · [ElevenLabs](https://elevenlabs.io/app/settings/api-keys) · [Tripo3D](https://platform.tripo3d.ai/api-keys)

### Opção B — Infisical (recomendado para times)

Se você usa [Infisical](https://infisical.com) (self-hosted ou cloud), adicione ao `~/.zshrc`:

```bash
export INFISICAL_URL="https://your-infisical.com"
export INFISICAL_CLIENT_ID="..."
export INFISICAL_CLIENT_SECRET="..."
export REVERON_PROJECT_ID="..."
export REVERON_ENV="prod"
```

Reverón auto-detecta e busca as API keys via Infisical Universal Auth. Veja [`docs/references/infisical-setup.md`](docs/references/model-matrix.md) para o guia completo.

### Opção C — Variáveis de ambiente diretas (CI/CD)

```bash
export OPENAI_API_KEY="sk-..."
export FAL_API_KEY="xxx:yyy"
# etc.
```

Perfeito para GitHub Actions, Docker ou scripts.

### Verificar

```bash
reveron image --provider fal --model flux-schnell --prompt "test" --dry-run --verbose
# Output: 🔑 Secretos cargados desde: dotenv (...) — keys: ...
```

---

## Uso

### Como skill do Claude Code (recomendado)

Fale direto com o Claude:

- *"Reverón, gera uma hero image pra landing de uma clínica dental, moderno e minimalista"*
- *"Reverón, preciso de um logo em SVG pra AgendaZap"*
- *"Reverón, edita essa foto e muda o fundo pra praia"* (cole URL da imagem)
- *"Reverón, faz um vídeo de 5 segundos do produto girando"*

Claude lê [`docs/SKILL.md`](docs/SKILL.md), escolhe o modelo, estima custo, roda, salva o asset e te mostra o path.

### Como CLI standalone

```bash
# Imagem fotorealista
reveron image \
  --provider fal --model flux-pro-ultra \
  --prompt "..." --aspect 16:9

# SVG vetorial (sempre FAL Recraft V3)
reveron svg --prompt "logo minimalista pra clínica"

# Edição com referência (Nano-Banana — melhor pra consistência de personagem)
reveron image \
  --provider gemini --model nano-banana \
  --prompt "mesmo personagem mas com fundo de praia" \
  --refs "https://example.com/character.png"

# Vídeo com áudio sincronizado (Veo 3 — requer --force pelo custo)
reveron video \
  --provider gemini --model veo-3 \
  --prompt "..." --duration 5 --force

# Text-to-speech
reveron tts \
  --text "Bem-vindo ao AgendaZap" \
  --voice "21m00Tcm4TlvDq8ikWAM"

# Modelo 3D (GLB) do texto — Tripo3D
reveron model-3d --prompt "uma espada medieval low poly"

# Modelo 3D (GLB) de uma imagem de referência — Tripo3D
reveron model-3d --refs "https://example.com/product.png"

# Listar vozes disponíveis
reveron list-voices --provider elevenlabs

# Estimar custo sem executar (dry-run)
reveron video --provider fal --model kling-2.1-master \
  --prompt "..." --dry-run
```

Referência completa de comandos: `reveron --help`

---

## Dashboard (`reveron serve`)

Inicie com `reveron serve` para abrir o dashboard local em `http://127.0.0.1:20130`.

### Quatro Seções

1. **Studio** — Gere novos assets (imagem, vídeo, SVG, modelo 3D, TTS, etc.). Mostra estimativas de custo e status de jobs em tempo real.

2. **Biblioteca** — Navegue todas as gerações (global e com escopo de projeto). Busque por prompt, provedor, modelo. Marque favoritos, delete com cleanup opcional de arquivo, inspecione linhagem (gerações que usaram este asset como referência).

3. **Provedores** — Gerencie API keys. Mostra status de conexão para cada um dos 7 provedores. Adicione keys diretamente (salvas em `~/.reveron/config.json`) ou use Infisical.

4. **Gastos** — Visualize tendências de custos. Filtre por intervalo de data, agrupe por provedor/modelo/dia. Veja alertas de orçamento diário e total anual.

### API Server

O mesmo servidor também expõe uma API REST (útil para CI/CD, automação ou frontends customizados). URL base: `http://127.0.0.1:20130` (padrão).

Todas as rotas requerem **API key** opcional (para exposição em rede). Configure em:

```json
{
  "host": "0.0.0.0",
  "port": 20130,
  "apiKey": "sk-...",
  "dailyBudgetUsd": 10,
  "concurrency": 3
}
```

Depois use o header `X-Reveron-API-Key`:

```bash
curl http://<host>:20130/api/health \
  -H "X-Reveron-API-Key: sk-..."
```

### Rotas da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Status do servidor + versão |
| GET | `/api/models` | Liste 30+ modelos com custos; filtre por `?kind=image` |
| POST | `/api/estimate` | Estime custo: `{ intent, prompt, provider, model, ... }` → `{ costUsd, level, ... }` |
| POST | `/api/generations` | Enfileire geração: `{ ... }` → `{ job: { id, status, ... } }` |
| GET | `/api/jobs` | Liste jobs (filtre por `?status=pending`); paginação com `?limit` |
| GET | `/api/jobs/:id` | Obtenha um job (siga campo `result` para asset ID quando pronto) |
| GET | `/api/library` | Liste todas as gerações; filtre por `?favorite=true`, projeto, intervalo de data |
| GET | `/api/library/:id` | Obtenha um asset + linhagem (quais gerações usaram como referência) |
| PATCH | `/api/library/:id` | Atualize asset: `{ favorite: boolean }` |
| DELETE | `/api/library/:id` | Delete asset; `?file=true` também deleta arquivo |
| GET | `/api/spend` | Resumo de custos; `?groupBy=day\|provider\|model`, filtros de data |
| POST | `/api/import` | Importe manifest: `{ path: "..." }` → `{ imported, skipped }` |

### Exemplo: Compatibilidade com SDK OpenAI

Use Reverón como um endpoint compatível com OpenAI:

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-...",           # (opcional, se servidor tem apiKey configurado)
    base_url="http://127.0.0.1:20130/v1",
)

# Funciona como OpenAI mas roteia pra Reverón (escolhe melhor modelo por intenção)
response = client.images.generate(
    prompt="ilustração minimalista de dente",
    n=1,
)
image_url = response.data[0].url
```

Ou com cURL:

```bash
curl http://127.0.0.1:20130/v1/images/generations \
  -H "Authorization: Bearer sk-..." \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "ilustração minimalista de dente",
    "n": 1
  }'
```

---

## Biblioteca Global (`~/.reveron/`)

Toda geração é salva na biblioteca global (banco de dados + arquivos). Use via CLI ou dashboard.

### Estrutura de Diretórios

```
~/.reveron/
├── config.json              Suas configurações (porta, host, apiKey, orçamento, etc.)
├── orch.db                  Banco SQLite (gerações, linhagem, favoritos)
└── assets/
    ├── <id>/
    │   ├── artifact.{jpg,png,mp4,glb,mp3}
    │   ├── metadata.json
    │   └── generation.json
    └── ...
```

### Referencie Gerações em Prompts

Use `--refs reveron:<id>` para referenciar uma geração salva:

```bash
reveron image --provider gemini --model nano-banana \
  --prompt "mesmo estilo mas em uma praia" \
  --refs reveron:84ac4a32-5c48-4f8e-8f4c-a8f8c8f8c8f8
```

Útil para construir sobre trabalho anterior (consistência de personagem, encadeamento de estilo, refinamento iterativo).

---

## Comando Import

Migre de manifests locais de projeto para a biblioteca global:

```bash
reveron import ./assets/generated/manifest.json
# Output: { imported: 42, skipped: 3 }
```

Cada asset é copiado pra `~/.reveron/assets/` com toda linhagem preservada.

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
reveron/
├── LICENSE                      Apache 2.0
├── README.md
├── package.json
├── .env.example                 Template — copie pra ~/.config/reveron/.env
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
│   │   ├── elevenlabs.mjs
│   │   └── tripo.mjs
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

## Manifest & Trilha de Auditoria

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

---

## Licença

Apache License 2.0 — veja [LICENSE](LICENSE).

## Autor

Feito por **[Héctor Rodríguez](https://github.com/hectorcanaimero)** para [Claude Code](https://claude.ai/code).

Se Reverón te economizou tempo ou grana, deixa uma ⭐ no repo. Ajuda muito.

---

### Nota Histórica

Reverón era anteriormente conhecido como Da Vinci. A biblioteca continua salvando em `~/.reveron/`, e seus antigos manifestos de projeto podem ser importados via `reveron import ./assets/generated/manifest.json`.
