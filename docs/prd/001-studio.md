---
type: prd
project_id: da-vinci
version: 0.1
generated_by: orch-prd
generated_at: 2026-09-25
title: Da Vinci Studio — dashboard local y router de generación
---

# Da Vinci Studio — dashboard local y router de generación

## Problem

Da Vinci hoy es un CLI + skill de Claude Code que elige modelo, estima costo y
genera imágenes, SVG, video, audio y 3D sobre 7 proveedores. Funciona muy bien
desde Claude, pero todo lo que produce queda disperso: cada proyecto tiene su
`assets/generated/manifest.json`, no hay forma de ver qué se generó, con qué
prompt, cuánto costó, ni de qué imagen salió qué video.

Encadenar assets (imagen → video, imagen → GLB, imagen → sin fondo → upscale)
exige copiar rutas a mano entre comandos. Las API keys viven en `.env` o
Infisical y no hay forma rápida de saber cuál proveedor está conectado. Y
ninguna herramienta que no sea Claude Code puede usar el router.

Referente de espíritu: [9router](https://github.com/decolua/9router) — un
comando, dashboard en localhost, todo local, un endpoint al que se conecta
cualquier herramienta, fallback entre proveedores.

## Users

- **Dueño / creador (Héctor)** — genera assets para sus proyectos desde Claude
  Code y quiere encontrarlos, reutilizarlos y encadenarlos sin la terminal.
- **Usuario open source** — instala con npm, conecta sus propias keys y usa el
  dashboard o el endpoint desde sus herramientas (n8n, Open WebUI, scripts).
- **Herramientas cliente** — Claude Code (skill), n8n, cualquier cliente que
  hable la API de imágenes de OpenAI.

## Goals

- G1 — Toda generación, venga del CLI, la skill, el dashboard o la API, queda
  en una biblioteca única, buscable, con prompt, modelo, costo y linaje.
- G2 — Encadenar un asset existente hacia otra generación toma un clic, sin
  copiar rutas.
- G3 — De cero a dashboard abierto con un proveedor conectado en < 2 minutos:
  `npm i -g da-vinci && davinci serve`.
- G4 — Cualquier cliente compatible con OpenAI Images genera vía Da Vinci
  cambiando solo base URL y modelo.
- G5 — Nada de lo que funciona hoy (CLI, skill, `manifest.json`) se rompe.

## Non-goals

- **Lienzo de nodos estilo ComfyUI.** El encadenamiento se hace desde el
  detalle del asset; un editor de grafos es otro producto.
- **Multiusuario, cuentas, nube, hosting.** Es local-first, un usuario.
- **Cobro o reventa de créditos.** Cada quien usa sus propias keys.
- **Edición de imagen dentro del dashboard** (máscaras, inpainting manual).
- **Proveedores nuevos.** Se usan los 7 existentes; agregar uno es trabajo aparte.

## Functional requirements

### Biblioteca

- **FR-1** — Cada generación exitosa se registra en una biblioteca global con
  id, fecha, tipo (image/svg/video/audio/sfx/model-3d), prompt, proveedor,
  modelo, parámetros, costo, ruta del archivo, origen (cli/api/dashboard) y
  proyecto (cwd). *Acceptance:* tras `davinci image --prompt x` desde dos
  proyectos distintos, ambas aparecen en la Library con su proyecto.
- **FR-2** — Las generaciones que usan otro asset como entrada guardan el
  vínculo al id de ese asset cuando existe en la biblioteca, y la URL/ruta
  cuando no. *Acceptance:* un video generado desde una imagen de la
  biblioteca muestra esa imagen como padre, aunque la imagen se renombre.
- **FR-3** — Al primer arranque, y con un comando explícito, se importan los
  `manifest.json` existentes sin duplicar. *Acceptance:* importar el mismo
  manifest dos veces deja la misma cantidad de registros.
- **FR-4** — Varias generaciones concurrentes nunca pierden registros.
  *Acceptance:* 10 generaciones lanzadas en paralelo producen 10 registros en
  la biblioteca y 10 entradas en el `manifest.json` del proyecto.
- **FR-5** — El CLI sigue escribiendo `<cwd>/assets/generated/manifest.json`
  con el formato actual. *Acceptance:* el formato de entrada del README sigue
  siendo válido.

### Dashboard

- **FR-6** — `davinci serve` levanta el dashboard en localhost y lo abre en el
  navegador. *Acceptance:* tras el comando, `http://localhost:<port>` responde
  con la Library.
- **FR-7** — **Library:** grilla con miniatura (o reproductor para video/audio,
  visor para GLB), búsqueda por texto del prompt, filtros por tipo, proveedor,
  modelo, proyecto y rango de fechas. *Acceptance:* buscar una palabra del
  prompt filtra en < 300 ms con 5 000 registros.
- **FR-8** — **Detalle:** muestra prompt completo, parámetros, costo, archivo
  (abrir/descargar/copiar ruta) y el árbol de linaje (padres e hijos).
  *Acceptance:* navegar de un GLB a la imagen origen y de ahí a sus otros hijos.
- **FR-9** — **Studio:** formulario para generar cualquier tipo soportado,
  eligiendo proveedor/modelo o dejando "auto", con estimación de costo antes
  de enviar. *Acceptance:* el costo estimado se muestra antes de confirmar y
  coincide con `--dry-run` del CLI.
- **FR-10** — Acciones desde un asset: regenerar, variar prompt, y usarlo como
  entrada para video, 3D, quitar fondo y upscale. *Acceptance:* "→ video" abre
  Studio con la imagen ya cargada como referencia y el resultado queda como
  hijo.
- **FR-11** — Las generaciones largas (video, 3D) corren en segundo plano con
  estado visible (en cola, generando, listo, falló) y el dashboard se
  actualiza solo al terminar. *Acceptance:* cerrar y reabrir la pestaña
  mientras corre un video sigue mostrando su estado.
- **FR-12** — **Providers:** estado de cada proveedor (conectado / sin key /
  error), origen de la key (env, `.env`, Infisical), probar conexión y
  guardar una key nueva desde la interfaz. *Acceptance:* pegar una key de FAL
  y probar la conexión marca FAL como conectado sin reiniciar.
- **FR-13** — **Spend:** gasto por día, proveedor y modelo en un rango de
  fechas, y total del mes. *Acceptance:* el total coincide con la suma de
  costos de la biblioteca en ese rango.
- **FR-14** — Borrar un asset de la biblioteca (con opción de borrar también
  el archivo) y marcar favoritos. *Acceptance:* un asset borrado no aparece en
  la Library ni en su linaje; sus hijos siguen existiendo.

### Router y API

- **FR-15** — API HTTP local compatible con OpenAI Images
  (`POST /v1/images/generations`) y listado de modelos (`GET /v1/models`),
  con modelos nombrados `<proveedor>/<modelo>`. *Acceptance:* el SDK oficial
  de OpenAI con `baseURL` local genera una imagen con `fal/flux-schnell`.
- **FR-16** — API nativa para todos los tipos (incluye video, audio, 3D,
  bg-remove, upscale) y para consultar la biblioteca y el estado de trabajos.
  *Acceptance:* todo lo que hace el dashboard lo hace vía esta API.
- **FR-17** — Fallback: si el proveedor elegido falla por error de proveedor
  (no por prompt inválido), se intenta el siguiente candidato equivalente
  configurado, y el registro indica qué proveedor respondió. *Acceptance:*
  con la key de Gemini inválida, un video `veo-3-fast` se genera vía KIE y
  queda registrado con `provider: kie`.
- **FR-18** — Tope de gasto: los umbrales auto/warn/confirm existentes se
  aplican a toda generación; por API, un pedido sobre el umbral `confirm` se
  rechaza salvo confirmación explícita, y existe un tope diario opcional.
  *Acceptance:* con tope diario $1 ya consumido, el siguiente pedido se
  rechaza con un error que dice el tope.

### CLI

- **FR-19** — El CLI y la skill actuales siguen funcionando con los mismos
  flags y la misma salida JSON, y además registran en la biblioteca global.
  *Acceptance:* los ejemplos del README corren sin cambios.

## Non-functional requirements

- **NFR-1** — Local-first: el servidor escucha solo en `127.0.0.1` por
  defecto; exponerlo en la red exige flag explícito y API key.
- **NFR-2** — Instalación: `npm i -g da-vinci` sin paso de compilación en la
  máquina del usuario ni toolchain nativo.
- **NFR-3** — Constraint: Node.js; el núcleo mantiene cero dependencias de
  runtime (como hoy). El dashboard se entrega pre-compilado dentro del paquete.
- **NFR-4** — Las API keys nunca se envían al navegador completas ni se
  escriben en logs; el archivo donde se guardan tiene permisos `600`.
- **NFR-5** — La Library carga la primera página en < 1 s con 5 000 assets.
- **NFR-6** — Licencia Apache-2.0 (la actual), README en español, inglés y
  portugués como hoy.
- **NFR-7** — Si el proceso se reinicia con trabajos en curso, quedan marcados
  como fallidos o se retoman; nunca quedan "generando" para siempre.

## Assumptions

- A1 — Comando `davinci serve` (el binario `davinci` ya existe). `davinci` sin
  argumentos sigue mostrando ayuda, no abre el dashboard.
- A2 — Puerto por defecto `20130`, configurable.
- A3 — Paquete npm `da-vinci` (libre en el registro a 2026-09-25).
- A4 — Biblioteca global en `~/.davinci/`; los archivos generados desde el
  CLI se quedan donde están hoy (en el proyecto); los generados desde el
  dashboard/API van a `~/.davinci/library/`.
- A5 — Las keys guardadas desde la UI van a `~/.config/da-vinci/.env`, que ya
  es una ruta que el cargador de secretos lee.
- A6 — Idioma del dashboard: español primero, textos preparados para
  traducir.
- A7 — Node ≥ 22.13 como mínimo (hoy `engines` dice ≥ 18).

## Open questions

- Q1 — ¿`davinci` sin argumentos debería abrir el dashboard, como `9router`?
  Cambia el comportamiento del commit `d5d0798`. — Héctor.
- Q2 — ¿Hace falta endpoint compatible con OpenAI para video (`/v1/videos`) y
  audio (`/v1/audio/speech`) en v1, o alcanza con imágenes + API nativa? — Héctor.

## Milestones

- M1 — **Biblioteca única:** el CLI registra en la biblioteca global, se
  importan los manifests, no se pierden registros. FR-1, FR-2, FR-3, FR-4,
  FR-5, FR-19.
- M2 — **Servidor y API:** `davinci serve`, API nativa, API compatible con
  OpenAI, trabajos en segundo plano, fallback y tope de gasto. FR-6, FR-11,
  FR-15, FR-16, FR-17, FR-18.
- M3 — **Library en el dashboard:** grilla, búsqueda, detalle, linaje,
  favoritos y borrado. FR-7, FR-8, FR-14.
- M4 — **Studio:** generar y encadenar desde la interfaz. FR-9, FR-10.
- M5 — **Providers y Spend.** FR-12, FR-13.
