# Deuda: dos paletas peleando en `:root`

> Inventario, no refactor. El objetivo de este documento es que la tarea de
> unificación ya venga con el radio de impacto medido, porque medirlo es el 80%
> del trabajo. Estado del árbol: `main` @ 593a4b2 más el PR #69 (tipografías).

## El problema en una línea

Hay **dos sistemas de tokens vivos al mismo tiempo** y el que gana lo decide la
especificidad de CSS, no una decisión de diseño.

| Archivo | Selector | Especificidad | Paleta |
| --- | --- | --- | --- |
| `ui/src/styles.css` | `:root` | (0,1,0) | Azul vieja — `--bg #0f1115`, `--accent #7c9cff` |
| `ui/src/styles/tokens.css` | `:root[data-theme='dark']` | (0,1,1) | Tierra/hueso del PRD — `--bg-app #12110e`, `--accent #c0693a` |

`styles.css` hace `@import './styles/tokens.css'` en su primera línea y después
redefine `:root`. El orden no importa: para los nombres que existen en los dos
lados gana `tokens.css` por el atributo `[data-theme='dark']`, que está puesto
en `ui/index.html:2`.

**Esto es un equilibrio frágil, no un diseño.** El día que alguien saque o
cambie `data-theme` del `<html>` — que es exactamente lo que va a pasar cuando
se implemente el tema claro, hoy deuda reconocida en el A7 del PRD — las 142
lecturas de `--accent`/`--border`/`--danger` se caen en silencio a la paleta
azul. No rompe el build, no tira un warning: sólo cambia de color.

## Los tres grupos de variables

### Grupo A — definidas en los dos lados (ganan las de `tokens.css`)

`--accent` · `--border` · `--danger` · `--font-mono`

Hoy resuelven bien. Son las más usadas de todo el proyecto:

| Variable | Usos | Archivos |
| --- | --- | --- |
| `--border` | 71 | 29 |
| `--accent` | 42 | 23 |
| `--danger` | 29 | 14 |

Acción: **borrar la definición de `styles.css`**, que es la copia falsa. No hay
que tocar ninguno de los 142 usos.

### Grupo B — sólo en `styles.css`, y alguien las lee

Éstas son las que hacen que no se pueda borrar `styles.css` de una.

| Variable | Valor viejo | Equivalente en `tokens.css` |
| --- | --- | --- |
| `--bg` | `#0f1115` | `--bg-app` `#12110e` |
| `--surface` | `#181b22` | `--bg-surface` `#1a1815` |
| `--text` | `#e7e9ee` | `--text-primary` `#f3eee2` |
| `--muted` | `#8b93a3` | `--text-muted` `#6b6559` |
| `--font-sans` | stack del sistema | `--font-ui` (`Inter`) |
| `--fs-sm` `--fs-md` `--fs-lg` | `0.875/1/1.5rem` | **no existe** |
| `--radius` | `8px` | **no existe** |
| `--sp-1`…`--sp-5` | `0.25`…`2.5rem` | **no existe** |

**Hallazgo importante: `tokens.css` no tiene escala tipográfica, ni radios, ni
escala de espaciado.** Sólo colores y familias. Así que "borrar el `:root` de
`styles.css`" no es una opción hasta decidir dónde viven esos tres grupos. Los
componentes en TSX hoy hardcodean los números a mano (`borderRadius: 10`,
`padding: '9px 16px'`, `fontSize: 13.5`), lo cual es su propia deuda aparte.

### Grupo C — definidas y no usadas por nadie

`--fs-md` · `--fs-lg` · `--sp-5` — cero usos.
`--nav-w` · `--nav-h` — sólo las leen reglas muertas (ver abajo).

Acción: borrar.

## Radio de impacto real: un archivo

Esto es lo que vuelve la tarea chica. Buscando quién lee las variables del
Grupo B en todo `ui/src`, el resultado es **un solo archivo**:

```
ui/src/pages/Providers/providers.css
```

Usa `--bg` (2), `--surface` (1), `--text` (3), `--muted` (1), `--font-sans` (1),
`--radius` (3), `--fs-sm` (6), `--sp-1` (1), `--sp-2` (10), `--sp-3` (7),
`--sp-4` (2). Todo el resto de la app ya usa los nombres de `tokens.css`
(`--bg-surface`, `--text-primary`, `--text-muted`, etc.).

El otro consumidor es `styles.css` mismo, en la regla `body`.

## Bug visible que sale de acá

```css
body { background: var(--bg); color: var(--text); font: … var(--font-sans); }
```

`--bg` sólo existe en `styles.css`, así que **el fondo real de la aplicación es
`#0f1115` (azul-negro) y no el `#12110e` (marrón-negro) que pide el PRD**. Sobre
ese fondo azul están apoyadas las superficies cálidas de `tokens.css`. Es la
razón concreta de que la app se vea despareja: no es percepción, son dos
temperaturas de color superpuestas.

## CSS muerto en `styles.css`

Las clases `.layout`, `.nav`, `.brand`, `.main` y toda la media query de
`max-width: 720px` tienen **cero usos** en el código: no aparece ningún
`className` que las mencione. La barra lateral se reescribió con estilos inline
en `ui/src/components/Sidebar.tsx`. Son ~30 de las ~61 líneas del archivo.

## Orden sugerido para la unificación

1. **Decidir dónde viven espaciado, radios y escala tipográfica.** Es la única
   decisión de diseño real del lote; lo demás es mecánico. Lo natural es
   moverlos a `tokens.css` fuera del bloque `[data-theme]`, porque no dependen
   del tema.
2. **Migrar `providers.css`** a los nombres de `tokens.css`. Un archivo, ~37
   reemplazos, según la tabla del Grupo B.
3. **Arreglar `body`** para que use `--bg-app`, `--text-primary` y `--font-ui`.
4. **Borrar** el `:root` de `styles.css` y las reglas muertas del punto
   anterior. Lo que queda del archivo es el `@import`, el `box-sizing`, `body` y
   el `h1`.

Después del paso 4 no queda ningún nombre de token duplicado, y sacar
`data-theme` del `<html>` deja de ser un cambio de colores sorpresa.

## Cómo se verifica que no quedó nada duplicado

Comparar los dos conjuntos de nombres definidos y pedir que la intersección sea
vacía:

```sh
rg -o '^\s+(--[a-z-]+):' -r '$1' ui/src/styles.css        | sort -u > /tmp/a
rg -o '^\s+(--[a-z-]+):' -r '$1' ui/src/styles/tokens.css | sort -u > /tmp/b
comm -12 /tmp/a /tmp/b   # tiene que salir vacío
```

Y que no quede ninguna lectura de un nombre viejo:

```sh
rg 'var\(--(bg|surface|text|muted|font-sans|radius|sp-[1-5]|fs-(sm|md|lg)|nav-[wh])\)' ui/src
```
