# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: implementation handoff
- created timestamp in UTC: 2026-05-28T04:15:49Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: implemented scheduled `while_in_state` lifecycle hook authoring, validation, import/export, browser-local upgrade handling, docs, and tests.

### Checkpoint Status

- Git HEAD: `c37e8d9`
- Working tree: `dirty`
- Dirty files intentionally in scope:
  - `README.md`
  - `docs/json-file-formats.md`
  - `docs/plans/state-workflow-editor.md`
  - `handoff.md`
  - `src/App.test.tsx`
  - `src/App.tsx`
  - `src/lib/persistence.test.ts`
  - `src/lib/workflow.test.ts`
  - `src/lib/workflow.ts`
  - `src/styles.css`
- Dirty files intentionally out of scope: None
- Untracked files intentionally in scope:
  - `docs/plans/SchedulerPlan.md`
- Untracked files intentionally out of scope: None
- Canonical files described:
  - `AGENTS.md`
  - `docs/plans/SchedulerPlan.md`
  - `docs/json-file-formats.md`
  - `README.md`
  - `docs/plans/state-workflow-editor.md`
  - `src/lib/workflow.ts`
  - `src/App.tsx`
  - `src/App.test.tsx`
  - `src/lib/workflow.test.ts`
  - `src/lib/persistence.test.ts`
  - `src/styles.css`
  - `handoff.md`
- Last verification:
  - command: `npm run verify`
  - result: `passed`
  - timestamp UTC: 2026-05-28T04:10Z
- Handoff freshness: `fresh-to-dirty-tree`
- Safe-to-continue basis: this handoff describes current `HEAD` plus all dirty and untracked files from the scheduler implementation; `npm run verify` passed after the changes, and a Chrome smoke check confirmed the Lifecycle schedule controls render with schema `0.6.0`.
- Next checkpoint action: commit or review the dirty scheduler implementation.

## 2. Executive Summary

The current workstream implements `while_in_state` schedule authoring for workflow schema `0.6.0`. The editor remains an authoring tool only: it does not run timers, evaluate due hooks, create due-work records, execute retries, or add runtime workflow behavior.

Complete now:

- Workflow export schema is `0.6.0`.
- `while_in_state` hooks support `schedule` metadata and optional `retryPolicy`.
- Scheduled hooks require a valid `handlerKey`.
- Imports preserve invalid schedule/retry objects enough for validation to report specific errors.
- Legacy workflow schemas `0.1.0` through `0.5.0` normalize to `0.6.0` in memory.
- Browser-local current workspace drafts and Library workflows normalize on load without requiring saved records to be rewritten immediately.
- Lifecycle UI has schedule trigger, duration/unit, and retry controls.
- Docs and tests are updated.

Incomplete now:

- The implementation is not committed.
- No target app normalizer has been updated in this repo.

No `project-dossier.md` exists or was needed; broader durable context remains in the repo docs.

## 3. Current Objective

Immediate goal: finish and checkpoint the scheduled lifecycle-hook implementation.

Intended finished state:

- review the dirty diff
- commit the scheduler implementation if accepted
- keep workflow/runtime boundaries unchanged

Definition of done: complete when the dirty scheduler files are reviewed, committed, and `git status --short` is clean.

## 4. Current State

### Working

- Workflow schema constant is now `0.6.0`.
- `WorkflowLifecycleHook` supports:
  - `schedule: { trigger: "after_duration", delayMs }`
  - `schedule: { trigger: "every_interval", intervalMs }`
  - `retryPolicy: { maxAttempts, delayMs }`
- `validateWorkflowDefinition` rejects:
  - missing `while_in_state` schedule
  - unsupported schedule trigger
  - non-positive or non-integer schedule duration
  - schedule on non-`while_in_state` hooks
  - scheduled hooks without `handlerKey`
  - invalid retry `maxAttempts` or retry `delayMs`
- New `while_in_state` hooks default to a 15-minute `every_interval` schedule.
- Hook Details shows schedule controls only for `while_in_state` hooks and retry controls for hooks generally.
- File imports can load workflows with schedule-only validation issues so the author can fix them visibly in the editor.
- Saved current drafts and saved Library workflows from older schema versions normalize to `0.6.0` when loaded.
- Linked and bundled exports use schema `0.6.0`.

### Partially Working

- Invalid imported schedule objects are preserved for validation, but the UI can only edit them through the supported trigger/duration controls.
- The current browser-local state in Chrome may contain pre-existing FileCatalog workflow data; this is user/browser state, not a repo fixture.

### Not Working Yet

- No target-app runtime behavior exists here.
- No timer, due-work, retry execution, job orchestration, handler execution, or FileCatalog unsupported-item recheck routine exists in this repo.

### Not Yet Verified

- No new persistent screenshot artifact was captured.
- Existing non-failing Mermaid React `act(...)` warning still appears during one App test.
- Existing Vite Mermaid chunk-size warnings still appear during production build.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Keep workflow actions, guards, side effects, authorization, persistence, logging, jobs, retries, idempotency, and runtime orchestration out of the state-machine core.
- The visual editor may author state-machine and workflow definitions, but it must not become the runtime workflow layer.
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

Result: passed on 2026-05-28T04:10Z. It ran TypeScript checking, 105 Vitest tests, and a Vite production build.

Known verification notes:

- Test output still includes an existing Mermaid React `act(...)` warning, but all tests pass.
- Build output still includes existing Mermaid chunk-size warnings.
- Running `npm run build` can remove tracked AppLauncher manifests under `dist/applauncher-manifests/...`; those were restored after verification and are not part of the dirty diff.

Chrome smoke check:

- Started a temporary Vite server on `http://127.0.0.1:5180/` because the default port was occupied.
- Confirmed in Chrome that the Lifecycle view renders schedule controls, retry controls, `schema v0.6.0`, and invalid scheduled hook issue status.
- The temporary `5180` server was stopped.

Handoff verifier:

- No `scripts/verify_handoff_freshness.py` exists in this repo, so no automated handoff freshness verifier was run.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `docs/plans/SchedulerPlan.md`: implementation plan with accepted decisions folded in.
- `src/lib/workflow.ts`: workflow schema, lifecycle schedule/retry types, and validation rules.
- `src/App.tsx`: import normalization, Library/current draft upgrades, Lifecycle UI controls, and export behavior.
- `src/App.test.tsx`: app-level coverage for scheduled hooks, invalid imports, and saved draft/Library upgrades.
- `src/lib/workflow.test.ts`: workflow contract validation coverage.
- `docs/json-file-formats.md`: canonical JSON import/export contract.
- `README.md`: user-facing workflow contract summary.
- `docs/plans/state-workflow-editor.md`: architectural plan updated away from handler-only `while_in_state` metadata.

## 8. Next Actions

Next:

- Review the dirty diff.
- Commit the scheduler implementation if it is accepted.

Blocked:

- None.

Later:

- Update target app normalizers, such as FileCatalog, to accept workflow schema `0.6.0`.
- Add browser screenshot artifacts only if visual regression review becomes necessary.
- Address the existing Mermaid `act(...)` warning separately if desired.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as hot context. The repo is on `main` at `c37e8d9` with a dirty but verified scheduler implementation. Open `AGENTS.md`, `docs/plans/SchedulerPlan.md`, `src/lib/workflow.ts`, `src/App.tsx`, `src/App.test.tsx`, `src/lib/workflow.test.ts`, `docs/json-file-formats.md`, `README.md`, and `docs/plans/state-workflow-editor.md`. Preserve the boundary that the editor authors schedule metadata only; host apps own timers, due-work records, retries, jobs, persistence, authorization, logging, and idempotency. Run `npm run verify` before committing.
