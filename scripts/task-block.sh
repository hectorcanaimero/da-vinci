#!/usr/bin/env bash
# task-block.sh <task-id> "<reason>" "<author>"
#
# Sprint B: shells into `orch task-status <id> blocked` so the active state
# backend (file or sqlite) mediates the transition. Existing argv contract
# is preserved — the third arg is the author label (e.g. "claude/opus").
set -euo pipefail

TASK_ID="${1:?task-block.sh <task-id> \"<reason>\" \"<author>\"}"
REASON="${2:?missing reason}"
AUTHOR="${3:-agent}"

PROJECT_ROOT="${PROJECT_ROOT:-.}"

exec orch task-status "$TASK_ID" blocked \
    --author "$AUTHOR" \
    --note "$REASON" \
    --project-root "$PROJECT_ROOT"
