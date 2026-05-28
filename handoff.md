# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: implementation handoff
- created timestamp in UTC: 2026-05-28T04:19:16Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: bumped the private project checkpoint from `1.0.6` to `1.0.7`, verified the app, and prepared a committed handoff for the clean checkpoint.

### Checkpoint Status

- Git HEAD: current HEAD
- Working tree: clean
- Dirty files intentionally in scope:
  - None
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - None
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `package.json`
  - `package-lock.json`
  - `README.md`
  - `src/App.test.tsx`
  - `handoff.md`
- Last verification:
  - command: `npm run verify`
  - result: passed
  - timestamp UTC: 2026-05-28T04:19Z
- Handoff freshness: fresh-to-HEAD
- Safe-to-continue basis: the checkpoint is committed on `main`, the package version mirrors are `1.0.7`, `npm run verify` passed, and the handoff freshness verifier passes against the committed clean tree.
- Next checkpoint action: verify before the next code or documentation change.

## 2. Executive Summary

The current checkpoint is a private `1.0.7` project version bump for the State Workflow Editor. The prior scheduler/lifecycle-hook implementation is already committed at the parent checkpoint, and this handoff now reflects the clean committed `1.0.7` state.

Complete now:

- `package.json` and `package-lock.json` use app version `1.0.7`.
- `README.md` reports `Version: 1.0.7` and private `1.0.7` project checkpoint status.
- The app-level test expectation for the visible version badge is updated to `v1.0.7`.
- `npm run verify` passed after the bump.
- No AppLauncher manifest was generated or installed in this checkpoint; the user requested only version bump, commit, and handoff refresh.

Incomplete now:

- No target app normalizer has been updated for workflow schema `0.6.0`.
- No new AppLauncher manifest exists for `1.0.7`.

No `project-dossier.md` exists or was needed; broader durable context remains in the repo docs.

## 3. Current Objective

Immediate goal: continue from the clean committed `1.0.7` checkpoint.

Intended finished state: future sessions can trust the repo version, README, tests, and handoff as matching the committed checkpoint.

Definition of done: before the next checkpoint, make the requested code or doc change, run `npm run verify`, refresh `handoff.md` if continuity state changes, and commit intentionally.

## 4. Current State

### Working

- State-machine core remains project-agnostic.
- Workflow schema remains `0.6.0`.
- Lifecycle hook schedule and retry metadata authoring remains in the editor layer only.
- Browser-local Library persistence remains separate from exported JSON contracts.
- App version display comes from `package.json`; the visible badge test now expects `v1.0.7`.

### Partially Working

- Existing browser-local IndexedDB state may contain older workflow records; the app normalizes older workflow schema versions on load.

### Not Working Yet

- No runtime timer, due-work, retry execution, job orchestration, handler execution, persistence, authorization, logging, or idempotency behavior exists in this repo.
- No publish/distribution artifact was produced for `1.0.7`.

### Not Yet Verified

- No browser smoke test was run for this version-only checkpoint.
- No AppLauncher manifest validation was run because no `1.0.7` manifest was requested or created.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Keep workflow actions, guards, side effects, authorization, persistence, logging, jobs, retries, idempotency, and runtime orchestration out of the state-machine core unless a later approved plan changes the boundary.
- The visual editor may author state-machine and workflow definitions, but it must not turn the state-machine layer into the workflow layer.
- Browser-local Library persistence remains separate from exported JSON contracts.
- `schemaVersion` is file-format version.
- `definitionVersion` and `workflowVersion` are user-controlled definition versions and remain separate from package/app version.
- Use numbered versions only; do not use `latest`.
- Default to Build Mode unless release behavior is explicitly requested.

## 6. Commands and Verification

Common commands:

```sh
npm install
npm run dev
npm run lint
npm run test
npm run build
npm run verify
```

Latest verification:

```sh
npm run verify
```

Result: passed on 2026-05-28T04:19Z. It ran TypeScript checking, 105 Vitest tests, and a Vite production build.

Known verification notes:

- Test output still includes an existing Mermaid React `act(...)` warning, but all tests pass.
- Build output still includes existing Mermaid chunk-size warnings.
- Running `npm run build` cleans tracked AppLauncher manifests under `dist/applauncher-manifests/...`; restore them if they are unintentionally removed by verification and no new manifest work is in scope.

Handoff verifier:

```sh
python3 "/Users/paulmarshall/Software Development/All Skills/handoff/scripts/verify_handoff_freshness.py" handoff.md
```

Expected result after the `1.0.7` commit: `fresh-to-HEAD`.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `package.json`: app version source of truth and root scripts.
- `README.md`: user-facing status, version, and workflow contract summary.
- `src/App.tsx`: editor UI and package-version display.
- `src/App.test.tsx`: app-level coverage, including version badge expectation.
- `docs/json-file-formats.md`: canonical JSON import/export contract.
- `src/lib/workflow.ts`: workflow schema, lifecycle schedule/retry types, and validation rules.

## 8. Next Actions

Next:

- Start new feature or doc work from the clean `1.0.7` checkpoint.
- Run `npm run verify` before the next commit.

Blocked:

- None.

Later:

- Update target app normalizers, such as FileCatalog, to accept workflow schema `0.6.0`.
- Generate and install a `1.0.7` AppLauncher manifest only if explicitly requested.
- Address the existing Mermaid `act(...)` warning separately if desired.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as hot context. The repo is on `main` at the clean committed `1.0.7` checkpoint. Open `AGENTS.md`, `package.json`, `README.md`, `src/App.tsx`, `src/App.test.tsx`, `docs/json-file-formats.md`, and `src/lib/workflow.ts`. Preserve the boundary that the editor authors workflow metadata only; host apps own timers, due-work records, retries, jobs, persistence, authorization, logging, and idempotency. Run `npm run verify` before committing.
