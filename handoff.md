# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: implementation handoff
- created timestamp in UTC: 2026-05-19T10:07:42Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: workflow lifecycle hook schema/UI implementation, action handler removal, import migration, documentation refresh, and verification

### Checkpoint Status

- Git HEAD: `ee947ef`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `README.md`
  - `docs/plans/state-workflow-editor.md`
  - `src/App.test.tsx`
  - `src/App.tsx`
  - `src/lib/workflow.test.ts`
  - `src/lib/workflow.ts`
  - `src/styles.css`
  - `handoff.md`
- Dirty files intentionally out of scope: None
- Untracked files intentionally in scope: None
- Untracked files intentionally out of scope: None
- Canonical files described:
  - `AGENTS.md`
  - `README.md`
  - `docs/plans/state-workflow-editor.md`
  - `src/App.tsx`
  - `src/App.test.tsx`
  - `src/lib/workflow.ts`
  - `src/lib/workflow.test.ts`
  - `src/styles.css`
  - `handoff.md`
- Last verification:
  - command: `npm run verify`
  - result: passed
  - timestamp UTC: 2026-05-19T10:07:42Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: this handoff describes current `HEAD` plus every dirty file intentionally in scope; `npm run verify` passed after the lifecycle-hook implementation; no untracked files are present.
- Next checkpoint action: review/commit the dirty lifecycle-hook implementation, or continue UI refinement from this dirty tree.

## 2. Executive Summary

The current focus is the workflow contract/editor layer. The state-machine core remains project-agnostic and unchanged in scope: states, terminal states, legal transitions, definition metadata, and validation only.

This dirty tree implements workflow lifecycle hooks as the single place for app-specific handler keys. Workflow schema is now `0.5.0`. `WorkflowAction.processing` has been removed from the new schema and UI. Legacy imported `action.processing.handlerKey` values are converted into `before_transition` lifecycle hooks for compatibility.

The Workflow page now has `Actions`, `Buckets`, and `Lifecycle` views. Actions define legal transitions and visibility only. Buckets remain optional presentation metadata. Lifecycle hooks attach optional handler keys to before-transition, state-entry, while-in-state, and terminal-entry phases, with optional success and failure handler keys.

Broader project context remains in the README and plan docs; no separate `project-dossier.md` is needed right now.

## 3. Current Objective

Immediate goal: finish and checkpoint the lifecycle-hook workflow contract implementation.

Intended finished state: exported workflow definitions include top-level `hooks: []`, omit action-level `processing`, validate lifecycle hook targets and handler keys, preserve legacy import compatibility, and expose a usable Lifecycle editor UI.

Definition of done for this workstream:

- `npm run verify` passes.
- New exports use workflow schema `0.5.0`.
- Existing `0.1.0` through `0.4.0` workflow imports still normalize.
- Legacy `action.processing.handlerKey` imports become `before_transition` hooks.
- README and the workflow editor plan document match the implemented contract.
- Dirty files are reviewed and committed when ready.

## 4. Current State

### Working

- `src/lib/workflow.ts` defines workflow schema `0.5.0`.
- Workflow actions no longer include `processing`.
- Workflow definitions include top-level `hooks`.
- Lifecycle hook validation covers hook IDs, handler keys, phase/target compatibility, duplicate phase/target hooks, unknown action/state targets, and terminal-state-only terminal-entry hooks.
- `defineWorkflow` copies hooks and indexes them by `phase:targetType:targetId`.
- `src/App.tsx` normalizes imported workflows to include `hooks`.
- Imports from workflow schema `0.1.0`, `0.2.0`, `0.3.0`, and `0.4.0` upgrade to `0.5.0`.
- Legacy `action.processing.handlerKey` imports convert to `before_transition` hooks.
- The Workflow page includes a Lifecycle segmented view.
- The Actions view no longer renders a handler-key input.
- Action rows show a compact `Before transition` indicator and Edit button when a matching lifecycle hook exists.
- The Lifecycle view supports adding hooks by phase, editing target and main/success/failure handler keys, removing hooks, and showing grouped validity status.
- The Workflow Preview remains Mermaid-based and shows a compact lifecycle summary when hooks exist.
- README and `docs/plans/state-workflow-editor.md` now describe workflow schema `0.5.0`, `hooks`, and legacy import migration.

### Partially Working

- Lifecycle hooks are contract metadata only; the editor does not execute handlers.
- Success/failure handler keys are target-app identifiers only, not explicit workflow transitions.
- The preview shows lifecycle hook counts in a compact summary rather than embedding detailed hook markers directly in the Mermaid graph.
- Browser visual verification was limited because Playwright is not installed in the available Node REPL environment.

### Not Working Yet

- No generic workflow runtime exists.
- No lifecycle handler execution exists.
- No explicit `onSuccessActionId` or `onFailureActionId` transition outcome model exists.
- No direct graph editing exists.
- No package publishing, Docker image publishing, or hosted deployment flow exists.

### Not Yet Verified

- No Playwright/browser automation test was completed because `playwright` was not available in the Node REPL environment.
- Vite served successfully on temporary port `5176`; port `5174` was already in use.
- A localhost HTML request to `http://127.0.0.1:5176/` succeeded with curl, but no screenshot-based visual check was completed.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Do not add workflow guards, side effects, authorization, persistence, logging, jobs, retries, idempotency, or runtime orchestration to the state-machine core.
- Keep workflow execution semantics in target apps; this editor only authors and validates contracts.
- Treat `schemaVersion` as file-format version.
- Treat `definitionVersion` as the user-controlled state definition version, separate from the app/package version.
- Treat `workflowVersion` as the user-controlled workflow definition version, separate from the app/package version.
- Treat buckets as optional workflow presentation metadata only.
- Treat lifecycle hooks as optional app-processing metadata only.
- Actions are valid only when backed by current legal state-machine transitions and valid action metadata.
- Missing, empty, hidden, partial, or duplicate bucket assignments must not affect action validity.
- Exported workflow JSON must include `buckets` and `hooks` arrays, even when empty.
- New workflow exports must not emit `action.processing`.
- Use numbered versions only; `package.json` remains the app/package version source of truth.
- Run `npm run verify` before committing code changes.

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

Dev server default:

```sh
npm run dev
# http://127.0.0.1:5174/
```

Temporary verification server used this session:

```sh
npm run dev -- --host 127.0.0.1 --port 5176 --strictPort
curl -sS http://127.0.0.1:5176/
```

Result: `curl` returned the Vite HTML for `State Workflow Editor`. The temporary dev server on `5176` was stopped. Port `5174` was already in use and was not disturbed.

Latest full verification:

```sh
npm run verify
```

Result: passed for `state-workflow-engine@1.0.2` at 2026-05-19T10:07:42Z. It ran TypeScript checking, 82 Vitest tests, and a Vite production build. The existing Mermaid/jsdom React `act(...)` warning still appears in one App test and does not fail verification. Vite still reports Mermaid-related chunk-size warnings; those are non-blocking for this checkpoint.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `README.md`: current public contract for workflow schema `0.5.0`, lifecycle hooks, import migration, and editor layout.
- `src/lib/workflow.ts`: workflow types, schema version, lifecycle hook validation, and runtime helper copying/indexing.
- `src/App.tsx`: Lifecycle tab UI, import normalization, legacy processing migration, action-row lifecycle indicators, reconciliation, and export behavior.
- `src/App.test.tsx`: UI and import/export coverage for lifecycle hooks, legacy action processing migration, and schema `0.5.0` exports.
- `src/lib/workflow.test.ts`: workflow validation coverage for lifecycle hook targets and handler keys.
- `src/styles.css`: Lifecycle layout, hook list/editor styling, action lifecycle indicators, and preview summary styling.
- `docs/plans/state-workflow-editor.md`: planning artifact now updated for Lifecycle view and workflow schema `0.5.0`.

## 8. Next Actions

Next:

- Review the dirty lifecycle-hook implementation.
- Commit the implementation if the current behavior and documentation are acceptable.
- If visual confidence is needed, add or enable browser automation and inspect the Lifecycle view at desktop and narrow widths.

Blocked:

- Browser automation was not available through the current Node REPL because `playwright` was not installed.

Later:

- Add explicit success/failure action outcome fields only after a new approved plan.
- Add direct graph editing only after an approved plan.
- Add a generic workflow runtime only after an approved plan that preserves the state-machine/workflow boundary.
- Add Docker, package publishing, or hosted deployment only when distribution is explicitly requested.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as the hot-context source for current state. Review `AGENTS.md`, `README.md`, `src/lib/workflow.ts`, `src/App.tsx`, `src/App.test.tsx`, `src/lib/workflow.test.ts`, `src/styles.css`, and `docs/plans/state-workflow-editor.md` before changing code. Preserve the separation between the pure state-machine core, the workflow contract layer, and any future runtime workflow engine. The app/package version is `1.0.2`; state-machine schema is `0.2.0`; workflow schema is `0.5.0`; buckets are optional presentation overlays; lifecycle hooks are optional app-processing metadata; actions no longer carry handler keys. Continue from dirty `main` at `ee947ef`, with all dirty files intentionally in scope, and run `npm run verify` before committing.
