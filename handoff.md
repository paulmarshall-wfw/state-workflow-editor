# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: project checkpoint
- created timestamp in UTC: 2026-05-16T21:19:05Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: promote the editor to app version `1.0.0`, checkpoint workflow validation/import UX, refresh documentation, and commit the project state

### Checkpoint Status

- Git HEAD: current HEAD after the `1.0.0` checkpoint commit
- Working tree: clean after checkpoint commit
- Dirty files intentionally in scope before commit:
  - `.env.example`
  - `README.md`
  - `handoff.md`
  - `package-lock.json`
  - `package.json`
  - `src/App.test.tsx`
  - `src/App.tsx`
  - `src/styles.css`
  - `vite.config.ts`
- Dirty files intentionally out of scope: None
- Untracked files intentionally in scope: None
- Untracked files intentionally out of scope: None
- Canonical files described:
  - `AGENTS.md`
  - `README.md`
  - `package.json`
  - `package-lock.json`
  - `src/lib/stateMachine.ts`
  - `src/lib/workflow.ts`
  - `src/App.tsx`
  - `src/styles.css`
  - `vite.config.ts`
  - `docs/plans/state-workflow-editor.md`
- Last verification:
  - command: `npm run verify`
  - result: passed
  - timestamp UTC: 2026-05-16T21:20:34Z
- Handoff freshness: fresh-to-HEAD
- Safe-to-continue basis: the handoff is committed with the `1.0.0` checkpoint it describes; `npm run verify` passed after the version bump and UI/import changes
- Next checkpoint action: continue from clean `main`

## 2. Executive Summary

The project is a TypeScript/Vite/React repo containing a reusable state-machine core, a workflow contract layer, and a browser-based editor. The state-machine core owns valid states, allowed transitions, terminal states, definition metadata, and validation. The workflow layer maps named app actions and workflow buckets onto those valid states and transitions while keeping guards, authorization, side effects, persistence, jobs, retries, idempotency, logging, and runtime orchestration out of scope.

The current checkpoint is app version `1.0.0`. It keeps state-machine definition versioning separate from the app/package version, preserves state-machine schema `0.2.0`, and uses workflow schema `0.3.0`.

Completed in this checkpoint:

- Workflow Validation issues now open in a closeable pop-up dialog from a compact `View Issues` action.
- Importing a state-machine JSON file syncs the Target App into both the State Machine and Workflow pages.
- The Workflow page has its own JSON drop zone for linked workflow, bundled workflow, and state-machine definition files.
- Bundled workflow imports still load their embedded state-machine definition.
- Vite dev-server host and port are configurable through `VITE_HOST` and `VITE_PORT`, defaulting to `127.0.0.1:5174` with strict port binding.
- App/package version is bumped to `1.0.0` in `package.json` and `package-lock.json`.

Broader project context is not currently split into a `project-dossier.md`; this handoff and the existing README/plans are sufficient hot context.

## 3. Current Objective

Immediate goal: preserve the current editor as a verified `1.0.0` project checkpoint.

Intended finished state: a clean Git checkpoint where users can author state-machine definitions, author workflow definitions, use compact validation issue review, import state-machine or workflow JSON from the appropriate page, and run the app locally with documented defaults.

Definition of done: `npm run verify` passes and the checkpoint is committed.

## 4. Current State

### Working

- Core state-machine validation and runtime helpers are implemented in `src/lib/stateMachine.ts`.
- Workflow validation and helper APIs are implemented in `src/lib/workflow.ts`.
- The app has State Machine, Workflow, and Settings pages.
- State Machine page supports target app selection, folder-based slug project picking, state machine ID/version, states, terminal toggles, selected-state transitions, continuous validation, JSON import/export, and Mermaid preview.
- Workflow page supports workflow metadata, linked state-machine reference display, action editing, bucket editing, state mapping, workflow validation, linked export, bundled export, linked import, bundled import, and action-labelled Mermaid preview.
- Workflow page JSON drop zone accepts linked workflow definitions, bundled workflow definitions with `embeddedStateMachineDefinition`, and plain state-machine definitions.
- State-machine JSON import updates both the state-machine `appName` and workflow `appName`.
- Workflow validation details are hidden from the page layout until the user opens the issues dialog; the dialog closes via Close, backdrop click, or Escape.
- Export uses `window.showSaveFilePicker` when available and browser download fallback otherwise.
- App settings store configurable logo URL and light/dark theme in browser local storage.
- App version displayed beside the title is sourced from `package.json`.
- CI workflow is present and runs `npm ci` plus `npm run verify`.

### Partially Working

- Mermaid graphs are preview-only by design.
- Settings currently covers logo URL and theme persistence only.

### Not Working Yet

- No generic workflow runtime exists.
- No direct graph editing exists.
- No package publishing, Docker image publishing, or hosted deployment flow exists.

### Not Yet Verified

- Browser visual regression is not automated.
- AppLauncher manifest/install state was not refreshed for version `1.0.0` in this checkpoint.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Do not add workflow guards, side effects, authorization, persistence, logging, jobs, retries, idempotency, or runtime orchestration to the state-machine core or workflow contract layer without a new approved plan.
- Treat `schemaVersion` as file-format version.
- Treat `definitionVersion` as the user-controlled state definition version, separate from the app/package version.
- Treat `workflowVersion` as the user-controlled workflow definition version, separate from the app/package version.
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

Dev server defaults:

```sh
npm run dev
# http://127.0.0.1:5174/
```

Optional dev-server overrides:

```sh
VITE_HOST=127.0.0.1 VITE_PORT=5176 npm run dev
```

Latest verified command:

```sh
npm run verify
```

Result: passed for `state-workflow-engine@1.0.0` at 2026-05-16T21:20:34Z. It ran TypeScript checking, 74 Vitest tests, and a Vite production build. The build still reports Mermaid-related chunk-size warnings; those are non-blocking and pre-existing for the current dependency shape.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `README.md`: current run, verify, structure, configuration, definition format, editor layout, and versioning notes.
- `src/lib/stateMachine.ts`: reusable state-machine core and definition validation.
- `src/lib/workflow.ts`: workflow contract validation and helper APIs.
- `src/App.tsx`: editor UI, settings page, state-machine and workflow import/export behavior, validation dialog, and save-picker fallback.
- `src/styles.css`: editor layout, dialog styling, drop-zone styling, and responsive behavior.
- `vite.config.ts`: local dev-server host/port defaults.
- `docs/plans/state-workflow-editor.md`: PRD and implementation plan for the expanded editor.

## 8. Next Actions

Next:

- Continue feature work from the clean `1.0.0` checkpoint.

Blocked:

- None.

Later:

- Refresh AppLauncher manifest/install artifacts if `1.0.0` should be launchable from AppLauncher.
- Add browser visual smoke/regression testing if editor UI changes continue.
- Add release/publish workflow only when distribution is explicitly requested.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as the hot-context source for current state. Review `AGENTS.md`, `README.md`, `src/lib/stateMachine.ts`, `src/lib/workflow.ts`, `src/App.tsx`, `src/styles.css`, `vite.config.ts`, and `docs/plans/state-workflow-editor.md` before changing code. Preserve the separation between the pure state-machine core, the workflow contract layer, and any future runtime workflow engine. App/package version is `1.0.0`; state-machine `definitionVersion` and workflow `workflowVersion` remain user-controlled export metadata. Run `npm run verify` before committing.
