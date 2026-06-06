# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: implementation handoff
- created timestamp in UTC: 2026-06-06T07:22:20Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: refreshed continuity after implementing `while_in_state` daily schedule and recurring run-limit authoring from `docs/plans/00 Extend While-In-State Schedule Authoring.md`.

### Checkpoint Status

- Git HEAD: `7c0c521`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `README.md`
  - `docs/completed-tasks.md`
  - `docs/json-file-formats.md`
  - `docs/plans/state-workflow-editor.md`
  - `handoff.md`
  - `src/App.test.tsx`
  - `src/App.tsx`
  - `src/lib/workflow.test.ts`
  - `src/lib/workflow.ts`
  - `src/styles.css`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `"docs/plans/00 Extend While-In-State Schedule Authoring.md"`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `README.md`
  - `docs/completed-tasks.md`
  - `docs/json-file-formats.md`
  - `docs/plans/00 Extend While-In-State Schedule Authoring.md`
  - `docs/plans/state-workflow-editor.md`
  - `src/lib/workflow.ts`
  - `src/App.tsx`
  - `src/styles.css`
  - `src/lib/workflow.test.ts`
  - `src/App.test.tsx`
  - `handoff.md`
- Last verification:
  - command: `npm test -- --run src/lib/workflow.test.ts src/App.test.tsx`; `npm run lint`; `npm test`; `npm run build`
  - result: passed
  - timestamp UTC: 2026-06-06T07:06Z
- Handoff freshness: `fresh-to-dirty-tree`
- Safe-to-continue basis: the current dirty tree contains the completed schema/UI/docs/test changes plus this continuity refresh; all planned verification commands passed.
- Next checkpoint action: commit or intentionally leave the dirty tree for review.

## 2. Executive Summary

The current focus is workflow lifecycle schedule authoring for `while_in_state` hooks.

Complete now:

- Workflow schema is `0.8.0`.
- `WorkflowLifecycleHookSchedule` accepts:
  - `{ "trigger": "after_duration", "delayMs": number }`
  - `{ "trigger": "every_interval", "intervalMs": number }`
  - `{ "trigger": "daily", "timeOfDay": "HH:mm" }`
- `while_in_state` hooks may define `runLimit: { "maxRuns": number }` for recurring `every_interval` and `daily` schedules.
- `runLimit.maxRuns` is per state residency and separate from `retryPolicy.maxAttempts`.
- The Lifecycle editor supports Every Interval, After Duration, and Daily schedule triggers.
- Daily schedules use a native time input and export local target-app wall-clock `HH:mm` without timezone.
- Recurring schedules expose optional “Stop after N runs” controls.
- Imported invalid schedule, run-limit, and retry metadata is preserved closely enough for validation and repair.
- README, `docs/json-file-formats.md`, `docs/plans/state-workflow-editor.md`, and `docs/completed-tasks.md` are updated for the new contract.

Incomplete now:

- The implementation and continuity docs are not committed.
- The plan source file remains untracked and intentionally in scope.
- The existing Mermaid React `act(...)` warning still appears during tests.
- Vite still reports existing large Mermaid chunks during build.

Safe to continue: yes, from `main` at `7c0c521` plus the explicitly accounted dirty tree.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

No `project-dossier.md` exists or is needed for the current scope.

## 3. Current Objective

Immediate goal: review, commit, or continue from the completed `while_in_state` schedule-authoring slice.

Intended finished state: the editor remains a contract authoring tool that validates, imports, exports, and documents lifecycle schedule metadata without implementing runtime timers, due-work records, retries, persistence, authorization, logging, jobs, or idempotency.

Definition of done for this workstream: keep `src/lib/workflow.ts`, `src/App.tsx`, tests, README, `docs/json-file-formats.md`, `docs/plans/state-workflow-editor.md`, `docs/completed-tasks.md`, and `handoff.md` aligned around workflow schema `0.8.0`; then commit or explicitly preserve the dirty tree.

## 4. Current State

### Working

- `WORKFLOW_SCHEMA_VERSION` is `0.8.0`.
- Validation accepts daily schedules with 24-hour `HH:mm` `timeOfDay`.
- Validation rejects malformed daily times, invalid run limits, and run limits on unsupported schedules.
- `runLimit` is copied through defined workflow objects and preserved on import.
- The editor defaults new `while_in_state` hooks to the existing 15-minute `every_interval` schedule.
- Switching to Daily creates `{ trigger: "daily", timeOfDay: "09:00" }` unless an existing daily time is present.
- Duration controls show only for Every Interval and After Duration.
- Run-limit controls show for recurring schedules and for imported invalid run-limit metadata that needs repair.
- Linked and bundled workflow exports include daily schedules and run limits when authored.
- Older workflow schemas through `0.7.0` upgrade in memory to `0.8.0`.
- `docs/completed-tasks.md` now records this completed slice.
- `npm test -- --run src/lib/workflow.test.ts src/App.test.tsx`, `npm run lint`, `npm test`, and `npm run build` passed.

### Partially Working

- The app test suite passes but still emits the known Mermaid React `act(...)` warning.
- Build succeeds but still emits the known large Mermaid chunk warning.
- Daily `timeOfDay` is contract metadata only; target apps must decide timezone, daylight-saving behavior, catch-up behavior, missed executions, and scheduler persistence.

### Not Working Yet

- This repo does not implement runtime scheduling, hook execution, due-work rows, retries, persistence, authorization, logging, jobs, or idempotency.
- Downstream target apps have not been updated here to consume workflow schema `0.8.0`.

### Not Yet Verified

- No browser smoke test was run after this documentation refresh.
- No downstream consumer compatibility check was run for workflow schema `0.8.0`.
- No release packaging, tagging, publishing, or AppLauncher manifest refresh was performed.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Keep workflow actions, guards, side effects, authorization, persistence, logging, jobs, retries, idempotency, and runtime orchestration out of the state-machine core unless a later approved plan changes the boundary.
- The visual editor may author state-machine and workflow definitions, but it must not turn the state-machine layer into the workflow layer.
- This repo authors schedule metadata only; host apps own timers, due-work records, retry execution, persistence, authorization, logging, jobs, idempotency, timezone handling, DST behavior, catch-up behavior, and missed-execution policy.
- `runLimit.maxRuns` caps scheduled handler executions per state residency; `retryPolicy.maxAttempts` counts retry attempts for a failed scheduled execution.
- Action `id` is the stable runtime/audit identifier; action `label` is visible UI text.
- `schemaVersion` is file-format version.
- `definitionVersion` and `workflowVersion` are user-controlled definition versions and remain separate from package/app version.
- Use numbered versions only; do not use `latest`.
- Default to Build Mode unless release behavior is explicitly requested.

## 6. Commands and Verification

Common commands:

```sh
npm install
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
npm run lint
npm test
npm run build
npm run verify
```

Latest verification:

```sh
npm test -- --run src/lib/workflow.test.ts src/App.test.tsx
npm run lint
npm test
npm run build
```

Result: passed on 2026-06-06 around 07:06Z.

Known non-blocking output:

- `src/App.test.tsx` still emits the existing Mermaid React `act(...)` warning during the drop-zone test.
- `npm run build` still emits existing Vite chunk-size warnings for large Mermaid-related chunks.

Handoff helpers:

```sh
python3 "/Users/paulmarshall/Software Development/All Skills/handoff/scripts/handoff_status.py" handoff.md --print-block
python3 "/Users/paulmarshall/Software Development/All Skills/handoff/scripts/verify_handoff_freshness.py" handoff.md
```

Repo-local `scripts/handoff_status.py` does not exist in this checkout.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `"docs/plans/00 Extend While-In-State Schedule Authoring.md"`: source plan for the completed slice.
- `src/lib/workflow.ts`: workflow schema `0.8.0`, daily schedule type, run-limit type, validation, and copy behavior.
- `src/App.tsx`: Lifecycle editor controls, import normalization, repair-path handling, and workflow schema upgrades.
- `src/styles.css`: run-limit and inspector-form styling.
- `src/lib/workflow.test.ts`: validation coverage for daily schedules and run limits.
- `src/App.test.tsx`: editor export/import and invalid-run-limit repair coverage.
- `README.md` and `docs/json-file-formats.md`: current public contract docs.
- `docs/completed-tasks.md`: append-only completed-task ledger.

## 8. Next Actions

Next:

- Review the dirty tree and commit the completed implementation plus continuity docs when ready.
- If launching for manual testing, run `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort` and open `http://127.0.0.1:5174/`.
- If downstream apps need this contract, update their schema support to workflow schema `0.8.0`.

Blocked:

- None.

Later:

- Decide whether the Mermaid React `act(...)` warning is worth a separate test-hygiene pass.
- Decide whether Mermaid chunk-size warnings need code-splitting work.
- Decide whether AppLauncher manifests need a follow-up schema/version refresh for this editor.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as hot context. The repo is on `main` at `7c0c521`, with the `while_in_state` daily schedule and run-limit implementation dirty and intentionally in scope. Open `AGENTS.md`, `docs/plans/00 Extend While-In-State Schedule Authoring.md`, `src/lib/workflow.ts`, `src/App.tsx`, `src/App.test.tsx`, `src/lib/workflow.test.ts`, README, and `docs/json-file-formats.md`. Preserve the boundary that this editor authors contract metadata only; host apps own timers, due-work records, retries, jobs, persistence, authorization, logging, idempotency, timezone handling, DST behavior, catch-up behavior, and missed-execution policy. Workflow schema is `0.8.0`; state-machine schema is `0.3.0`. Start by reviewing or committing the dirty tree, and distinguish confirmed current state from any new recommendations.
