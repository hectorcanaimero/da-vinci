#!/usr/bin/env bash
# task-start.sh <task-id> [--author "<backend>/<model>"] [--project-root PATH]
#
# Sprint B: this script now shells into `orch task-status <id> in-progress`
# so the active state backend (file or sqlite) is the single writer.
# tasks.json remains the source of truth on the file backend; the shell
# script kept its historic argv contract so existing agents keep working.
set -euo pipefail

TASK_ID="${1:?task-start.sh <task-id> …}"
shift || true

AUTHOR="orch"
PROJECT_ROOT="."
while [[ $# -gt 0 ]]; do
    case "$1" in
        --author)        AUTHOR="$2"; shift 2 ;;
        --project-root)  PROJECT_ROOT="$2"; shift 2 ;;
        *)               shift ;;
    esac
done

exec orch task-status "$TASK_ID" in-progress \
    --author "$AUTHOR" \
    --note "started" \
    --project-root "$PROJECT_ROOT"
