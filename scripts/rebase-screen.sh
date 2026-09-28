#!/usr/bin/env bash
# Rebasa la rama de una tarea de pantalla sobre main resolviendo ui/src/App.tsx.
#
# Por qué existe: cada tarea que agrega una pantalla registra su ruta en
# App.tsx, y su worktree salió de un main anterior. El rebase automático
# conserva el bloque de rutas de ESA base, así que revierte las pantallas que
# se mergearon mientras tanto. Ya pasó con Estudio, Galería, Detalle y
# Actividad.
#
# Esto toma App.tsx de main (que tiene todas las rutas ya mergeadas) y le
# agrega sólo el import y la ruta de la tarea nueva.
#
#   scripts/rebase-screen.sh F6.3.T2 Spend gastos
#
set -euo pipefail

TASK="${1:?falta el id de la tarea, ej: F6.3.T2}"
COMPONENT="${2:?falta el nombre del componente, ej: Spend}"
ROUTE="${3:?falta la ruta, ej: gastos}"
APP=ui/src/App.tsx

git fetch -q origin
git checkout -q -B "reb/$TASK" "origin/orch/$TASK"

if git rebase origin/main >/dev/null 2>&1; then
  echo "rebase limpio, App.tsx no hizo falta tocarlo"
else
  conflicts=$(git diff --name-only --diff-filter=U)
  if [ "$conflicts" != "$APP" ]; then
    echo "conflicto fuera de App.tsx, se resuelve a mano:"
    echo "$conflicts"
    git rebase --abort
    exit 1
  fi
  git checkout origin/main -- "$APP"
  # El import va alfabético entre los de ./pages/.
  sd "^import ${COMPONENT} from './pages/${COMPONENT}';\n" '' "$APP" 2>/dev/null || true
  sd "(import \{ Route, Routes \} from 'react-router-dom';)" \
     "\$1\nimport ${COMPONENT} from './pages/${COMPONENT}';" "$APP"
  sd "<Route path=\"${ROUTE}\" element=\{<Placeholder title=\"[^\"]+\" />\} />" \
     "<Route path=\"${ROUTE}\" element={<${COMPONENT} />} />" "$APP"
  grep -q "<${COMPONENT} />" "$APP" || { echo "no se pudo insertar la ruta ${ROUTE}"; exit 1; }
  git add "$APP"
  GIT_EDITOR=true git rebase --continue >/dev/null
  echo "App.tsx resuelto: main + ruta ${ROUTE} -> ${COMPONENT}"
fi

npm --prefix ui run build >/dev/null 2>&1 || { echo "FALLA el typecheck de la UI"; exit 1; }
git push -q --force-with-lease origin "reb/$TASK:orch/$TASK"
echo "$TASK empujada"
