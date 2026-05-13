# Handoff

## 1. Metadata

- project name: State Workflow Engine
- handoff type: implementation handoff
- created timestamp in UTC: 2026-05-13T07:33:00Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: bootstrap v0.0.1 state-machine core library and visual definition editor, then regularize repo baseline

### Checkpoint Status

- Git HEAD: current HEAD
- Working tree: clean
- Dirty files intentionally in scope: None
- Dirty files intentionally out of scope: None
- Untracked files intentionally in scope: None
- Untracked files intentionally out of scope: None
- Canonical files described:
  - `README.md`
  - `AGENTS.md`
  - `package.json`
  - `src/lib/stateMachine.ts`
  - `src/App.tsx`
  - `docs/plans/State Machine Core Library And Visual Definition Editor.md`
- Last verification:
  - command: `npm run verify`
  - result: passed
  - timestamp UTC: 2026-05-13T07:32:00Z
- Handoff freshness: fresh-to-HEAD
- Safe-to-continue basis: this handoff is committed with the v0.0.1 baseline and describes the committed source checkpoint
- Next checkpoint action: verify before the next commit

## 2. Executive Summary

The project is a TypeScript/Vite/React repo containing a reusable state-machine core and a browser-based visual editor. The core owns only valid states, allowed state-to-state transitions, terminal states, and validation. Workflow behavior remains explicitly out of scope.

The v0.0.1 baseline is complete and safe to continue from after running `npm install` and `npm run verify`.

## 3. Current Objective

Immediate goal: maintain and extend the state-machine definition tooling without mixing workflow semantics into the core.

Intended finished state for this workstream: a committed, standards-compliant bootstrap baseline with clear verification and handoff context.

Definition of done: Git repo initialized, version set to `0.0.1`, baseline files present, verification passing, and all current changes committed.

## 4. Current State

### Working

- Core validation and runtime helpers are implemented in `src/lib/stateMachine.ts`.
- Visual editor supports state IDs, terminal toggles, transition rows, continuous validation, JSON import/export, and read-only graph preview.
- Tests cover core behavior and key editor flows.
- CI workflow is present and runs `npm ci` plus `npm run verify`.

### Partially Working

- The graph is preview-only by design for v0.

### Not Working Yet

- No workflow layer exists yet.
- No direct graph editing exists yet.
- No package publishing or deployment flow exists yet.

### Not Yet Verified

- Browser visual layout was not checked with Playwright because Playwright is not installed. Local HTTP smoke check passed during implementation.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Do not add workflow actions, guards, side effects, authorization, persistence, logging, jobs, retries, or idempotency to the core without a new approved plan.
- Use numbered versions only.
- Treat `package.json` as the version source of truth.
- Run `npm run verify` before committing changes.

## 6. Commands and Verification

```sh
npm install
npm run dev
npm run lint
npm run test
npm run build
npm run verify
```

Latest verified command:

```sh
npm run verify
```

Result: passed. It ran TypeScript checking, 17 Vitest tests, and a Vite production build.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `README.md`: current run, verify, structure, configuration, and versioning notes.
- `src/lib/stateMachine.ts`: reusable state-machine core.
- `src/App.tsx`: editor UI and import/export behavior.
- `docs/plans/State Machine Core Library And Visual Definition Editor.md`: approved PRD behind the current baseline.

## 8. Next Actions

Next:

- Decide whether the next workstream is workflow-layer design, editor usability improvements, or packaging the core as a reusable library artifact.

Blocked:

- None.

Later:

- Add browser-based visual regression or smoke testing if editor UI changes become frequent.
- Add release/publish workflow only when distribution is explicitly requested.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as the hot-context source for current state. Review `AGENTS.md`, `README.md`, `src/lib/stateMachine.ts`, `src/App.tsx`, and the PRD in `docs/plans/State Machine Core Library And Visual Definition Editor.md` before changing code. Preserve the separation between the state-machine core and any future workflow layer. Run `npm run verify` before committing. Load `project-dossier.md` only if broader project history is explicitly needed; it is not required for the current baseline.
