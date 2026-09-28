---
type: spec
project_id: da-vinci
phase: 7
version: 0.1
depends_on:
  - docs/arch/002-reveron-desktop.md
consumed_by:
  - orch-atomizer
generated_by: orch-spec
generated_at: 2026-09-28
title: Distribuir
---

# F7 — Distribuir

Convertir el proyecto en tres archivos que alguien pueda bajar y abrir. Es la
fase donde el A3 del PRD —salir sin firmar— se paga en fricción, así que la
documentación de instalación no es un extra: es parte del producto.

## F7.1 — Package: íconos

### F7.1.T1 — Ícono de aplicación por plataforma

Generar los íconos desde el concepto elegido en el tablero de identidad de
`docs/layout.pen`: `01 · Luz`, el disco con rayos.

El diseño lo entrega **sin fondo**, asumiendo que macOS le aplica el squircle.
Windows y Linux no hacen eso, y ese es exactamente el hueco que la Q4 del PRD
dejó abierto: hay que producir la variante con fondo propio para esas dos
plataformas, usando la paleta de la marca —hueso sobre tinta, o sepia sobre
tinta— sin degradés, según las reglas del ícono del propio tablero.

Producir los formatos que cada sistema espera: `.icns` para macOS, `.ico`
multi-resolución para Windows, y PNG de 32 a 1024 para Linux y el empaquetado.
Verificar que se lee a 16 px, que es el criterio con el que el diseño eligió
este concepto sobre los otros dos.

Done when: `cargo tauri build` toma los íconos sin advertencias, la app muestra
el suyo en el Dock, la barra de tareas y el lanzador de cada sistema, y a 16 px
la forma sigue siendo reconocible.


**Referencia visual:** `docs/design/board-identidad.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 2.5h
- **Reason**: Producción de assets con una decisión de diseño pendiente que hay que resolver para dos plataformas.
- **Dependencies**:
- **Files**:
  - `src-tauri/icons/`
  - `scripts/make-icons.mjs`

## F7.2 — Package: empaquetado

### F7.2.T1 — Compilación para los tres sistemas e integración continua

Armar el flujo que produce los instaladores: `.dmg` para macOS en sus dos
arquitecturas, `.msi` para Windows y `.AppImage` para Linux.

El flujo tiene que correr `scripts/fetch-node.mjs` para el triple que
corresponda antes de compilar, construir la interfaz, y empaquetar. En
integración continua, una matriz por sistema operativo.

**Medir el peso del resultado y fallar si supera los 150 MB.** El NFR-12 es un
límite, no una aspiración, y el riesgo declarado en el arch es justo este: el
binario de Node ronda los 110 MB sin comprimir. Si no entra, la salida es
recortar el binario de Node, no rehacer la arquitectura.

Declarar en la documentación la distribución de Linux de referencia para la v1,
porque las dependencias de WebKitGTK varían entre distribuciones.

Done when: el flujo produce los cuatro artefactos, cada uno abre en su sistema,
y la verificación de peso está automatizada y pasa.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Integración continua con matriz de sistemas operativos y una verificación de peso que puede obligar a ajustar el empaquetado.
- **Dependencies**: F1.3.T2, F7.1.T1
- **Files**:
  - `.github/workflows/release.yml`
  - `src-tauri/tauri.conf.json`

## F7.3 — Package: actualizador y documentación

### F7.3.T1 — Actualizador firmado

Activar `tauri-plugin-updater` con clave propia generada por
`cargo tauri signer generate`, según la decisión D7 del arch.

Esta firma es **gratis y distinta** del notarizado de Apple y del certificado de
Windows: el A3 del PRD descarta lo segundo, no esto. La clave privada nunca va
al repositorio; viaja como secreto de integración continua. El endpoint de
actualización tiene que ser HTTPS — el actualizador rechaza cualquier otra cosa.

Publicar el archivo de manifiesto con el formato que el actualizador espera, y
sumar al flujo de F7.2.T1 la generación de las firmas de cada artefacto.

Done when: una versión instalada detecta una versión nueva publicada en el
endpoint, la descarga verificando la firma, y se actualiza; y un artefacto con
firma alterada es rechazado.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Configuración con un camino conocido, pero la verificación de firma tiene que probarse de verdad, incluido el caso negativo.
- **Dependencies**: F7.2.T1
- **Files**:
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
  - `.github/workflows/release.yml`

### F7.3.T2 — Rebrand y documentación de instalación

Cerrar el rebrand total a Reverón que fija el A1 del PRD y escribir lo que el
A3 obliga a explicar.

El rebrand alcanza al nombre del paquete, el ejecutable del CLI, la skill, los
archivos de README en sus tres idiomas y el registro de cambios. Da Vinci queda
como nombre histórico; la única referencia que sobrevive es la migración de la
biblioteca vieja.

La documentación de instalación es la parte que importa: **por cada sistema
operativo, cómo autorizar una app sin notarizar.** Gatekeeper en macOS,
SmartScreen en Windows, permisos de ejecución en Linux. Con capturas o con los
pasos exactos, no con un enlace a documentación ajena. El usuario se encuentra
con esto antes de ver el producto, y es lo que la Q3 del PRD dejó anotado para
revisar con datos de la primera descarga.

Done when: ningún archivo del proyecto presenta el producto como Da Vinci salvo
donde se habla de la migración, y la página de descarga explica los tres
caminos de autorización con sus pasos.

- **Model**: claude/claude-haiku-4-5
- **Estimate**: 3h
- **Reason**: Renombrado mecánico y redacción de instrucciones; no hay decisiones de diseño pendientes.
- **Dependencies**: F7.3.T1
- **Files**:
  - `README.md`
  - `README.pt.md`
  - `README.es.md`
  - `docs/SKILL.md`
  - `package.json`
  - `CHANGELOG.md`
