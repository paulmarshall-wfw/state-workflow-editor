# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: implementation checkpoint
- created timestamp in UTC: 2026-05-15T03:23:29Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: Workflow buckets view implementation and bucket-mapping UX refinement inside the existing State Workflow Editor

### Checkpoint Status

- Git HEAD: current `main` checkout before the workflow buckets commit
- Working tree: dirty with workflow bucket implementation changes
- Dirty files intentionally in scope: `README.md`, `docs/plans/state-workflow-editor.md`, `handoff.md`, `src/App.test.tsx`, `src/App.tsx`, `src/lib/workflow.test.ts`, `src/lib/workflow.ts`, `src/styles.css`
- Dirty files intentionally out of scope: None
- Untracked files intentionally in scope: None after checkpoint commit
- Untracked files intentionally out of scope: None
- Canonical files described:
  - `README.md`
  - `AGENTS.md`
  - `package.json`
  - `package-lock.json`
  - `src/lib/stateMachine.ts`
  - `src/lib/workflow.ts`
  - `src/App.tsx`
  - `docs/plans/State Machine Core Library And Visual Definition Editor.md`
  - `docs/plans/state-workflow-editor.md`
- Last verification:
  - command: `npm run verify`
  - result: passed
  - timestamp UTC: 2026-05-15T03:24:03Z
- Handoff freshness: refreshed for the current workflow-buckets implementation after final verification
- Safe-to-continue basis: bucket changes are scoped to the workflow contract layer and editor UI; state-machine core remains unchanged
- Next checkpoint action: commit the workflow-buckets checkpoint if requested

## 2. Executive Summary

The project is a TypeScript/Vite/React repo containing a reusable state-machine core, a workflow contract layer, and a browser-based editor. The state-machine core owns valid states, allowed state-to-state transitions, terminal states, definition metadata, and validation. The workflow layer maps named app actions onto valid state transitions and groups states into workflow buckets while keeping guards, authorization, side effects, persistence, jobs, retries, idempotency, and runtime orchestration out of scope.

The current checkpoint adds exported workflow buckets to `State Workflow Editor`. App/package version remains `0.0.2`. State-machine definition exports remain separate from app versioning and still use definition schema `0.2.0`. Workflow definitions now use workflow schema `0.2.0`, include bucket mappings, and support both linked and bundled exports.

## 3. Current Objective

Immediate goal: implement the Workflow page `Actions / Buckets` segmented editor, export buckets in workflow JSON, preserve the workflow preview pane, refresh durable handoff context, and verify.

Intended finished state: users can author state-machine definitions, author workflow action contracts against the loaded state-machine definition, define workflow buckets, map every state into exactly one bucket, pick a local project folder to fill slug-like Target Project values, preview both definition types with Mermaid, and export state-machine JSON, linked workflow JSON, or bundled workflow JSON.

Definition of done: `npm run verify` passes.

## 4. Current State

### Working

- Core validation and runtime helpers are implemented in `src/lib/stateMachine.ts`.
- Definition schema is `0.2.0` and includes `appName`, `definitionVersion`, `id`, `states`, `terminalStates`, and `transitions`.
- Workflow validation and helper APIs are implemented in `src/lib/workflow.ts`; workflow schema is `0.2.0`.
- Visual editor supports State Machine, Workflow, and Settings pages.
- State Machine page supports target project, folder-based slug project picking, state machine ID, state machine version, state IDs, terminal toggles, selected-state transition rows, continuous validation, JSON import/export, and read-only Mermaid graph preview.
- Workflow page supports workflow metadata, folder-based slug project picking, linked state-machine reference display, an `Actions / Buckets` segmented editor, fixed selected-state action filtering, visible action column headings, action-button label editing without duplicating action IDs in rows, direct bucket-name editing, selected-bucket state mapping through `Add State`, row-level state removal, workflow validation, linked workflow import/export, bundled workflow import/export, and action-labelled Mermaid preview.
- Workflow buckets are exported workflow contract metadata. Bucket IDs are unique lowercase snake_case values, labels are required, bucket states must exist in the linked state-machine definition, and every state must be assigned to exactly one bucket.
- Importing older workflow schema `0.1.0` files upgrades them in memory by adding a default bucket that covers the linked state-machine states; new exports write schema `0.2.0`.
- Workflow actions header, Add Action button, selected state selector, and action column headings live in a compact non-scrolling container above the scrollable action rows.
- Metadata field labels are positioned above their controls. State Machine fields are ordered Target Project, State Machine ID, State Machine Version. Workflow fields use the corresponding workflow ordering and labels.
- Mermaid is a runtime UI dependency loaded dynamically by the preview component; it is not imported by the state-machine core and is not part of exported definition JSON.
- Export uses `window.showSaveFilePicker` when available and falls back to browser download when unavailable.
- App settings store configurable logo URL and light/dark theme in browser local storage.
- Tests cover state-machine behavior, workflow behavior, workflow bucket validation, metadata validation, settings logo persistence, theme switching, folder project picking, state-machine import/export, workflow linked/bundled import/export with buckets, older workflow import upgrade, selected-state transition editing, fixed selected-state workflow action filtering, workflow action editing, workflow bucket mapping UI, Mermaid source generation, mocked Mermaid preview rendering, and visible app version.
- CI workflow is present and runs `npm ci` plus `npm run verify`.

### Partially Working

- The graphs are preview-only by design for v0.
- Settings currently covers logo URL and theme persistence; broader editor preferences are not implemented yet.

### Not Working Yet

- No generic workflow runtime exists yet.
- No direct graph editing exists yet.
- No package publishing or deployment flow exists yet.

### Not Yet Verified

- Browser visual regression is not automated.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Do not add workflow guards, side effects, authorization, persistence, logging, jobs, retries, or idempotency to the state-machine core or workflow contract layer without a new approved plan.
- Treat `schemaVersion` as the file-format version.
- Treat `definitionVersion` as the user-controlled state definition version, separate from the app/package version.
- Use numbered versions only.
- Treat `package.json` as the app/package version source of truth.
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

Result: passed. It ran TypeScript checking, Vitest tests, and a Vite production build.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `README.md`: current run, verify, structure, configuration, definition format, editor layout, and versioning notes.
- `src/lib/stateMachine.ts`: reusable state-machine core and definition validation.
- `src/lib/workflow.ts`: workflow contract validation and helper APIs.
- `src/App.tsx`: editor UI, settings page, state-machine and workflow import/export behavior, selected-state transitions, workflow actions, and save-picker fallback.
- `docs/plans/state-workflow-editor.md`: PRD and implementation plan for the expanded editor.

## 8. Next Actions

Next:

- Continue from the clean committed checkpoint.

Blocked:

- None.

Later:

- Add browser-based visual regression or smoke testing if editor UI changes become frequent.
- Add release/publish workflow only when distribution is explicitly requested.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as the hot-context source for current state. Review `AGENTS.md`, `README.md`, `src/lib/stateMachine.ts`, `src/lib/workflow.ts`, `src/App.tsx`, and `docs/plans/state-workflow-editor.md` before changing code. Preserve the separation between the pure state-machine core, the workflow contract layer, and any future runtime workflow engine. App/package version is `0.0.2`; state-machine definition version remains user-controlled through `definitionVersion`. Run `npm run verify` before committing.
