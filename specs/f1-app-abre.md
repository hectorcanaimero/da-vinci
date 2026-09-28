---
type: spec
project_id: da-vinci
phase: 1
version: 0.1
depends_on:
  - docs/arch/002-reveron-desktop.md
consumed_by:
  - orch-atomizer
generated_by: orch-spec
generated_at: 2026-09-28
title: La app abre
---

# F1 — La app abre

La cáscara de escritorio: una ventana nativa que arranca el servidor Node que
ya existe, espera su handshake y carga la interfaz contra él. Al terminar esta
fase, un usuario abre Reverón en macOS, Windows o Linux, ve el panel lateral
con el servidor vivo y navega entre pantallas vacías. Nada genera todavía.

## F1.1 — Package: cáscara de Tauri

### F1.1.T1 — Proyecto src-tauri, ventana y superficie de comandos

Crear el proyecto Tauri v2 en `src-tauri/` según la sección *Components →
tauri/shell* de `docs/arch/002-reveron-desktop.md`.

`main.rs` es un pasamanos de tres líneas que llama a `app_lib::run()`. Toda la
lógica va en `lib.rs` con `#[cfg_attr(mobile, tauri::mobile_entry_point)]` sobre
`pub fn run()`. El `Cargo.toml` lleva la sección `[lib]` con
`crate-type = ["staticlib", "cdylib", "rlib"]`.

Configurar en `tauri.conf.json`: `build.devUrl` apuntando al servidor de
desarrollo de Vite, `build.frontendDist` a `../dist/ui`, ventana con tamaño
mínimo de 1024×700 (NFR del FR-4), y el empaquetado con `externalBin` y
`resources` como los fija la sección *Interfaces → Empaquetado*.

**Lo más importante de esta tarea**: `lib.rs` tiene que declarar desde ya los
cuatro módulos (`sidecar`, `secrets`, `agent`, `platform`), crear sus archivos
vacíos, y registrar en `tauri::generate_handler![]` **todos** los comandos que
lista la sección *Interfaces → Comandos Tauri*, cada uno como un stub que
devuelve `Err("no implementado")`. Las tareas posteriores editan sólo su propio
módulo y nunca vuelven a tocar `lib.rs`; si los comandos no quedan registrados
acá, cada tarea siguiente colisiona con las demás en el mismo archivo.

La capability `default.json` arranca con `core:default` y nada más. **No
incluir `shell:allow-execute`** — la decisión D8 del arch prohíbe que la webview
ejecute procesos.

Done when: `cargo build` compila, `npx tauri info` reporta Tauri v2, la ventana
abre con el tamaño mínimo respetado, y llamar a cualquier comando desde la
consola del webview devuelve el error de no implementado en vez de "command not
found".

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Configuración y andamiaje con patrones conocidos, pero la superficie de comandos tiene que quedar exacta porque toda la fase cuelga de ella.
- **Dependencies**:
- **Files**:
  - `src-tauri/Cargo.toml`
  - `src-tauri/build.rs`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/capabilities/default.json`
  - `src-tauri/src/main.rs`
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/sidecar.rs`
  - `src-tauri/src/secrets.rs`
  - `src-tauri/src/agent.rs`
  - `src-tauri/src/platform.rs`
  - `.gitignore`

## F1.2 — Package: handshake del servidor

### F1.2.T1 — Handshake, puerto dinámico y apagado por stdin

Modificar el arranque del servidor Node para que cumpla el contrato de la
sección *Interfaces → Sidecar ↔ servidor Node* de
`docs/arch/002-reveron-desktop.md`.

Tres cambios sobre `src/server/start.mjs`, más un punto de entrada
`src/server/cli.mjs` que el sidecar invoca directo:

1. Al quedar escuchando, imprimir en stdout **una sola línea** de JSON
   `{"event":"ready","port":<n>,"url":"http://127.0.0.1:<n>"}` y nada antes de
   ella. Hoy imprime texto en castellano; ese texto pasa a stderr.
2. Aceptar `--port 0` para pedir un puerto libre al sistema. El puerto real
   sale del handshake, que es de donde el sidecar lo lee (FR-44).
3. Con la variable de entorno `REVERON_PARENT=1`, registrar un manejador sobre
   `process.stdin` que cierre el servidor cuando stdin se cierre. Es la segunda
   defensa de la decisión D10 contra servidores huérfanos.

No cambiar nada más del servidor: las rutas, la cola y la autenticación quedan
como están.

Done when: un test de `node --test` arranca el servidor con `--port 0`, parsea
la primera línea de stdout como JSON, verifica que el puerto anunciado responde
`GET /api/health`, cierra stdin y comprueba que el proceso termina solo.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Cambio acotado sobre código existente, pero es el contrato del que depende todo el arranque de la app.
- **Dependencies**:
- **Files**:
  - `src/server/start.mjs`
  - `src/server/cli.mjs`
  - `test/server-handshake.test.mjs`

## F1.3 — Package: sidecar

### F1.3.T1 — Descarga del binario de Node por plataforma

Escribir `scripts/fetch-node.mjs`: descarga el binario oficial de Node para el
triple que se le pida y lo deja en `src-tauri/binaries/node-<triple>` (con
`.exe` en Windows), que es el nombre que exige la convención de `externalBin`
de Tauri.

Triples a soportar: `aarch64-apple-darwin`, `x86_64-apple-darwin`,
`x86_64-pc-windows-msvc`, `x86_64-unknown-linux-gnu`.

La versión de Node se fija en una constante del script y tiene que ser ≥22.13,
porque el servidor usa `node:sqlite`. Verificar la descarga contra el
`SHASUMS256.txt` que publica Node; una descarga que no valida aborta sin dejar
el archivo a medias. Si el binario ya está y su hash coincide, no re-descargar.
`src-tauri/binaries/` va al `.gitignore`.

Done when: `node scripts/fetch-node.mjs --target aarch64-apple-darwin` deja un
binario ejecutable cuyo `--version` reporta la versión esperada, y correrlo dos
veces seguidas no vuelve a descargar.

- **Model**: claude/claude-haiku-4-5
- **Estimate**: 2h
- **Reason**: Script mecánico de descarga y verificación de hash, sin decisiones de diseño.
- **Dependencies**:
- **Files**:
  - `scripts/fetch-node.mjs`
  - `src-tauri/binaries/.gitkeep`

### F1.3.T2 — Arranque del sidecar y muerte garantizada

Implementar `src-tauri/src/sidecar.rs` según *Components → tauri/sidecar* y
*Interfaces → Sidecar ↔ servidor Node* del arch.

En el `setup` de la app: resolver el binario de Node empaquetado y el directorio
de recursos con `app.path()`, lanzar `node <recursos>/src/server/cli.mjs
--port 0 --host 127.0.0.1` con `DAVINCI_HOME` apuntando a `~/.reveron` y
`REVERON_PARENT=1`, leer la línea de handshake de stdout y quedarse con el
puerto. Si no llega en 10 segundos, el arranque falla con un error que la
interfaz pueda mostrar (NFR-13: un fallo del servidor no cierra la app).

El proceso se lanza **desde Rust**, no desde la webview: la decisión D8 prohíbe
darle permiso de shell al frontend, así que acá no se usa el plugin de shell
expuesto sino el spawn del lado de Rust.

La muerte del sidecar es la primera defensa de D10: matar el proceso en
`RunEvent::Exit`. La segunda ya la trae F1.2.T1 por stdin.

Done when: la app abre y el webview carga contra el puerto que anunció el
handshake; y matando la app a la fuerza (`kill -9` al proceso padre) no queda
ningún proceso escuchando ese puerto — verificado en un test de integración o,
si no es automatizable en CI, documentado como comprobación manual en el propio
archivo con el comando exacto.

- **Model**: claude/opus
- **Estimate**: 4h
- **Reason**: Ciclo de vida de procesos entre dos runtimes; un error acá deja servidores huérfanos con las llaves del usuario en memoria.
- **Dependencies**: F1.1.T1, F1.2.T1, F1.3.T1
- **Files**:
  - `src-tauri/src/sidecar.rs`

### F1.3.T3 — Estado, reinicio y detención del servidor

Completar en `src-tauri/src/sidecar.rs` los tres comandos que `lib.rs` ya tiene
registrados: `server_status`, `server_restart` y `server_stop` (FR-45).

`server_status` devuelve puerto, pid, si está vivo y hace cuánto arrancó — es
lo que el panel lateral muestra permanentemente (FR-5). `server_restart` mata y
vuelve a lanzar reusando el arranque de F1.3.T2. `server_stop` lo deja detenido
y el estado pasa a caído sin cerrar la app.

Done when: los tres comandos responden desde el webview, reiniciar deja un
puerto funcional otra vez, y detener deja `server_status` reportando caído con
la app todavía abierta y navegable.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 2.5h
- **Reason**: Extiende el ciclo de vida que ya dejó resuelto la tarea anterior.
- **Dependencies**: F1.3.T2
- **Files**:
  - `src-tauri/src/sidecar.rs`

## F1.4 — Package: sistema visual

### F1.4.T1 — Tokens del diseño y tipografías embebidas

Llevar el sistema visual de `docs/layout.pen` a CSS. Los valores exactos están
en las variables del archivo de diseño y son estos:

Fondos `#12110E` (app), `#1A1815` (superficie), `#232019` (elevado), `#0E0D0B`
(campos). Bordes `#302B23` y `#221F1A`. Texto `#F3EEE2` (primario), `#A49D8F`
(secundario), `#6B6559` (apagado). Acento `#C0693A` y `#3A2318`. Hueso
`#E6DBC2`. Estados: `#7E9E6A` ok, `#D2A44B` advertencia, `#C0553F` peligro.

Tipografías: Fraunces para títulos y la marca, Inter para toda la interfaz,
JetBrains Mono para datos (rutas, modelos, costos, identificadores).

Las tres se descargan y se sirven desde `ui/public/fonts/` con `@font-face`:
el NFR-8 prohíbe pedirle recursos a ningún servidor externo para renderizar.
Incluir sólo los pesos que el diseño usa, en `woff2`.

Definir los tokens en `:root` y dejar preparado el atributo de tema en el
elemento raíz, aunque sólo el tema oscuro tenga valores por ahora — el A7 del
PRD reconoce que los otros dos son deuda de diseño.

Done when: una página de prueba muestra las tres tipografías cargadas desde
disco sin ninguna petición externa (verificable en la pestaña de red del
inspector), y cada token está definido una sola vez y referenciado por nombre.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Trabajo de CSS con valores ya fijados, pero es la base que todas las pantallas reusan.
- **Dependencies**:
- **Files**:
  - `ui/src/styles/tokens.css`
  - `ui/src/styles.css`
  - `ui/index.html`
  - `ui/public/fonts/.gitkeep`

## F1.5 — Package: cáscara de la interfaz

### F1.5.T1 — Barra de título por plataforma

Implementar la barra de título que pide el FR-3 siguiendo la decisión D9 del
arch: en macOS `titleBarStyle: "Overlay"` para conservar los semáforos nativos
superpuestos sobre nuestra barra; en Windows y Linux `decorations: false` con
controles propios de minimizar, maximizar y cerrar **a la derecha**.

Del lado de Rust, `platform.rs` implementa `platform_info()`, que devuelve el
sistema operativo y el nombre de la tecla modificadora que la interfaz muestra
—`⌘` en macOS, `Ctrl` en el resto— porque el FR-40 lo exige en toda la app.

La barra tiene 38 px de alto, arrastra la ventana y muestra el título centrado,
como en `docs/layout.pen`.

Done when: la app abre en los tres sistemas con los controles en el lado que
corresponde, arrastrar la barra mueve la ventana, y `platform_info()` devuelve
el modificador correcto.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3.5h
- **Reason**: Diferencias reales entre sistemas operativos que hay que probar en los tres.
- **Dependencies**: F1.1.T1, F1.4.T1
- **Files**:
  - `ui/src/components/Titlebar.tsx`
  - `src-tauri/src/platform.rs`

### F1.5.T2 — Panel lateral y enrutado entre pantallas

Construir el panel lateral de 240 px que define `docs/layout.pen` y el enrutado
entre las seis pantallas principales.

El panel lleva la marca, la navegación de seis destinos (Chat, Estudio,
Galería, Actividad, Gastos, Ajustes) con contadores y avisos, el bloque de
estado de proveedores, y al pie la fila del servidor: indicador de vivo,
dirección, y gasto del día contra el tope. Esa fila cumple el FR-5 y tiene que
verse en **todas** las pantallas, así que vive en el layout y no en cada una.

El estado del servidor sale de `server_status` (F1.3.T3); el gasto, de
`GET /api/spend` que ya existe. Cada destino renderiza por ahora un marcador de
posición con su título.

Reusar el enrutado de react-router que `ui/src/App.tsx` ya tiene; no agregar
dependencias nuevas.

Done when: las seis pantallas son alcanzables, el pie del panel muestra estado
real del servidor y gasto real, y a 1024 px de ancho no hay barrido horizontal
(FR-4).

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Layout que todas las pantallas heredan; el pie con estado en vivo tiene que quedar bien una sola vez.
- **Dependencies**: F1.3.T3, F1.4.T1
- **Files**:
  - `ui/src/components/Sidebar.tsx`
  - `ui/src/components/Layout.tsx`
  - `ui/src/App.tsx`
