# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: release checkpoint
- created timestamp in UTC: 2026-05-19T04:13:13Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: bucket-focused workflow preview, version `1.0.2`, AppLauncher manifest refresh, documentation refresh, and Git checkpoint

### Checkpoint Status

- Git HEAD: current HEAD
- Working tree: clean after checkpoint commit
- Dirty files intentionally in scope: None
- Dirty files intentionally out of scope: None
- Untracked files intentionally in scope: None
- Untracked files intentionally out of scope: None
- Canonical files described:
  - `AGENTS.md`
  - `README.md`
  - `docs/plans/state-workflow-editor.md`
  - `package.json`
  - `package-lock.json`
  - `dist/applauncher-manifests/state-workflow-engine/1.0.2/manifest.json`
  - `src/App.tsx`
  - `src/App.test.tsx`
  - `src/lib/workflow.ts`
  - `src/lib/workflow.test.ts`
  - `handoff.md`
- Last verification:
  - command: `npm run verify`
  - result: passed
  - timestamp UTC: 2026-05-19T04:13:13Z
- AppLauncher validation:
  - repo manifest: `node /Users/paulmarshall/Software\ Development/All\ Skills/applauncher-manifest/scripts/validate_manifest.mjs --manifest dist/applauncher-manifests/state-workflow-engine/1.0.2/manifest.json`
  - installed manifest: `node /Users/paulmarshall/Software\ Development/All\ Skills/applauncher-manifest/scripts/validate_manifest.mjs --manifest "$HOME/Library/Application Support/AppLauncher/manifest-install/state-workflow-engine/1.0.2/manifest.json"`
  - result: both passed with `Errors: 0`, `Warnings: 0`; repo and installed copies matched
- Handoff freshness: fresh-to-HEAD
- Safe-to-continue basis: this handoff is committed with the checkpoint it describes, the package/app version is `1.0.2`, `npm run verify` passed, and the AppLauncher `localWebApp` manifest validated in both repo and machine install-source locations
- Next checkpoint action: continue feature work from clean `main`

## 2. Executive Summary

The project is a TypeScript/Vite/React repo containing a reusable state-machine core, a workflow contract layer, and a browser-based editor. The state-machine core remains limited to states, allowed transitions, terminal states, definition metadata, and validation. The workflow layer maps named app actions onto legal state-machine transitions and can add optional presentation metadata.

This checkpoint bumps the app/package version to `1.0.2`, keeps state-machine schema `0.2.0`, and keeps workflow schema `0.4.0`.

Completed in this checkpoint:

- Workflow Preview now supports bucket-focused styling in Buckets view.
- When a bucket is selected in Buckets view, states in that bucket render with solid/default Mermaid boundaries and all other states render with dotted boundaries.
- Actions view continues to show the normal full workflow preview.
- All workflow states and action-labelled transitions remain visible in focused preview mode.
- The visible app version, package metadata, README status, and test expectations now use `1.0.2`.
- AppLauncher `localWebApp` manifest was regenerated for `1.0.2` and installed to the machine-level manifest-install tree.

Broader project context remains in the README and plan docs; no separate `project-dossier.md` is needed right now.

## 3. Current Objective

Immediate goal: resume from a clean, verified `1.0.2` checkpoint.

Intended finished state: the editor can author and export state-machine and workflow contracts with optional bucket overlays, validated workflow actions, state-machine/workflow import flows, Reset Workflow, Mermaid previews, and AppLauncher local launch support.

Definition of done for this workstream: `npm run verify` passes, AppLauncher manifests validate, and all intended files are committed.

## 4. Current State

### Working

- Core state-machine validation and runtime helpers remain implemented in `src/lib/stateMachine.ts`.
- Workflow validation and helper APIs are implemented in `src/lib/workflow.ts`.
- Workflow schema constant is `0.4.0`.
- Workflow validation no longer requires every state to be assigned to a bucket.
- Workflow validation no longer invalidates user actions because the source state is hidden, unbucketed, or in a hidden bucket.
- The app has State Machine, Workflow, and Settings pages.
- Workflow page supports metadata, linked state-machine reference display, action editing, bucket editing, state mapping, validation, linked export, bundled export, linked import, bundled import, state-machine import through the workflow drop zone, Reset Workflow, and action-labelled Mermaid preview.
- Workflow Preview uses bucket-focused boundary styling only while the Buckets view has a selected bucket.
- Export uses `window.showSaveFilePicker` when available and browser download fallback otherwise.
- AppLauncher can launch the app as a `localWebApp` on `127.0.0.1:5174` using an explicit PATH and `npm run dev`.

### Partially Working

- Mermaid graphs are preview-only by design.
- Settings currently covers logo URL and theme persistence only.
- Browser visual regression is manual; automated coverage is through Vitest/jsdom.

### Not Working Yet

- No generic workflow runtime exists.
- No direct graph editing exists.
- No package publishing, Docker image publishing, or hosted deployment flow exists.

### Not Yet Verified

- No Playwright browser smoke test was run for this checkpoint because Playwright is not installed in this repo.
- A direct Mermaid parse check for the new dotted-boundary class syntax passed.
- AppLauncher manifest machine readiness was not a native-app readiness check because this is a `localWebApp`; schema and semantic validation passed.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Do not add workflow guards, side effects, authorization, persistence, logging, jobs, retries, idempotency, or runtime orchestration to the state-machine core or workflow contract layer without a new approved plan.
- Treat `schemaVersion` as file-format version.
- Treat `definitionVersion` as the user-controlled state definition version, separate from the app/package version.
- Treat `workflowVersion` as the user-controlled workflow definition version, separate from the app/package version.
- Treat buckets as optional workflow presentation metadata only.
- Actions are valid only when backed by current legal state-machine transitions and valid action metadata.
- Missing, empty, hidden, partial, or duplicate bucket assignments must not affect action validity.
- Exported workflow JSON must include a `buckets` array, even when empty.
- Use numbered versions only; `package.json` is the app/package version source of truth.
- Run `npm run verify` before committing code changes.
- Validate AppLauncher manifests before committing manifest work.

## 6. Commands and Verification

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

Latest verification:

```sh
npm run verify
```

Result: passed for `state-workflow-engine@1.0.2` at 2026-05-19T04:13:13Z. It ran TypeScript checking, 78 Vitest tests, and a Vite production build. The existing Mermaid/jsdom `act(...)` warning still appears in one App test and does not fail verification. Vite still reports Mermaid-related chunk-size warnings; those are non-blocking for this checkpoint.

AppLauncher manifest paths:

- Repo artifact: `dist/applauncher-manifests/state-workflow-engine/1.0.2/manifest.json`
- Machine install-source: `/Users/paulmarshall/Library/Application Support/AppLauncher/manifest-install/state-workflow-engine/1.0.2/manifest.json`

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `README.md`: current version, definition formats, schema versions, optional bucket overlay semantics, run commands, and editor layout.
- `src/App.tsx`: editor UI, bucket-focused Mermaid preview wiring, reconciliation, Reset Workflow, import/export normalization, validation dialog, row selection, drag reorder, and save-picker fallback.
- `src/App.test.tsx`: component coverage for version display, focused workflow preview output, reconciliation, reset, linked/bundled export, empty bucket imports, drag reorder, and state-row UI behavior.
- `src/lib/workflow.ts`: workflow schema `0.4.0`, validation rules, import/export contract assumptions, and helper APIs.
- `docs/plans/state-workflow-editor.md`: PRD/plan updated for optional buckets, workflow schema `0.4.0`, and focused preview behavior.
- `dist/applauncher-manifests/state-workflow-engine/1.0.2/manifest.json`: validated AppLauncher repo artifact.

## 8. Next Actions

Next:

- Continue normal feature work from clean `main`.
- If more preview work continues, consider adding a browser verification dependency or workflow that can exercise real Mermaid rendering instead of jsdom-only tests.

Blocked:

- None.

Later:

- Add direct graph editing only after an approved plan.
- Add a generic workflow runtime only after an approved plan that preserves the state-machine/workflow boundary.
- Add Docker, package publishing, or hosted deployment only when distribution is explicitly requested.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as the hot-context source for current state. Review `AGENTS.md`, `README.md`, `src/App.tsx`, `src/App.test.tsx`, `src/lib/workflow.ts`, and `docs/plans/state-workflow-editor.md` before changing code. Preserve the separation between the pure state-machine core, the workflow contract layer, and any future runtime workflow engine. The app/package version is `1.0.2`; workflow schema is `0.4.0`; buckets are optional presentation overlays and must not affect action validity. Continue from clean `main`, distinguish confirmed state from new recommendations, and load broader docs only when the task requires them.
