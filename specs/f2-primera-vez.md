---
type: spec
project_id: da-vinci
phase: 2
version: 0.1
depends_on:
  - docs/arch/002-reveron-desktop.md
consumed_by:
  - orch-atomizer
generated_by: orch-spec
generated_at: 2026-09-28
title: Primera vez
---

# F2 — Primera vez

Lo que pasa entre que el usuario abre Reverón por primera vez y su primera
generación: conectar una llave, traerse la biblioteca vieja si existe, y
terminar habiendo generado algo de verdad.

## F2.1 — Package: llavero

### F2.1.T1 — Llavero del sistema con respaldo a archivo

Implementar `src-tauri/src/secrets.rs` según *Components → tauri/secrets* y la
decisión D3 de `docs/arch/002-reveron-desktop.md`.

Usar el crate `keyring` contra el servicio `reveron`, una entrada por proveedor
nombrada con su variable (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `FAL_API_KEY`,
`KIE_API_KEY`, `HEYGEN_API_KEY`, `ELEVENLABS_API_KEY`, `TRIPO_API_KEY`).

Cuando el llavero no está disponible —típicamente un Linux sin servicio de
secretos— caer a `~/.config/reveron/.env` creado con permisos `600`. El origen
efectivo de cada llave es parte de lo que se reporta (FR-9).

**Ojo con el lado de Node.** `src/utils/dotenv.mjs` hoy **no** busca esa ruta:
su `SEARCH_PATHS` (líneas 16-21) apunta a `~/.config/da-vinci/.env` y
`~/.claude/skills/da-vinci/.env`. Si Rust escribe el respaldo en `reveron` y
nadie toca `dotenv.mjs`, el archivo queda escrito y el servidor no lo lee
nunca. Esta tarea agrega `~/.config/reveron/.env` a `SEARCH_PATHS` **antes**
de las dos rutas de `da-vinci`, que quedan como compatibilidad hacia atrás
hasta el rebrand de F7.3.T2.

Completar los comandos `secrets_list`, `secrets_set` y `secrets_delete` que
`lib.rs` ya tiene registrados. `secrets_list` devuelve por proveedor: si hay
llave, los últimos cuatro caracteres, y de dónde salió. **Nunca devolver la
llave completa al frontend.**

Compilá y corré los tests antes de dar la tarea por hecha: `cargo test` dentro
de `src-tauri/`. Si `cargo` no está en el `PATH`, **no declares la tarea
terminada**: reportá el bloqueo en vez de entregar código sin compilar.

Done when: `cargo test` pasa; guardar, listar y borrar funciona en el llavero
nativo; forzando la ausencia de llavero, lo mismo funciona contra el archivo
con permisos `600`; `searchPaths()` de Node incluye la ruta `reveron`; y ningún
comando expone una llave entera.

- **Model**: claude/opus
- **Estimate**: 4h
- **Reason**: Manejo de credenciales con tres implementaciones de sistema operativo detrás y un camino de respaldo; un error acá filtra llaves.
- **Dependencies**: F1.1.T1
- **Files**:
  - `src-tauri/src/secrets.rs`
  - `src-tauri/Cargo.toml`
  - `src/utils/dotenv.mjs`

### F2.1.T2 — Inyección de llaves al servidor y rotación en caliente

Conectar el llavero con el sidecar según la decisión D4 del arch.

Al lanzar el servidor, `sidecar.rs` pide las llaves a `secrets.rs` y las pasa
como variables de entorno del proceso hijo. `src/utils/secrets.mjs` ya trata
`process.env` como una de sus fuentes, así que el servidor no necesita ningún
cambio.

Para rotar una llave sin reiniciar: después de escribir el llavero,
`secrets_set` hace `PUT /api/providers/:id/key` contra el servidor local, que
ya sabe adoptar una llave en caliente. Sólo si esa llamada falla se reinicia el
sidecar como último recurso.

Done when: arrancando con llaves guardadas, `GET /api/providers` reporta los
proveedores conectados sin que el usuario haya tocado nada; y guardar una llave
nueva desde la app hace que el router empiece a proponer sus modelos sin
reiniciar.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 2.5h
- **Reason**: Pegamento entre dos componentes ya escritos, con un camino de respaldo simple.
- **Dependencies**: F1.3.T3, F2.1.T1
- **Files**:
  - `src-tauri/src/sidecar.rs`

## F2.2 — Package: migración

### F2.2.T1 — Importación idempotente desde Da Vinci

Escribir `src/library/migrate.mjs` según *Data model → Migración desde Da
Vinci* del arch.

Detectar una instalación previa en `~/.davinci` y contar sus registros sin
importar nada (eso alimenta el FR-12). Importar abre la base vieja en sólo
lectura e inserta en la nueva con `INSERT OR IGNORE` sobre la clave primaria,
que es un uuid: de ahí sale la idempotencia del FR-14 sin código extra.

**Los archivos no se copian.** Las filas conservan su `file_path` original
apuntando a `~/.davinci/library/`, así que migrar miles de assets no duplica
gigabytes y el origen queda intacto como exige el FR-13.

Done when: un test de `node --test` arma una base de origen con registros
conocidos, migra, verifica que aparecen en destino con su prompt, modelo y
costo, que los archivos de origen siguen donde estaban, y que correr la
migración por segunda vez deja exactamente el mismo conteo.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Movimiento de datos del usuario; la idempotencia y no perder el origen son la parte que hay que probar.
- **Dependencies**:
- **Files**:
  - `src/library/migrate.mjs`
  - `test/migrate.test.mjs`

### F2.2.T2 — Rutas de migración

Exponer la migración por HTTP: `GET /api/migration` devuelve si se detectó una
instalación previa y cuántos registros tiene; `POST /api/migration/run` la
ejecuta y devuelve cuántos importó. Ambas rutas están declaradas en *Interfaces
→ HTTP* del arch.

Done when: con una instalación de Da Vinci presente, la ruta de consulta
devuelve el conteo real, y la de ejecución importa y responde el número de
registros nuevos; sin instalación previa, la consulta responde que no hay nada
que migrar en vez de fallar.

- **Model**: claude/claude-haiku-4-5
- **Estimate**: 1.5h
- **Reason**: Dos rutas sobre una función ya escrita, siguiendo el patrón del resto del servidor.
- **Dependencies**: F2.2.T1
- **Files**:
  - `src/server/routes/api.mjs`

## F2.3 — Package: onboarding

### F2.3.T1 — Lista de proveedores con prueba de conexión

Construir `ui/src/components/ProviderList.tsx`, el componente compartido que
muestra los siete proveedores con su estado y permite pegar, probar y rotar una
llave. Lo usan tanto el onboarding (F2.3.T2) como Ajustes (F6.4.T1), así que
vive en `components/` y no dentro de una pantalla.

Por proveedor: inicial, nombre, modelos que habilita, campo de llave enmascarado
con los últimos cuatro caracteres visibles, estado —conectado, sin llave, error—
y acción de probar. El estado sale de `GET /api/providers`; la prueba, de
`POST /api/providers/:id/test`; guardar, del comando `secrets_set`.

Done when: pegar una llave válida deja el proveedor en conectado y sus modelos
disponibles en el router; una llave inválida lo deja en error con el mensaje del
proveedor; y en ningún momento se muestra una llave completa.


**Referencia visual:** `docs/design/ajustes-proveedores.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3.5h
- **Reason**: Componente reusado por dos pantallas, con estados de error que tienen que ser claros.
- **Dependencies**: F2.1.T2, F1.5.T2
- **Files**:
  - `ui/src/components/ProviderList.tsx`

### F2.3.T2 — Asistente de tres pasos

Construir el onboarding de `docs/layout.pen`: panel de arte a la izquierda,
asistente a la derecha, tres pasos con progreso visible (agente, llaves,
carpeta).

Dos reglas del PRD que no son negociables y que son el motivo de esta pantalla:

- **Una sola llave alcanza para continuar** (FR-6). El paso de llaves se
  satisface con cualquier proveedor conectado; el texto guía hacia FAL porque
  solo ya cubre imagen, video y SVG. Los otros seis se ofrecen pero no bloquean.
- **El asistente termina con una generación real, no con un formulario
  guardado** (FR-7). El último paso dispara una generación de costo bajo y no
  se considera completo hasta que el asset existe en la biblioteca.

Incluir el aviso de dónde quedaron guardadas las llaves, con el texto ajustado
a lo que realmente pasó según lo que reporte `secrets_list` (llavero o archivo
de respaldo), y el paso de migración cuando `GET /api/migration` detecte una
instalación previa.

Done when: partiendo de cero, conectando sólo una llave, el asistente se
completa y deja un asset generado visible en la galería.


**Referencia visual:** `docs/design/onboarding.png` — comparar contra la
imagen antes de dar la tarea por terminada. Colores y tipografias salen de
`ui/src/styles/tokens.css` por nombre, nunca leidos de la captura.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 4h
- **Reason**: Es la pantalla que decide si el usuario se queda; la lógica es simple pero el recorrido tiene que estar exacto.
- **Dependencies**: F2.3.T1, F2.2.T2
- **Files**:
  - `ui/src/pages/Onboarding/index.tsx`
  - `ui/src/pages/Onboarding/Steps.tsx`
  - `ui/src/pages/Onboarding/ArtPanel.tsx`
