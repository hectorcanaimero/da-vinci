<div align="center">

# 🎨 Reverón

**Generá imágenes, SVG, videos, audio y modelos 3D — una skill, siete proveedores, enrutamiento inteligente.**

Una skill de Claude Code (y CLI standalone) que orquesta OpenAI, Google Gemini, FAL, KIE, HeyGen, ElevenLabs y Tripo3D — eligiendo automáticamente el mejor modelo por caso de uso con control de costos integrado.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A522-brightgreen)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)
[![Website](https://img.shields.io/badge/website-live-6366f1)](https://reveron.guria.lat)

[Sitio web](https://reveron.guria.lat) · [Setup](#setup) · [Matriz de Modelos](docs/references/model-matrix.md) · [Contribuir](CONTRIBUTING.md)

[English](README.md) · [Português](README.pt.md)

</div>

---

## Galería

Ejemplos reales generados end-to-end vía Reverón:

<table>
<tr>
<td width="33%" align="center">
  <img src="docs/examples/01-flux-schnell-tooth.png" width="100%" alt="Ilustración minimalista de un diente"><br>
  <sub><b>FAL FLUX Schnell</b> · $0.003 · 4.7s</sub><br>
  <sub><i>"Ilustración minimalista de diente, tonos azules planos"</i></sub>
</td>
<td width="33%" align="center">
  <img src="docs/examples/02-recraft-svg-logo-preview.png" width="100%" alt="Logo SVG calendario y reloj"><br>
  <sub><b>FAL Recraft V3 SVG</b> · $0.08 · 19s · <a href="docs/examples/02-recraft-svg-logo.svg">SVG</a></sub><br>
  <sub><i>"Logo minimalista, calendario + reloj superpuesto"</i></sub>
</td>
<td width="33%" align="center">
  <img src="docs/examples/03-nano-banana-tooth-sparkles.png" width="100%" alt="Diente con brillos - edición"><br>
  <sub><b>Gemini Nano-Banana</b> · $0.039 · 7.7s</sub><br>
  <sub><i>Edición del diente a la izquierda — agregó brillos, preservó estilo</i></sub>
</td>
</tr>
</table>

**Total para generar los tres: $0.125 (~12¢). Tres minutos.**

---

## ¿Por qué Reverón?

Sos un desarrollador construyendo una landing page. Necesitás una hero image, un logo y un video corto. Sin Reverón, tendrías que:

- Comparar precios entre 5+ proveedores
- Elegir el modelo equivocado para el laburo (gastando de más o teniendo resultados mediocres)
- Manejar 6 clientes de API diferentes + flujos de auth
- Rastrear manualmente lo que gastaste

**Con Reverón, Claude hace todo eso por vos.** Decís "hacé una hero image para una landing de una clínica dental", elige el mejor modelo, estima costo, genera, guarda en `assets/generated/`, y lo loga en `manifest.json`.

### Destacados

- 🧠 **Enrutamiento inteligente de modelos** — Elige entre 30+ modelos de 7 proveedores basado en tu intención (fotorrealista → FLUX Pro Ultra, logo vectorial → Recraft V3 SVG, consistencia de personaje → Nano-Banana, foto de producto → GLB 3D vía Tripo3D, etc.)
- 💰 **Control de costos** — Menos de $0.10 corre automático; $0.10-$1 avisa; arriba de $1 requiere `--force` explícito. Nunca te despiertes con una factura sorpresa.
- 🎯 **Basado en referencias** — Pasá URLs de imágenes o rutas locales como referencias. Perfecto para consistencia de personaje y transferencia de estilo vía Nano-Banana.
- 📋 **Auditoría trail** — Toda generación logeada en `manifest.json` con prompt, modelo, costo, referencias, timestamp.
- 🔐 **Secrets flexibles** — Auto-detecta Infisical (self-hosted o cloud), archivo `.env` local o variables de ambiente del shell. Sin lock-in.
- ⚡ **Cero dependencias** — Node.js 22+ puro. No necesita `npm install`.

---

## Proveedores y Modelos Soportados

| Proveedor | Modelos | Mejor Para |
|---|---|---|
| **OpenAI** | `gpt-image-1`, `gpt-image-2` | Ilustración, edición con máscaras |
| **Google Gemini** | `nano-banana`, `nano-banana-pro`, `imagen-4`, `veo-3`, `veo-3-fast` | Ediciones basadas en referencia, video con audio sincronizado |
| **FAL.ai** | FLUX (Schnell/Dev/Pro/Ultra/2), Recraft V3 (raster & SVG), Ideogram v2/v3, Kling 1.6/2.1, Luma Dream Machine, Minimax Hailuo, Sora 2, Veo 3.1, Wan Turbo, BRIA, Clarity Upscaler | Casi todo — la navaja suiza |
| **KIE.ai** | Sora 2, Kling 2.1/2.5, Hailuo, Bytedance, Grok Imagine, Flux 2, Ideogram, Recraft, Topaz, ElevenLabs | Gateway a modelos que no están en FAL |
| **HeyGen** | HyperFrames, Avatar Video | Videos con avatar hablando, imágenes de marca |
| **ElevenLabs** | Multilingual v2/v1, Turbo v2.5, Flash v2.5, Sound Effects | TTS en 29 idiomas, SFX |
| **Tripo3D** | Text-to-Model, Image-to-Model | Assets 3D (GLB) para juegos, AR, impresión 3D |

Matriz completa con casos de uso y costos: [`docs/references/model-matrix.md`](docs/references/model-matrix.md)

---

## Instalación

### Global (recomendado)

```bash
npm install -g reveron
reveron --help
reveron serve                # inicia dashboard + API en http://127.0.0.1:20130
```

### Local (desarrollo)

```bash
git clone https://github.com/hectorcanaimero/reveron.git
cd reveron
npm ci && npm run build:ui
npm run install:setup        # setup interactivo
node src/generate.mjs --help
npm start image --provider fal --model flux-schnell --prompt "test" --dry-run
```

## Autorización (Primera Ejecución)

Reverón se distribuye **sin notarización** para eliminar fricción. Dependiendo de tu SO, vas a necesitar autorizarlo una vez:

### macOS — Gatekeeper

Cuando ejecutes `reveron` por primera vez, vas a ver: _"reveron no puede abrirse porque el desarrollador no puede ser verificado."_

**Pasos:**

1. Andá a **Configuración del Sistema → Privacidad y Seguridad** (o **Preferencias del Sistema → Seguridad y Privacidad** en macOS más viejo)
2. Scrolleá para encontrar el mensaje sobre **reveron** siendo bloqueado
3. Hacé click en **Abrir de todas formas** (es posible que necesites autenticarte con tu contraseña)
4. La app se va a lanzar y vas a poder usarla de ahí en adelante

Alternativamente, desde la línea de comandos:
```bash
xattr -d com.apple.quarantine /usr/local/lib/node_modules/reveron/src/generate.mjs
```

**¿Por qué?** El Gatekeeper de Apple requiere certificados de Desarrollador pagos. Nos saltamos ese costo y te dejamos autorizar una vez.

### Windows — SmartScreen

Windows puede mostrar: _"Windows protegió tu PC"_ y bloquear la descarga o ejecución.

**Pasos:**

1. Si la descarga fue bloqueada:
   - Abrí la carpeta **Descargas**, hacé click derecho en el archivo `.msi`
   - Hacé click en **Propiedades** → **General** (área inferior)
   - Marcá **Desbloquear** y hacé click en **Aplicar**

2. Si la instalación fue bloqueada por SmartScreen:
   - Hacé click en **Más información** en el prompt de seguridad
   - Hacé click en **Ejecutar de todas formas** (no requiere autenticación adicional)

3. Después de la instalación, la app va a funcionar normalmente

**¿Por qué?** SmartScreen de Windows verifica si las apps fueron vistas por millones de usuarios. Las apps nuevas requieren autorización explícita del usuario.

### Linux — Permisos de Ejecución

En Linux, necesitás marcar el AppImage como ejecutable:

```bash
chmod +x reveron-*.AppImage
./reveron-*.AppImage
```

O desde el administrador de paquetes (si está disponible):
```bash
# Ubuntu/Debian
sudo apt-get install ./reveron-*.deb

# Fedora/RHEL
sudo dnf install ./reveron-*.rpm
```

**Distribución Soportada:** Reverón v2.0 apunta a **Ubuntu 20.04 LTS y posterior** debido a dependencias de WebKitGTK. Otras distribuciones (Fedora, Arch, openSUSE) requieren instalación manual de WebKitGTK. Para detalles, consultá el administrador de paquetes de tu distro.

**¿Por qué?** Linux requiere permisos de ejecución explícitos por diseño. Después de ese primer paso, el AppImage corre sin autorización adicional.

## Setup

Elegí UNA opción para API keys:

### Opción A — Archivo `.env` (más simple)

```bash
mkdir -p ~/.config/reveron
cp .env.example ~/.config/reveron/.env
# editá el archivo y agregá tus API keys (todas opcionales)
chmod 600 ~/.config/reveron/.env
```

Obtené keys en: [OpenAI](https://platform.openai.com/api-keys) · [Gemini](https://aistudio.google.com/apikey) · [FAL](https://fal.ai/dashboard/keys) · [KIE](https://kie.ai) · [HeyGen](https://app.heygen.com/settings?nav=API) · [ElevenLabs](https://elevenlabs.io/app/settings/api-keys) · [Tripo3D](https://platform.tripo3d.ai/api-keys)

### Opción B — Infisical (recomendado para equipos)

Si usás [Infisical](https://infisical.com) (self-hosted o cloud), agregá a `~/.zshrc`:

```bash
export INFISICAL_URL="https://your-infisical.com"
export INFISICAL_CLIENT_ID="..."
export INFISICAL_CLIENT_SECRET="..."
export REVERON_PROJECT_ID="..."
export REVERON_ENV="prod"
```

Reverón auto-detecta y trae las API keys vía Infisical Universal Auth. Mirá [`docs/references/infisical-setup.md`](docs/references/model-matrix.md) para la guía completa.

### Opción C — Variables de ambiente directas (CI/CD)

```bash
export OPENAI_API_KEY="sk-..."
export FAL_API_KEY="xxx:yyy"
# etc.
```

Perfecto para GitHub Actions, Docker o scripts.

### Verificar

```bash
reveron image --provider fal --model flux-schnell --prompt "test" --dry-run --verbose
# Output: 🔑 Secretos cargados desde: dotenv (...) — keys: ...
```

---

## Uso

### Como skill de Claude Code (recomendado)

Hablá directo con Claude:

- *"Reverón, hacé una hero image para una landing de una clínica dental, moderno y minimalista"*
- *"Reverón, necesito un logo en SVG para AgendaZap"*
- *"Reverón, editá esa foto y cambiá el fondo a playa"* (pegá URL de la imagen)
- *"Reverón, hacé un video de 5 segundos del producto girando"*

Claude lee [`docs/SKILL.md`](docs/SKILL.md), elige el modelo, estima costo, corre, guarda el asset y te muestra el path.

### Como CLI standalone

```bash
# Imagen fotorrealista
reveron image \
  --provider fal --model flux-pro-ultra \
  --prompt "..." --aspect 16:9

# SVG vectorial (siempre FAL Recraft V3)
reveron svg --prompt "logo minimalista para una clínica"

# Edición con referencia (Nano-Banana — mejor para consistencia de personaje)
reveron image \
  --provider gemini --model nano-banana \
  --prompt "mismo personaje pero con fondo de playa" \
  --refs "https://example.com/character.png"

# Video con audio sincronizado (Veo 3 — requiere --force por costo)
reveron video \
  --provider gemini --model veo-3 \
  --prompt "..." --duration 5 --force

# Text-to-speech
reveron tts \
  --text "Bienvenido a AgendaZap" \
  --voice "21m00Tcm4TlvDq8ikWAM"

# Modelo 3D (GLB) desde texto — Tripo3D
reveron model-3d --prompt "una espada medieval low poly"

# Modelo 3D (GLB) desde una imagen de referencia — Tripo3D
reveron model-3d --refs "https://example.com/product.png"

# Listar voces disponibles
reveron list-voices --provider elevenlabs

# Estimar costo sin ejecutar (dry-run)
reveron video --provider fal --model kling-2.1-master \
  --prompt "..." --dry-run
```

Referencia completa de comandos: `reveron --help`

---

## Dashboard (`reveron serve`)

Iniciá con `reveron serve` para abrir el dashboard local en `http://127.0.0.1:20130`.

### Cuatro Secciones

1. **Studio** — Generá nuevos assets (imagen, video, SVG, modelo 3D, TTS, etc.). Muestra estimaciones de costo y status de jobs en tiempo real.

2. **Library** — Navegá todas las generaciones (global y con scope de proyecto). Buscá por prompt, proveedor, modelo. Marcá favoritos, borrá con cleanup opcional de archivo, inspeccioná linaje (generaciones que usaron este asset como referencia).

3. **Providers** — Manejá API keys. Muestra status de conexión para cada uno de los 7 proveedores. Agregá keys directamente (guardadas en `~/.reveron/config.json`) o usá Infisical.

4. **Spend** — Visualizá tendencias de costos. Filtrá por rango de fecha, agrupá por proveedor/modelo/día. Mirá alertas de presupuesto diario y total anual.

### API Server

El mismo servidor también expone una API REST (útil para CI/CD, automación o frontends customizados). URL base: `http://127.0.0.1:20130` (default).

Todas las rutas requieren **API key** opcional (para exposición en red). Configurá en:

```json
{
  "host": "0.0.0.0",
  "port": 20130,
  "apiKey": "sk-...",
  "dailyBudgetUsd": 10,
  "concurrency": 3
}
```

Después usá el header `X-Reveron-API-Key`:

```bash
curl http://<host>:20130/api/health \
  -H "X-Reveron-API-Key: sk-..."
```

### Rutas de la API

| Método | Ruta | Descripción |
|--------|------|-----------|
| GET | `/api/health` | Status del servidor + versión |
| GET | `/api/models` | Listá 30+ modelos con costos; filtrá por `?kind=image` |
| POST | `/api/estimate` | Estimá costo: `{ intent, prompt, provider, model, ... }` → `{ costUsd, level, ... }` |
| POST | `/api/generations` | Encoleá generación: `{ ... }` → `{ job: { id, status, ... } }` |
| GET | `/api/jobs` | Listá jobs (filtrá por `?status=pending`); paginación con `?limit` |
| GET | `/api/jobs/:id` | Obtené un job (seguí campo `result` para asset ID cuando esté listo) |
| GET | `/api/library` | Listá todas las generaciones; filtrá por `?favorite=true`, proyecto, rango de fecha |
| GET | `/api/library/:id` | Obtené un asset + linaje (qué generaciones lo usaron como referencia) |
| PATCH | `/api/library/:id` | Actualizá asset: `{ favorite: boolean }` |
| DELETE | `/api/library/:id` | Borrá asset; `?file=true` también borra archivo |
| GET | `/api/spend` | Resumen de costos; `?groupBy=day\|provider\|model`, filtros de fecha |
| POST | `/api/import` | Importá manifest: `{ path: "..." }` → `{ imported, skipped }` |

### Ejemplo: Compatibilidad con SDK OpenAI

Usá Reverón como un endpoint compatible con OpenAI:

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-...",           # (opcional, si servidor tiene apiKey configurado)
    base_url="http://127.0.0.1:20130/v1",
)

# Funciona como OpenAI pero rutea a Reverón (elige mejor modelo por intención)
response = client.images.generate(
    prompt="ilustración minimalista de diente",
    n=1,
)
image_url = response.data[0].url
```

O con cURL:

```bash
curl http://127.0.0.1:20130/v1/images/generations \
  -H "Authorization: Bearer sk-..." \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "ilustración minimalista de diente",
    "n": 1
  }'
```

---

## Biblioteca Global (`~/.reveron/`)

Toda generación se guarda en la biblioteca global (base de datos + archivos). Usá vía CLI o dashboard.

### Estructura de Directorios

```
~/.reveron/
├── config.json              Tus configuraciones (puerto, host, apiKey, presupuesto, etc.)
├── orch.db                  Base de datos SQLite (generaciones, linaje, favoritos)
└── assets/
    ├── <id>/
    │   ├── artifact.{jpg,png,mp4,glb,mp3}
    │   ├── metadata.json
    │   └── generation.json
    └── ...
```

### Referenciá Generaciones en Prompts

Usá `--refs reveron:<id>` para referenciar una generación guardada:

```bash
reveron image --provider gemini --model nano-banana \
  --prompt "mismo estilo pero en una playa" \
  --refs reveron:84ac4a32-5c48-4f8e-8f4c-a8f8c8f8c8f8
```

Útil para construir sobre trabajo anterior (consistencia de personaje, encadenamiento de estilo, refinamiento iterativo).

---

## Comando Import

Migrá desde manifests locales de proyecto a la biblioteca global:

```bash
reveron import ./assets/generated/manifest.json
# Output: { imported: 42, skipped: 3 }
```

Cada asset se copia a `~/.reveron/assets/` con todo el linaje preservado.

---

## Control de Costos

| Costo estimado | Comportamiento |
|---|---|
| `< $0.10` | Corre automáticamente, imprime costo en stderr |
| `$0.10 – $1.00` | Avisa en stderr, corre igual |
| `> $1.00` | **Requiere** `--force` explícito — bloquea si no |

Casos típicos arriba de $1: videos con Kling 2.1 Master, Veo 3 con 8s de duración, batches de 5+ imágenes premium.

Ajustá los thresholds editando `src/utils/cost-estimator.mjs`.

---

## Estructura del Proyecto

```
reveron/
├── LICENSE                      Apache 2.0
├── README.md
├── package.json
├── .env.example                 Template — copiá a ~/.config/reveron/.env
├── .gitignore
├── SKILL.md                     → docs/SKILL.md (symlink)
├── src/
│   ├── generate.mjs             CLI entrypoint
│   ├── providers/               Un archivo por proveedor
│   │   ├── openai.mjs
│   │   ├── gemini.mjs
│   │   ├── fal.mjs
│   │   ├── kie.mjs
│   │   ├── heygen.mjs
│   │   ├── elevenlabs.mjs
│   │   └── tripo.mjs
│   └── utils/
│       ├── secrets.mjs          Auto-detecta Infisical/dotenv/env
│       ├── infisical.mjs        HTTP client para Infisical /api/v3
│       ├── dotenv.mjs           Parser .env sin dependencias
│       ├── cost-estimator.mjs   Tabla de costos + thresholds
│       ├── reference-loader.mjs Loader de URL y archivo local
│       └── manifest.mjs         Escritor del audit trail
└── docs/
    ├── index.html               Landing de GitHub Pages
    ├── SKILL.md                 Instrucciones para Claude
    ├── examples/                Galería de generaciones reales
    └── references/
        └── model-matrix.md      Matriz completa de decisión
```

---

## Manifest & Audit Trail

Toda generación se agrega a `<projectRoot>/assets/generated/manifest.json`:

```json
{
  "generated": [
    {
      "id": "84ac4a32-...",
      "timestamp": "2026-08-10T21:35:30.453Z",
      "prompt": "ilustración minimalista de diente...",
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

Total gastado en el proyecto actual:
```bash
node -e "import('./src/utils/manifest.mjs').then(m => m.totalSpent().then(t => console.log('$' + t.toFixed(3))))"
```

---

## Seguridad

- API keys **nunca** tocan el disco en texto plano (con Infisical) o viven solo en un archivo `.env` con `chmod 600`
- JWTs en cache solo en memoria (nunca persistidos)
- Machine Identity con rol `Viewer` en Infisical (least-privilege)
- `.gitignore` excluye todos los secrets, assets generados y node modules por default
- Manifest loga prompts pero **nunca** API keys

Mirá [`.env.example`](.env.example) para el template seguro.

---

## Contribuir

PRs bienvenidos. Agregar un proveedor o modelo es un laburo de 20 minutos:

1. Agregá entry en `src/providers/<provider>.mjs` (o creá archivo nuevo)
2. Agregá estimativa de costo en `src/utils/cost-estimator.mjs`
3. Actualizá `docs/references/model-matrix.md` con el caso de uso
4. Bumpá `metadata.version` en `docs/SKILL.md`

Guía completa: [`CONTRIBUTING.md`](CONTRIBUTING.md)

---

## Roadmap

- [ ] Cache de assets generados por hash del prompt (salta re-generación)
- [ ] Modo batch: leer prompts de un array JSON, generar en paralelo
- [ ] Comando `variations` para regenerar el último asset con nueva seed
- [ ] Integración de auto-upload con Cloudflare Images / R2
- [ ] Fallback de modelo local (Ollama Vision + SD) para uso offline

---

## Licencia

Apache License 2.0 — mirá [LICENSE](LICENSE).

## Autor

Hecho por **[Héctor Rodríguez](https://github.com/hectorcanaimero)** para [Claude Code](https://claude.ai/code).

Si Reverón te ahorró tiempo o guita, dejá una ⭐ en el repo. Ayuda banda.

---

### Nota Histórica

Reverón era anteriormente conocido como Da Vinci. La biblioteca continúa guardando en `~/.reveron/`, y tus antiguos manifests de proyecto pueden ser importados vía `reveron import ./assets/generated/manifest.json`.
