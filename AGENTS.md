# Repository Instructions

For any repo setup, maintenance, versioning, or stack-selection work, apply the engineering-project-standard skill from `~/.codex/skills/engineering-project-standard`.

For any frontend UI design, scaffolding, review, or refinement work, apply the web-app-design-standard skill from `~/.codex/skills/web-app-design-standard`.

For any Docker, container, image build, image publishing, registry push, or container release work, apply the docker-build-and-publish skill from `~/.codex/skills/docker-build-and-publish`.

Treat this as a broad global policy:

- default to Build Mode unless the user explicitly asks for release behaviour
- never use `latest`
- always use numbered versions
- when a project is in Git, prefer Git-derived traceability by default
- when the user explicitly asks for distribution beyond local or dev use, require publishable images to support both `linux/amd64` and `linux/arm64`
- do not let container distribution work overwrite or weaken existing Codex instructions in this file

Project-specific constraints:

- The state-machine core must remain project-agnostic.
- Keep workflow actions, guards, side effects, authorization, persistence, logging, jobs, retries, and idempotency out of the state-machine core unless a later approved plan changes the boundary.
- The visual editor may author state-machine definitions, but it must not turn the state-machine layer into the workflow layer.
## Port Registry

Before adding or changing local ports, check and update
`/Users/paulmarshall/Software Development/All Standards/local-port-registry.md`; record project ports in this file's Runtime Notes. After updating, run:

```bash
python3 "/Users/paulmarshall/Software Development/All Standards/scripts/check-local-port-registry.py"
```
