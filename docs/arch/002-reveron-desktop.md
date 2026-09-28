---
type: arch
project_id: da-vinci
version: 0.1
depends_on:
  - docs/prd/002-reveron-desktop.md
generated_by: orch-arch
generated_at: 2026-09-28
title: Reverón — architecture
---

# Reverón — architecture

## Context

La arquitectura 001 ya hizo la jugada difícil: sacó la generación del CLI a un
núcleo reutilizable. Hoy existe `core/` (router, catálogo, generate, storage,
config, errores), `providers/` con los 7 proveedores, `library/db.mjs` sobre
`node:sqlite` en `~/.davinci/davinci.db`, y `server/` en `node:http` sin
framework sirviendo `/api`, `/v1`, `/files/:id` y SSE, más el dashboard
estático de `dist/ui`. Todo ESM, Node ≥22.13, **cero dependencias de runtime**.
El dashboard es React 19 + Vite 7 + react-router 7, con `api.ts` y `sse.ts` ya
escritos y probados.

El PRD 002 no cambia nada de eso. Cambia **quién lo arranca y cómo se
distribuye**: en vez de `npm i -g` y `davinci serve` en una terminal, un
binario nativo que el usuario baja, abre y usa. Esta arquitectura, entonces,
**extiende la 001 y no la contradice**: el servidor, la biblioteca y los
proveedores siguen siendo los mismos módulos, y lo que se agrega es una cáscara
de escritorio que los hospeda, más las pantallas que el PRD pide.

```
┌─ Tauri (Rust) ─────────────────────────────────────────────┐
│  lib.rs                                                     │
│   ├─ sidecar.rs ──── spawn/kill del servidor Node          │
│   ├─ secrets.rs ──── llavero del SO  →  env del sidecar    │
│   ├─ agent.rs ────── spawn del CLI de agente → Channel     │
│   └─ WebviewWindow ──────────┐                              │
└──────────────────────────────┼──────────────────────────────┘
                               │  carga http://127.0.0.1:<puerto>
                               ▼
        ui/ (React 19)  ──HTTP + SSE──►  servidor Node (sidecar)
        api.ts · sse.ts                  /api  /v1  /files  /api/events
                                                 │
                                    core/router · core/generate
                                    providers/*  · library/db
                                    ~/.reveron/reveron.db
```

El servidor no es un proceso que el usuario ve: nace con la ventana y muere con
ella. Pero sigue siendo un servidor HTTP de verdad, porque el FR-43 exige que
clientes externos le hablen igual.

## Components

### tauri/shell — `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`
La aplicación. `main.rs` es un pasamanos de tres líneas; toda la lógica vive en
`lib.rs` con `#[cfg_attr(mobile, tauri::mobile_entry_point)]`, que es lo que
exige Tauri v2 aunque no apuntemos a móvil. Registra los plugins, declara los
comandos, crea la ventana y, en el `setup`, arranca el sidecar y espera su
handshake antes de navegar la webview al servidor.

Dueño de: `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/build.rs`,
`src-tauri/capabilities/default.json`.

### tauri/sidecar — `src-tauri/src/sidecar.rs`
Arranca el servidor Node y garantiza que muera. Resuelve el binario de Node
empaquetado y el directorio de recursos con `app.path()`, lo lanza con
`DAVINCI_HOME` apuntando a `~/.reveron` y las llaves inyectadas como variables
de entorno, lee su línea de handshake para conocer el puerto real, y lo mata en
`RunEvent::Exit`. Reinicia el servidor a pedido (FR-45) y expone su estado.

**Nunca se expone al frontend.** El spawn ocurre en Rust; la webview no tiene
permiso de shell para ejecutar nada. Ver D8.

Dueño de: `src-tauri/src/sidecar.rs`, `src-tauri/binaries/`,
`scripts/fetch-node.mjs`.

### tauri/secrets — `src-tauri/src/secrets.rs`
Lee y escribe las llaves en el llavero del sistema operativo con el crate
`keyring` (Keychain en macOS, Credential Manager en Windows, Secret Service en
Linux). Si el llavero no está disponible —típicamente un Linux sin
`gnome-keyring`—, cae al archivo `~/.config/reveron/.env` en modo `600`, que es
exactamente lo que `src/utils/secrets.mjs` ya sabe leer. Expone comandos Tauri
para listar el estado, guardar, rotar y borrar una llave, y le dice al
componente `sidecar` qué inyectar.

Dueño de: `src-tauri/src/secrets.rs`.

### tauri/agent — `src-tauri/src/agent.rs`
Detecta binarios de agente en el `PATH` y en las rutas habituales de cada
sistema (FR-33), lanza el elegido como subproceso con el directorio de trabajo
configurado, y transmite su salida al frontend por un `Channel` tipado. Valida
que la ruta del binario sea la que el usuario configuró antes de ejecutar nada.

Dueño de: `src-tauri/src/agent.rs`.

### tauri/platform — `src-tauri/src/platform.rs`
Lo que difiere por sistema operativo: estilo de la barra de título, tamaño
mínimo de ventana, ruta del explorador de archivos, y el nombre de la tecla
modificadora que el frontend muestra (FR-40).

Dueño de: `src-tauri/src/platform.rs`.

### server — `src/server/**` *(existente, se extiende)*
Sin cambios de diseño. Se le agrega una única cosa: **imprimir una línea de
handshake en stdout al quedar listo**, para que el sidecar sepa en qué puerto
quedó (FR-44). El resto —rutas, SSE, cola, autenticación por llave cuando el
host no es local— ya cumple lo que el PRD pide.

Dueño de: `src/server/start.mjs` (handshake), `src/server/index.mjs`,
`src/server/routes/*.mjs`.

### server/jobs — `src/server/jobs.mjs` *(existente, se modifica)*
Hoy, al arrancar, `library.jobs.failInterrupted()` marca como `failed` todo lo
que quedó `queued` o `running`. El FR-27 pide otra cosa: que esos trabajos
queden **recuperables** y que el usuario decida. Se agrega el estado
`interrupted` y las operaciones de reanudar y descartar. También se agrega
pausar la cola (FR-28) y el reintento con espera creciente (FR-29).

Dueño de: `src/server/jobs.mjs`, `src/library/db.mjs` (migración del esquema).

### library — `src/library/**` *(existente, se extiende)*
Misma base SQLite, misma forma de las tablas. Se muda de `~/.davinci` a
`~/.reveron` por variable de entorno, sin tocar código. Se agrega
`migrate.mjs`: detecta una instalación de Da Vinci, cuenta sus registros e
importa los que falten.

Dueño de: `src/library/db.mjs`, `src/library/import.mjs`,
`src/library/migrate.mjs`.

### core y providers — `src/core/**`, `src/providers/**` *(existentes, intactos)*
No se tocan. El router, el catálogo, el estimador de costos y los 7 proveedores
son exactamente los mismos módulos que ya están en `main`. Es el motivo por el
que el G3 del PRD se cumple sin trabajo: no hay nada que portar.

### ui — `ui/src/**` *(existente, se reestila y se extiende)*
Se conservan `api.ts`, `sse.ts`, `types.ts`, los visores por tipo de asset y el
enrutado. Se cambia el sistema visual completo a los tokens de Reverón y se
agregan las pantallas que el diseño define: barra de título propia, Chat,
Actividad, Onboarding, paleta de comandos y las siete secciones de Ajustes.

Dueño de: `ui/src/**`, `ui/public/fonts/`, `ui/index.html`.

### cli y skill — `src/generate.mjs`, `docs/SKILL.md` *(existentes, se renombran)*
Siguen siendo el paquete real: el CLI genera por su cuenta y la skill se
instala por npm. Sólo cambian de nombre con el rebrand (A1). El paquete de
escritorio y el paquete de npm comparten el mismo `src/`.

Dueño de: `src/generate.mjs`, `docs/SKILL.md`, `package.json`, `install.mjs`.

## Data model

La biblioteca no cambia de forma. Tablas ya existentes en `src/library/db.mjs`:

| Tabla | Claves | Dueño |
| --- | --- | --- |
| `generations` | `id` (uuid), `created_at`, `kind`, `prompt`, `provider`, `model`, `params`, `cost_usd`, `file_path`, `mime`, `bytes`, `source`, `project_dir`, `favorite`, `deleted_at` | `library/db.mjs` |
| `generation_inputs` | `generation_id` → `input_id`; resuelve el linaje en ambas direcciones | `library/db.mjs` |
| `jobs` | `id`, `status`, `source`, `request`, `generation_ids`, `error`, `created_at`, `updated_at` | `library/db.mjs` |

Cambios que introduce este PRD:

- **Migración de esquema 1** — `jobs.status` admite `interrupted`, y se agrega
  `jobs.attempts INTEGER NOT NULL DEFAULT 0` para el reintento con espera
  creciente (FR-29). La migración es aditiva; las filas viejas quedan válidas.
- **Mudanza del hogar** — `~/.davinci` → `~/.reveron`, vía `DAVINCI_HOME`. El
  archivo pasa a llamarse `reveron.db`. No es migración de datos: es otra ruta.
- **Migración desde Da Vinci (FR-12 a FR-14)** — `migrate.mjs` abre la base
  vieja en sólo lectura e inserta en la nueva con `INSERT OR IGNORE` sobre la
  clave primaria, que es un uuid. De ahí sale la idempotencia del FR-14 sin
  código extra. **Los archivos no se copian**: las filas conservan su
  `file_path` original apuntando a `~/.davinci/library/`, así que migrar 1.248
  assets no duplica 3,4 GB de disco, y el origen queda intacto como pide el
  FR-13.

Fuera de SQLite:

- `~/.reveron/config.json` — puerto, host, llave del API, concurrencia, topes
  de gasto, umbral de confirmación, carpeta de assets. Lo gobierna
  `src/core/config.mjs`, que ya existe.
- Llavero del sistema operativo, servicio `reveron`, una entrada por proveedor
  con el nombre de su variable (`FAL_API_KEY`, …).
- `~/.config/reveron/.env` modo `600` — sólo cuando no hay llavero.

## Interfaces

### Sidecar ↔ servidor Node

Contrato de arranque, dueño de la fase F1, fijo desde ahí:

```
argv:  <node> <resources>/src/server/cli.mjs --port <n|0> --host 127.0.0.1
env:   DAVINCI_HOME=<dir>  REVERON_PARENT=1  <KEYS…>
stdout: una línea JSON y nada más antes de ella:
        {"event":"ready","port":20130,"url":"http://127.0.0.1:20130"}
```

- `--port 0` pide puerto libre; el puerto real viaja en el handshake (FR-44).
- El sidecar considera fallido el arranque si no llega la línea en 10 s.
- Con `REVERON_PARENT=1`, el servidor se apaga solo al detectar que su stdin se
  cerró. Es la segunda defensa contra procesos huérfanos: la primera es el
  `kill` en `RunEvent::Exit`, y esta cubre el caso de que la app muera sin
  poder ejecutar su propio cierre.

### HTTP — UI y clientes externos ↔ servidor

Ya implementado en `main`. Es el contrato entre el frontend y el backend y
**no cambia**:

| Método | Ruta |
| --- | --- |
| `GET` | `/api/health` |
| `GET` | `/api/models` · `/api/projects` · `/api/spend` |
| `GET` `DELETE` `PATCH` | `/api/library/:id` |
| `GET` | `/api/library` |
| `POST` | `/api/generations` · `/api/estimate` · `/api/import` |
| `GET` | `/api/jobs` · `/api/jobs/:id` |
| `GET` | `/api/providers` |
| `PUT` | `/api/providers/:id/key` |
| `POST` | `/api/providers/:id/test` |
| `GET` | `/api/events` *(SSE: `job`, `generation`, `generation.deleted`)* |
| `GET` | `/v1/models` · `POST /v1/images/generations` |
| `GET` | `/files/:id` |

Se agregan, para los requisitos nuevos:

| Método | Ruta | Para |
| --- | --- | --- |
| `POST` | `/api/jobs/:id/resume` · `/api/jobs/:id/discard` | FR-27 |
| `POST` | `/api/queue/pause` · `/api/queue/resume` | FR-28 |
| `GET` | `/api/migration` | FR-12 — conteo detectado |
| `POST` | `/api/migration/run` | FR-13, FR-14 |
| `GET` | `/api/spend/export` | FR-31 — CSV |

Autenticación: sin llave mientras el host sea loopback; con `X-Reveron-API-Key`
en todo `/api` y `/v1` cuando se expone en la red (FR-42). Ya implementado.

### Comandos Tauri — frontend ↔ Rust

Lo único que **no** va por HTTP, porque el servidor Node no puede hacerlo:

```rust
server_status() -> ServerStatus            // puerto, pid, uptime, vivo
server_restart() -> ServerStatus           // FR-45
server_stop() -> ()                        // FR-45
secrets_list() -> Vec<KeyStatus>           // proveedor, presente, sufijo, origen
secrets_set(provider, value) -> KeyStatus  // FR-8, FR-9
secrets_delete(provider) -> ()
agent_detect() -> Vec<AgentInfo>           // FR-33
agent_send(prompt, refs, on_event: Channel<AgentEvent>) -> ()   // FR-35
agent_cancel() -> ()
platform_info() -> PlatformInfo            // so, tecla modificadora — FR-40
reveal_in_files(path) -> ()                // FR-24
pick_directory() / pick_files() -> ...     // FR-19, FR-46
```

`AgentEvent` es un enum serializado con `#[serde(tag = "event", content = "data")]`:
`Chunk { text }`, `ToolCall { name, args }`, `Cost { usd }`, `Done`,
`Error { message }`.

Tras `secrets_set`, Rust escribe el llavero **y** hace `PUT /api/providers/:id/key`
contra el servidor, que ya sabe adoptar una llave sin reiniciarse. No hace falta
reiniciar el sidecar al rotar una llave.

### Empaquetado

```jsonc
// src-tauri/tauri.conf.json
{
  "bundle": {
    "externalBin": ["binaries/node"],          // node-<triple>[.exe]
    "resources": ["../src/**/*", "../dist/ui/**/*"]
  }
}
```

`scripts/fetch-node.mjs` descarga el Node oficial de cada triple a
`src-tauri/binaries/node-<triple>` antes de compilar. No se versiona en git.

## Decisions

- **D1 — Cómo se empaqueta el servidor.** Elegido: **el binario oficial de Node
  se distribuye como sidecar de Tauri, con los `.mjs` como recursos**. Cero
  cambios al servidor: sigue ESM, sigue `node:sqlite`, el CLI sigue andando.
  Rechazado: portar el servidor a Rust — reescribe los 7 proveedores, el
  router, la biblioteca y la cola, y rompe el núcleo compartido con el CLI, por
  meses de trabajo a cambio de ~90 MB de instalador. Rechazado: exigir Node
  instalado — rompe el FR-1 de frente. Rechazado: empaquetado SEA de Node —
  exige CommonJS y el código es ESM con `await` de nivel superior.
- **D2 — Cómo habla la UI con el backend.** Elegido: **HTTP y SSE, el mismo
  contrato que ya existe**. El FR-43 obliga a tener el servidor HTTP igual para
  clientes externos, así que usar IPC de Tauri para los datos significaría
  mantener dos contratos para lo mismo. Rechazado: comandos Tauri para los
  datos. Los comandos quedan sólo para lo que el servidor no puede hacer.
- **D3 — Dónde viven las llaves.** Elegido: **llavero del sistema operativo,
  con `~/.config/reveron/.env` en modo `600` de respaldo** cuando no hay
  servicio de llavero. El respaldo sale gratis porque `secrets.mjs` ya lo lee.
  Rechazado: `tauri-plugin-stronghold` solo — su clave tiene que salir de una
  contraseña que habría que pedir en cada arranque, justo en el punto donde el
  PRD quiere menos fricción. Rechazado: llavero sin respaldo — un Linux sin
  Secret Service quedaría inutilizable.
- **D4 — Cómo llegan las llaves al servidor.** Elegido: **Rust las lee del
  llavero y las inyecta como variables de entorno al lanzar el sidecar**.
  `secrets.mjs` ya trata `process.env` como una de sus fuentes, así que el
  servidor no se entera del cambio. Rechazado: que el servidor lea el llavero —
  obligaría a una dependencia nativa en Node y rompería las cero dependencias.
- **D5 — Qué pasa con la UI existente.** Elegido: **reusar `ui/` y reestilarla**
  con los tokens de Reverón. Se conservan `api.ts`, `sse.ts` y los visores, y
  como el servidor la sigue sirviendo estática, el dashboard en el navegador
  sobrevive sin trabajo extra. Rechazado: UI nueva — tirar código probado.
  Rechazado: dos UIs — el doble de superficie para el mismo producto.
- **D6 — Qué pasa con el paquete npm.** Elegido: **sigue siendo el paquete
  real**; CLI y skill se instalan por npm y comparten `src/` con la app de
  escritorio. Rechazado: convertirlo en cliente delgado o retirarlo — sólo
  tendría sentido si el núcleo se hubiera ido a Rust.
- **D7 — El actualizador.** Elegido: **`tauri-plugin-updater` activo desde la
  v1**, firmado con clave propia generada por `cargo tauri signer generate`.
  Es gratis y es **otra cosa** que la firma de Apple o Microsoft: el A3 del PRD
  descarta el notarizado, no esta firma. Rechazado: v1 sin actualizador — dejaría
  a los primeros usuarios sin forma de recibir arreglos.
- **D8 — Quién puede ejecutar procesos.** Elegido: **nadie desde la webview**.
  El sidecar y el CLI del agente se lanzan desde Rust, detrás de comandos con
  argumentos tipados. La capability no incluye `shell:allow-execute`.
  Rechazado: exponer el plugin de shell al frontend — convertiría cualquier
  inyección en la UI, por ejemplo al renderizar el texto de un prompt, en
  ejecución de comandos arbitrarios.
- **D9 — La barra de título.** Elegido: **`titleBarStyle: "Overlay"` en macOS**,
  que conserva los semáforos nativos superpuestos sobre nuestra barra, y
  **`decorations: false` con controles propios a la derecha en Windows y
  Linux**. Rechazado: controles propios en los tres — reimplementar los
  semáforos de macOS se ve mal y se comporta peor.
- **D10 — Cómo se apaga el sidecar.** Elegido: **doble defensa** — `kill` en
  `RunEvent::Exit` y auto-apagado del servidor al cerrarse su stdin. Rechazado:
  sólo el `kill` — si la app muere sin ejecutar su cierre, queda un servidor
  huérfano con las llaves del usuario en memoria escuchando un puerto.
- **D11 — Cómo se migra la biblioteca.** Elegido: **importar las filas y dejar
  los archivos donde están**. Rechazado: copiar los archivos — duplicaría
  varios gigabytes para no ganar nada, ya que el FR-13 exige conservar el
  origen de todas formas.

## Risks

- **El peso del instalador.** El binario de Node ronda los 110 MB sin
  comprimir; el NFR-12 pide menos de 150 MB. *Mitigación:* los tres formatos
  (`.dmg`, `.msi`, `.AppImage`) comprimen, y F7.2 mide el peso real como
  criterio de aceptación. Si no entra, la salida es recortar el binario de Node,
  no rehacer la arquitectura.
- **Servidores huérfanos.** Un servidor que sobrevive a la app deja un puerto
  abierto con llaves en memoria. *Mitigación:* la doble defensa de D10, más un
  caso de prueba explícito en F1.2 que mata la app a la fuerza y verifica que
  el puerto quedó libre.
- **La primera instalación sin firma.** Gatekeeper y SmartScreen se interponen
  antes de que el usuario vea el producto, y eso golpea justo la métrica de
  activación del PRD. *Mitigación:* F7.3 entrega instrucciones por sistema en la
  página de descarga; el PRD ya lo dejó anotado como Q3 para revisar con datos.
- **Linux es tres sistemas, no uno.** El llavero, el explorador de archivos y
  las dependencias de WebKitGTK varían entre distribuciones. *Mitigación:* el
  respaldo de D3, y declarar una distribución de referencia para la v1 en F7.2.
- **El agente externo es software que no controlamos.** Puede no estar, cambiar
  su salida o colgarse. *Mitigación:* el FR-34 exige que su ausencia no rompa
  nada, `agent_cancel()` corta siempre, y el Chat es la única pantalla que
  depende de él.
- **La cola y el cierre de la app.** La cola vive en el proceso del servidor;
  si muere con trabajos corriendo, el proveedor puede haber cobrado igual.
  *Mitigación:* el estado `interrupted` no afirma que no se cobró, y el FR-27
  pone la decisión de reanudar en el usuario.
- **Reestilar no es repintar.** Las 17 pantallas del diseño contra las 5 que
  existen es mucho más trabajo de UI que de Rust. *Mitigación:* los tokens
  salen en F1.5, antes que cualquier pantalla, para que ninguna se escriba dos
  veces.

## Requirement coverage

| Requisito | Componente(s) |
| --- | --- |
| FR-1 | tauri/shell, tauri/sidecar |
| FR-2 | tauri/sidecar, server |
| FR-3 | tauri/platform, ui |
| FR-4 | ui |
| FR-5 | ui |
| FR-6 | ui, tauri/secrets |
| FR-7 | ui, server |
| FR-8 | tauri/secrets |
| FR-9 | tauri/secrets, `src/utils/secrets.mjs` |
| FR-10 | server *(`POST /api/providers/:id/test`)*, ui |
| FR-11 | core/router, ui |
| FR-12 | library/migrate, server |
| FR-13 | library/migrate |
| FR-14 | library/migrate |
| FR-15 | core/router, ui |
| FR-16 | core/cost-estimator, server *(`/api/estimate`)*, ui |
| FR-17 | server, ui |
| FR-18 | server *(`/api/estimate`)*, ui |
| FR-19 | ui, tauri/shell *(selector de archivos)* |
| FR-20 | library, server *(`/api/library`)*, ui |
| FR-21 | library *(linaje)*, ui |
| FR-22 | ui |
| FR-23 | ui, server |
| FR-24 | tauri/platform |
| FR-25 | server/jobs, ui |
| FR-26 | library *(tabla `jobs`)*, server/jobs |
| FR-27 | server/jobs, library, ui |
| FR-28 | server/jobs, ui |
| FR-29 | server/jobs |
| FR-30 | library, server *(`/api/spend`)*, ui |
| FR-31 | server *(`/api/spend/export`)*, ui |
| FR-32 | core/config, server, ui |
| FR-33 | tauri/agent |
| FR-34 | tauri/agent, ui |
| FR-35 | tauri/agent, server, library |
| FR-36 | tauri/agent, core/cost-estimator, ui |
| FR-37 | tauri/agent, ui |
| FR-38 | tauri/agent, core/config, ui |
| FR-39 | ui |
| FR-40 | tauri/platform, ui |
| FR-41 | ui |
| FR-42 | server *(`isLocalHost` + `apiKey`)*, ui |
| FR-43 | server *(`/v1/*`)*, ui |
| FR-44 | core/config, server, tauri/sidecar *(handshake)* |
| FR-45 | tauri/sidecar, ui |
| FR-46 | core/config, tauri/shell, ui |
| FR-47 | tauri/platform, ui |
| FR-48 | library, server, ui |
| NFR-1 | tauri/shell |
| NFR-2 | *(F7.3 — documentación de instalación; sin componente de código)* |
| NFR-3 | tauri/secrets, providers |
| NFR-4 | tauri/secrets, server, providers |
| NFR-5 | core/config, ui |
| NFR-6 | tauri/sidecar *(handshake con límite de tiempo)*, ui |
| NFR-7 | library *(índices y cursor)*, ui *(listas virtualizadas)* |
| NFR-8 | ui *(`ui/public/fonts/`)* |
| NFR-9 | ui, library |
| NFR-10 | ui |
| NFR-11 | ui |
| NFR-12 | tauri/shell *(configuración del empaquetado)* |
| NFR-13 | tauri/sidecar, ui |

## Work breakdown

> **Antes de `orch atomize`:** las specs del PRD 001 (`specs/f1-biblioteca.md`
> … `specs/f5-providers-spend.md`) tienen que salir de `specs/`, porque este
> plan reusa los identificadores `F1`–`F5` y atomize fusiona por id. Mover a
> `docs/specs-001/` — no borrar: son el registro de lo entregado.

### F1 — La app abre
- **F1.1 — Cáscara de Tauri**: proyecto `src-tauri`, configuración, capability
  mínima, ventana con tamaño mínimo, comandos vacíos. Archivos:
  `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml`, `src-tauri/build.rs`,
  `src-tauri/capabilities/default.json`.
- **F1.2 — Handshake del servidor**: línea JSON al quedar listo, `--port 0`, y
  apagado al cerrarse stdin. Archivos: `src/server/start.mjs`,
  `src/server/cli.mjs`. *No depende de F1.1.*
- **F1.3 — Sidecar**: descarga del Node por triple, empaquetado, spawn en el
  `setup`, lectura del handshake, muerte garantizada, reinicio y estado.
  Archivos: `src-tauri/src/sidecar.rs`, `scripts/fetch-node.mjs`.
  Depende de: F1.1, F1.2.
- **F1.4 — Tokens y tipografías**: variables del diseño, tipografías embebidas,
  tema claro y oscuro, densidad. Archivos: `ui/src/styles/tokens.css`,
  `ui/public/fonts/`, `ui/index.html`. *No depende de F1.1.*
- **F1.5 — Cáscara de la interfaz**: barra de título por plataforma, panel
  lateral con estado del servidor y gasto, enrutado entre pantallas. Archivos:
  `ui/src/components/Titlebar.tsx`, `ui/src/components/Sidebar.tsx`,
  `ui/src/components/Layout.tsx`, `ui/src/App.tsx`,
  `src-tauri/src/platform.rs`. Depende de: F1.4.

### F2 — Primera vez
- **F2.1 — Llavero**: crate `keyring`, respaldo a `.env` modo `600`, comandos
  de listar, guardar, rotar y borrar, inyección al sidecar. Archivos:
  `src-tauri/src/secrets.rs`. Depende de: F1.3.
- **F2.2 — Migración desde Da Vinci**: detección, conteo, importación
  idempotente, rutas HTTP. Archivos: `src/library/migrate.mjs`,
  `src/server/routes/api.mjs`. *No depende de F2.1.*
- **F2.3 — Onboarding**: tres pasos con progreso, una sola llave obligatoria,
  prueba de conexión, cierre con una generación real. Archivos:
  `ui/src/pages/Onboarding/**`. Depende de: F2.1, F2.2.

### F3 — Generar
- **F3.1 — Estudio**: tipos de asset, prompt, modelos sugeridos por el router,
  parámetros. Archivos: `ui/src/pages/Studio/**`. Depende de: F1.5.
- **F3.2 — Barrera de costo**: umbral de confirmación, tope diario, modo de
  sólo estimar, barra de presupuesto. Archivos: `src/core/config.mjs`,
  `src/server/routes/api.mjs`, `ui/src/components/CostGate.tsx`.
- **F3.3 — Referencias**: arrastrar archivos, elegir de la biblioteca, pegar
  URL. Archivos: `ui/src/components/AssetPicker.tsx`,
  `ui/src/components/RefDrop.tsx`. Depende de: F3.1.

### F4 — La biblioteca
- **F4.1 — Galería**: grilla y lista, búsqueda, filtros, estado vacío.
  Archivos: `ui/src/pages/Library/**`. Depende de: F1.5.
- **F4.2 — Detalle y linaje**: visores por tipo, metadatos, derivados, usar
  como referencia. Archivos: `ui/src/pages/Asset/**`,
  `ui/src/components/viewers/**`. Depende de: F1.5.
- **F4.3 — Acciones de archivo**: abrir en el explorador, borrar con
  confirmación. Archivos: `src-tauri/src/platform.rs`,
  `ui/src/components/ConfirmDelete.tsx`. Depende de: F4.1.

### F5 — Conversar
- **F5.1 — Puente del agente**: detección, lanzamiento, transmisión por
  `Channel`, cancelación. Archivos: `src-tauri/src/agent.rs`. Depende de: F1.1.
- **F5.2 — Chat**: hilo, composer con intents, referencias, costo de sesión,
  ausencia del agente. Archivos: `ui/src/pages/Chat/**`. Depende de: F5.1, F3.3.
- **F5.3 — Paleta de comandos**: búsqueda unificada, atajos según el sistema.
  Archivos: `ui/src/components/CommandPalette.tsx`. Depende de: F1.5.

### F6 — Controlar
- **F6.1 — Cola resiliente**: estado `interrupted`, reanudar, descartar,
  pausar, reintento con espera creciente. Archivos: `src/server/jobs.mjs`,
  `src/library/db.mjs`, `src/server/routes/api.mjs`.
- **F6.2 — Actividad**: banner de recuperación, estadísticas, lista con
  errores. Archivos: `ui/src/pages/Activity/**`. Depende de: F6.1.
- **F6.3 — Gastos**: totales, evolución, desglose por modelo, exportación.
  Archivos: `ui/src/pages/Spend/**`, `src/server/routes/api.mjs`.
- **F6.4 — Ajustes**: las siete secciones, incluido servidor y red.
  Archivos: `ui/src/pages/Settings/**`. Depende de: F2.1, F6.1.

### F7 — Distribuir
- **F7.1 — Íconos**: el disco con rayos en los formatos de cada sistema, con
  fondo propio en Windows y Linux. Archivos: `src-tauri/icons/`.
- **F7.2 — Empaquetado**: compilación para los tres sistemas, medición del peso
  contra el NFR-12, integración continua. Archivos: `.github/workflows/`,
  `src-tauri/tauri.conf.json`. Depende de: F1.3.
- **F7.3 — Actualizador y documentación**: clave de firma del actualizador,
  endpoint, instrucciones de instalación sin notarizar, rebrand del README, la
  skill y el paquete. Archivos: `src-tauri/tauri.conf.json`, `README*.md`,
  `docs/SKILL.md`, `package.json`. Depende de: F7.2.
