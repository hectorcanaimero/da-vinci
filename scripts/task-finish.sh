#!/usr/bin/env bash
# task-finish.sh <task-id> "<summary>" "<author>"
#
# Sprint B: shells into `orch task-status <id> done` so the active state
# backend (file or sqlite) mediates the transition. Existing argv contract
# is preserved — the third arg is the author label (e.g. "claude/opus").
set -euo pipefail

TASK_ID="${1:?task-finish.sh <task-id> \"<summary>\" \"<author>\"}"
SUMMARY="${2:?missing summary}"
AUTHOR="${3:-agent}"

PROJECT_ROOT="${PROJECT_ROOT:-.}"

exec orch task-status "$TASK_ID" done \
    --author "$AUTHOR" \
    --note "$SUMMARY" \
    --project-root "$PROJECT_ROOT"
