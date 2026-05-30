# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: implementation handoff
- created timestamp in UTC: 2026-05-30T01:36:58Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: refreshed continuity after the workflow action ID / label separation landed at commit `ae984bc` and the completed-task log was created.

### Checkpoint Status

- Git HEAD: `ae984bc`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `docs/completed-tasks.md`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `README.md`
  - `docs/json-file-formats.md`
  - `docs/completed-tasks.md`
  - `src/App.tsx`
  - `src/App.test.tsx`
  - `src/lib/workflow.ts`
  - `src/lib/workflow.test.ts`
  - `src/styles.css`
  - `handoff.md`
- Last verification:
  - command: `npm run verify`
  - result: passed
  - timestamp UTC: 2026-05-30T01:30Z
- Handoff freshness: `fresh-to-dirty-tree`
- Safe-to-continue basis: commit `ae984bc` contains the workflow action ID / label implementation and passed `npm run verify`; the only intended dirty file is this handoff refresh and the only intended untracked file is the completed-task ledger.
- Next checkpoint action: add or commit `docs/completed-tasks.md` and `handoff.md` when ready.

## 2. Executive Summary

The current focus is the workflow definition action model. Workflow schema `0.7.0` now separates stable runtime/audit action IDs from visible button labels in the editor.

Complete now:

- `src/lib/workflow.ts` exports workflow schema `0.7.0`.
- Workflow action IDs accept lowercase dotted identifiers such as `memo.accept` and `accepted.reopen_as_memo`.
- Bucket IDs, lifecycle hook IDs, and handler keys remain lowercase snake_case.
- The Actions editor has separate editable Action ID and Button Label fields.
- Label edits no longer mutate action IDs.
- Action ID edits retarget existing `before_transition` lifecycle hooks.
- Add All Actions generates deterministic IDs like `queued.to_running` without generated suffixes.
- Mermaid workflow previews use action labels on edges.
- Lifecycle action selectors show labels with IDs for disambiguation, such as `Start (start)`.
- README and `docs/json-file-formats.md` document action IDs as stable runtime/audit identifiers and labels as visible button text.

Incomplete now:

- `docs/completed-tasks.md` is newly created and untracked.
- `handoff.md` is dirty because of this refresh.
- No browser smoke test was run after the `0.7.0` action ID work.
- The existing Mermaid React `act(...)` warning still appears during the app test suite and was not addressed.

Safe to continue: yes, from commit `ae984bc` plus the explicitly listed dirty/untracked continuity files.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

No `project-dossier.md` exists or is needed for the current scope.

## 3. Current Objective

Immediate goal: continue from the committed workflow action ID / label separation without widening the workflow/runtime boundary.

Intended finished state: the editor remains a contract authoring tool that produces workflow schema `0.7.0` files with stable semantic action IDs, short visible labels, and clear audit semantics.

Definition of done for the current workstream: keep validator, editor UI, import/export behavior, docs, and tests aligned around schema `0.7.0`; commit or otherwise account for `docs/completed-tasks.md` and this handoff refresh.

## 4. Current State

### Working

- State-machine core remains project-agnostic.
- Workflow schema is `0.7.0`.
- Action IDs and labels are independent in the workflow editor and exported JSON.
- Dotted action IDs validate in the workflow layer.
- Snake_case validation remains in force for buckets, lifecycle hooks, and handler keys.
- Legacy workflow schemas `0.1.0` through `0.6.0` normalize in memory to `0.7.0`.
- Existing imported action IDs and labels are preserved exactly; old suffix IDs are surfaced for manual correction rather than guessed automatically.
- `npm run verify` passed after the implementation.

### Partially Working

- Add All Actions creates deterministic transition-derived action IDs as starting points; users still need to edit them to app-semantic IDs where the generated transition wording is not meaningful enough.
- The app test suite passes, but still emits the known Mermaid React `act(...)` warning.

### Not Working Yet

- No runtime timer, due-work, retry execution, job orchestration, handler execution, persistence, authorization, logging, or idempotency behavior exists in this repo.
- No downstream target app has been updated here to consume workflow schema `0.7.0`.

### Not Yet Verified

- No manual browser smoke test was run after the action ID / label UI changes.
- No downstream consumer compatibility check has been run for schema `0.7.0`.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Keep workflow actions, guards, side effects, authorization, persistence, logging, jobs, retries, idempotency, and runtime orchestration out of the state-machine core unless a later approved plan changes the boundary.
- The visual editor may author state-machine and workflow definitions, but it must not turn the state-machine layer into the workflow layer.
- Action `id` is the stable runtime/audit identifier; action `label` is visible UI text.
- Audit consumers should store the exact workflow action ID plus previous state and new state.
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

Result: passed on 2026-05-30 around 01:30Z. This ran TypeScript, Vitest, and the Vite production build. The app suite still emits the existing Mermaid React `act(...)` warning, but all tests passed.

Handoff verifier:

```sh
python3 "/Users/paulmarshall/Software Development/All Skills/handoff/scripts/verify_handoff_freshness.py" handoff.md
```

Expected result after this handoff refresh: `fresh-to-dirty-tree`.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `src/lib/workflow.ts`: workflow schema version and validation rules.
- `src/App.tsx`: action editor behavior, import normalization, Mermaid generation, lifecycle target labels.
- `src/styles.css`: action row grid layout including Action ID and Button Label fields.
- `src/App.test.tsx`: app/editor regression coverage for schema `0.7.0`.
- `src/lib/workflow.test.ts`: workflow validator coverage for dotted action IDs and snake_case hook/bucket constraints.
- `README.md` and `docs/json-file-formats.md`: documented schema and target-app contract.
- `docs/completed-tasks.md`: append-only completed-task ledger.

## 8. Next Actions

Next:

- Add or commit `docs/completed-tasks.md` and this handoff refresh when ready.
- For the next workflow-schema change, keep `src/lib/workflow.ts`, `src/App.tsx`, tests, README, and `docs/json-file-formats.md` aligned in the same session.

Blocked:

- None.

Later:

- Decide whether to run a browser smoke test for the `0.7.0` Actions editor UI.
- Decide whether the Mermaid React `act(...)` warning is worth a separate test-hygiene pass.
- Update downstream target apps when they need to consume workflow schema `0.7.0`.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as hot context. The repo is on `main` at `ae984bc`, with `handoff.md` intentionally dirty and `docs/completed-tasks.md` intentionally untracked after the continuity refresh. Open `AGENTS.md`, `src/lib/workflow.ts`, `src/App.tsx`, `src/App.test.tsx`, `src/lib/workflow.test.ts`, README, and `docs/json-file-formats.md`. Preserve the boundary that the editor authors workflow metadata only; host apps own timers, due-work records, retries, jobs, persistence, authorization, logging, and idempotency. Workflow schema is `0.7.0`; action IDs are stable dotted runtime/audit identifiers and labels are visible button text. Run `npm run verify` before the next code checkpoint.
