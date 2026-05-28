# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: implementation handoff
- created timestamp in UTC: 2026-05-28T19:45:00Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: tightened workflow lifecycle retry metadata so `retryPolicy` is valid only on scheduled `while_in_state` hooks, updated the editor and docs to match, and reran focused tests.

### Checkpoint Status

- Git HEAD: `ed5fa15`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - None
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `README.md`
  - `docs/json-file-formats.md`
  - `src/App.tsx`
  - `src/App.test.tsx`
  - `src/lib/workflow.ts`
  - `src/lib/workflow.test.ts`
  - `handoff.md`
- Last verification:
  - command: `npm run test -- src/lib/workflow.test.ts src/App.test.tsx`
  - result: passed
  - timestamp UTC: 2026-05-28T19:44Z
- Handoff freshness: `fresh-to-dirty-tree`
- Safe-to-continue basis: the lifecycle retry restriction is committed at `ed5fa15`, the only intentional dirty file is this refreshed handoff, and the focused workflow/app test suites passed after the fix.
- Next checkpoint action: commit the refreshed handoff or continue new work from `ed5fa15` and rerun broader verification before the next code checkpoint.

## 2. Executive Summary

The current focus is the lifecycle-hook schema boundary introduced in workflow schema `0.6.0`. The repo now enforces that `retryPolicy` is allowed only for scheduled `while_in_state` hooks, matching the docs and avoiding invalid exports from other lifecycle phases.

Complete now:

- `src/lib/workflow.ts` rejects retry metadata on non-`while_in_state` hooks.
- `src/App.tsx` shows retry controls only for `while_in_state` hooks and marks other retry usage invalid.
- `src/lib/workflow.test.ts` and `src/App.test.tsx` cover the restriction.
- `README.md` and `docs/json-file-formats.md` now state the same contract as the validator and editor.
- Focused tests passed for the workflow validator and app lifecycle UI paths.

Incomplete now:

- `npm run verify` was not rerun after this handoff refresh.
- No browser smoke test was run for the lifecycle retry change.
- No target app in another repo has been updated yet to consume or validate this stricter contract.

Safe to continue: yes, from committed code at `ed5fa15`. The only remaining dirty state is this handoff update.

No `project-dossier.md` exists or was needed; broader durable context remains in repo docs.

## 3. Current Objective

Immediate goal: continue from the committed lifecycle retry-policy fix without widening the workflow/runtime boundary.

Intended finished state: future sessions can trust that workflow schema `0.6.0` lifecycle retry metadata is restricted to scheduled `while_in_state` hooks across validation, editor authoring, tests, and docs.

Definition of done: keep the state/workflow boundary intact, run `npm run verify` before the next code checkpoint, refresh `handoff.md` if repo continuity changes, and commit intentionally.

## 4. Current State

### Working

- State-machine core remains project-agnostic.
- Workflow schema remains `0.6.0`.
- `retryPolicy` is now restricted to `while_in_state` hooks in both validation and editor authoring.
- Browser-local Library persistence remains separate from exported JSON contracts.
- Existing imports with retry/schedule validation issues can still be loaded into the editor for repair.

### Partially Working

- Existing browser-local IndexedDB state may contain older workflow records; the app normalizes older workflow schema versions on load.
- Import normalization still preserves malformed schedule or retry objects closely enough for validation to report specific errors rather than dropping them silently.

### Not Working Yet

- No runtime timer, due-work, retry execution, job orchestration, handler execution, persistence, authorization, logging, or idempotency behavior exists in this repo.
- No publish/distribution artifact was produced for `1.0.7`.
- No external target-app normalizer has been updated here to enforce the `retryPolicy` restriction downstream.

### Not Yet Verified

- `npm run lint`, `npm run build`, and full `npm run verify` were not rerun after this session’s change.
- No browser smoke test was run after the lifecycle retry UI change.
- Existing Mermaid React `act(...)` warning still appears in app tests and was not addressed in this session.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Keep workflow actions, guards, side effects, authorization, persistence, logging, jobs, retries, idempotency, and runtime orchestration out of the state-machine core unless a later approved plan changes the boundary.
- The visual editor may author state-machine and workflow definitions, but it must not turn the state-machine layer into the workflow layer.
- `while_in_state` schedule and retry metadata are authoring-time contract metadata only; the editor does not execute timers or retries.
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
npm run test -- src/lib/workflow.test.ts src/App.test.tsx
```

Result: passed on 2026-05-28T19:44Z. It ran the workflow validator suite and the React app suite covering lifecycle hook editing and export behavior.

Known verification notes:

- Test output still includes an existing Mermaid React `act(...)` warning, but the focused suites pass.
- Full typecheck/build verification was not rerun after this session’s change.
- Running `npm run build` can clean tracked AppLauncher manifests under `dist/applauncher-manifests/...`; restore them if they are unintentionally removed and no manifest work is in scope.

Handoff verifier:

```sh
python3 "/Users/paulmarshall/Software Development/All Skills/handoff/scripts/verify_handoff_freshness.py" handoff.md
```

Expected result after this handoff refresh: `fresh-to-dirty-tree`.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `src/lib/workflow.ts`: workflow schema, lifecycle validation rules, and the retry-phase restriction.
- `src/App.tsx`: lifecycle hook editing UI and import/load behavior.
- `src/lib/workflow.test.ts`: validator coverage for scheduled hooks and retry restrictions.
- `src/App.test.tsx`: app-level lifecycle authoring coverage, including retry-control visibility.
- `docs/json-file-formats.md`: canonical JSON import/export contract.
- `README.md`: user-facing workflow contract summary.

## 8. Next Actions

Next:

- Run `npm run verify` before the next code checkpoint.
- If another workflow-schema change is made, keep validator, editor, docs, and tests aligned in the same session.

Blocked:

- None.

Later:

- Update target app normalizers, such as FileCatalog, to accept and enforce workflow schema `0.6.0`.
- Address the existing Mermaid `act(...)` warning separately if desired.
- Generate and install a `1.0.7` AppLauncher manifest only if explicitly requested.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as hot context. The repo is on `main` at `ed5fa15` with only `handoff.md` intentionally dirty. Open `AGENTS.md`, `src/lib/workflow.ts`, `src/App.tsx`, `src/lib/workflow.test.ts`, `src/App.test.tsx`, `docs/json-file-formats.md`, and `README.md`. Preserve the boundary that the editor authors workflow metadata only; host apps own timers, due-work records, retries, jobs, persistence, authorization, logging, and idempotency. Run `npm run verify` before the next code checkpoint.
