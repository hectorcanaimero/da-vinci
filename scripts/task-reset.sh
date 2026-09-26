#!/usr/bin/env bash
# task-reset.sh <task-id> [author] [note]
#
# Sprint B: forces a task back to `todo` via the active state backend.
# Called by orch during startup reconcile (Issue #7) when a task is stuck in
# "in-progress" but its recorded PID is dead, and by `orch reset` to revert
# tasks explicitly. Backend-aware: routes through `orch task-status`, which
# is the single writer for both file and sqlite backends.
set -euo pipefail

TASK_ID="${1:?task-reset.sh <task-id> [author] [note]}"
AUTHOR="${2:-orch}"
NOTE="${3:-reset}"

PROJECT_ROOT="${PROJECT_ROOT:-.}"

exec orch task-status "$TASK_ID" todo \
    --author "$AUTHOR" \
    --note "$NOTE" \
    --project-root "$PROJECT_ROOT"
