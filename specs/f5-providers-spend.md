---
type: spec
project_id: da-vinci
phase: 5
version: 0.1
depends_on:
  - docs/arch/001-studio.md
consumed_by:
  - orch-atomizer
generated_by: orch-spec
generated_at: 2026-09-25
title: Providers, Spend y lanzamiento
---

# F5 — Providers, Spend y lanzamiento

Las dos pantallas que faltan y la documentación para publicar en npm.
Contratos: docs/arch/001-studio.md, *Interfaces → HTTP*
(`/api/providers*`, `/api/spend`) y *Configuración*. Mismas reglas de UI
que F3.

## F5.1 — Package: Providers

### F5.1.T1 — Pantalla Providers

`ui/src/pages/Providers/`: una tarjeta por proveedor con estado
(conectado / sin key / error, con el mensaje), origen de la key, `keyHint`,
qué tipos cubre (de `/api/models`), botón "Probar conexión" y formulario
"Pegar key" (input `type="password"`, `autocomplete="off"`, se limpia tras
guardar). Aviso fijo de dónde se guardan las keys
(`~/.config/da-vinci/.env`) y de que Infisical, si está configurado, tiene
prioridad.

Done when: `npm run build:ui` pasa y, con el servidor, pegar una key de
prueba cambia el estado sin recargar y la key no aparece en ninguna
respuesta de red (revisar con DevTools o `curl`).

- **Model**: claude/claude-haiku-4-5
- **Estimate**: 2h
- **Reason**: Pantalla simple sobre rutas ya probadas.
- **Dependencies**: F3.1.T2, F2.4.T2
- **Files**:
  - `ui/src/pages/Providers/`

## F5.2 — Package: Spend

### F5.2.T1 — Pantalla Spend

`ui/src/pages/Spend/`: selector de rango (7 d, 30 d, mes actual, custom),
total del rango y del mes actual, barras por día en SVG propio (sin librería
de gráficos; tooltip con valor, eje con montos, accesible con `<title>` y
tabla alternativa), tablas por proveedor y por modelo con conteo y costo,
todo desde `GET /api/spend`. Muestra el tope diario de config si existe y
cuánto queda hoy. Etiqueta visible: "costos estimados según tabla de
precios".

Done when: `npm run build:ui` pasa y con datos de prueba el total del rango
coincide con la suma de costos de `GET /api/library` en ese rango.

- **Model**: claude/claude-sonnet-5
- **Estimate**: 3h
- **Reason**: Gráfico SVG a mano con accesibilidad; estándar.
- **Dependencies**: F3.1.T2
- **Files**:
  - `ui/src/pages/Spend/`

## F5.3 — Package: documentación y release

### F5.3.T1 — README, SKILL y CHANGELOG

Actualizar `README.md` con: instalación `npm i -g da-vinci` + `davinci
serve`, capturas o GIF (dejar placeholders con nombre de archivo en
`docs/examples/` si no hay capturas), las 4 secciones del dashboard, la API
(tabla de rutas nativas y ejemplo con el SDK de OpenAI apuntando a
`http://127.0.0.1:20130/v1`), `config.json`, la biblioteca en `~/.davinci/`,
el subcomando `import`, exponer en la red con `apiKey`, y quitar "Web UI
dashboard" del roadmap. En `SKILL.md` (y copiar idéntico a
`docs/SKILL.md`): que toda generación queda también en la biblioteca global
y que `--refs davinci:<id>` encadena desde ella. En `CHANGELOG.md`, versión
`2.0.0` con los cambios y el breaking change de Node ≥ 22.13. Subir
`version` en `package.json` a `2.0.0`.

Done when: todos los comandos del README corren tal cual (probar los que no
gastan: `--help`, `--dry-run`, `serve --no-open`, `import`), y
`SKILL.md` y `docs/SKILL.md` son idénticos.

- **Model**: claude/claude-haiku-4-5
- **Estimate**: 3h
- **Reason**: Documentación.
- **Dependencies**: F4.1.T2, F4.2.T1, F5.1.T1, F5.2.T1, F2.5.T1
- **Files**:
  - `README.md`
  - `SKILL.md`
  - `docs/SKILL.md`
  - `CHANGELOG.md`
  - `package.json`

### F5.3.T2 — README en portugués

Actualizar `README.pt.md` para que tenga el mismo contenido y estructura
que el `README.md` actualizado en F5.3.T1, traducido al portugués de
Brasil.

Done when: las secciones y bloques de código de `README.pt.md` coinciden uno
a uno con los de `README.md`.

- **Model**: claude/claude-haiku-4-5
- **Estimate**: 1h
- **Reason**: Traducción.
- **Dependencies**: F5.3.T1
- **Files**:
  - `README.pt.md`
