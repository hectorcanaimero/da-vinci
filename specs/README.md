# specs/

Write your work specs here as markdown. The `orch atomize` command parses these
into `tasks.json` entries the orchestrator can dispatch.

## Two ways to fill `tasks.json`

**Manual** — edit `tasks.json` directly. Fine for small projects (< 20 tasks).

**Atomizer** — write specs here as markdown and run:

```bash
# Preview the diff (dry-run — nothing written)
orch atomize --file specs/f0-foundation.md

# Apply — writes tasks.json + creates tasks.json.bak-<ts>
orch atomize --file specs/f0-foundation.md --apply
```

Idempotent: re-running `--apply` only adds new task IDs; existing tasks
aren't touched.

## Minimum spec format

Three header levels: **phase → package → task**.

```markdown
# F0 — Foundation

## F0.1 — Package: scaffolding

### F0.1.T1 — Setup monorepo

- **Modelo**: opencode-go/glm-5.1
- **Estimación**: 1h
- **Razón**: Cheap boilerplate.
- **Dependencies**:
- **Files**:
  - `package.json`
  - `tsconfig.base.json`

### F0.1.T2 — Root README

- **Modelo**: opencode-go/claude-haiku-4-5
- **Estimación**: 0.5h
- **Razón**: Short docs task.
- **Dependencies**: F0.1.T1
- **Files**:
  - `README.md`
```

Task IDs are the header suffix (`F0.1.T1`, `F0.1.T2`). Dependencies reference
those ids. Everything after `— ` is the task title.

## Fields

| Label ES | Label EN | Destination | Required |
|---|---|---|---|
| `Modelo` | `Model` | `model` | yes — must exist in `model_router.yaml` |
| `Estimación` | `Estimate` | `estimateHours` | yes — accepts `8h`, `1.5h`, `30m`, `2d` |
| `Razón` | `Reason` | `reason` | recommended — one-liner justifying the model choice |
| `Dependencies` | `Deps` | `dependencies` | optional — comma or semicolon separated |
| `Files` | `Archivos` | `files` | recommended — for concurrency + strict-files enforcement |

Full format reference:
<https://github.com/hectorcanaimero/orch/blob/main/docs/SPEC-FORMAT.md>

## Spec-Driven Development (optional)

If you use Claude Code + the SDD skills, the recommended flow is:

1. `/sdd-explore <topic>` — investigate the requirement
2. `/sdd-propose` — write a change proposal
3. `/sdd-spec` — behavioral requirements (FR/NFR)
4. `/sdd-design` — technical design
5. `/sdd-tasks` — task breakdown → drop it here as `specs/<change>.md`
6. `orch atomize --file specs/<change>.md --apply`
7. `orch run --mode auto`

The `orch init --sdd` flag scaffolds the `openspec/` layout SDD uses.
