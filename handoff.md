# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: release checkpoint
- created timestamp in UTC: 2026-05-19T20:02:02Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: version bump to `1.0.4`, IndexedDB Library persistence, current-workspace autosave, exact-version workflow linking, AppLauncher manifest refresh, verification, and commit

### Checkpoint Status

- Git HEAD: current HEAD
- Working tree: clean
- Dirty files intentionally in scope: None
- Dirty files intentionally out of scope: None
- Untracked files intentionally in scope: None
- Untracked files intentionally out of scope: None
- Canonical files described:
  - `AGENTS.md`
  - `README.md`
  - `docs/json-file-formats.md`
  - `src/App.tsx`
  - `src/App.test.tsx`
  - `src/lib/persistence.ts`
  - `src/lib/persistence.test.ts`
  - `src/lib/stateMachine.ts`
  - `src/lib/workflow.ts`
  - `src/styles.css`
  - `package.json`
  - `dist/applauncher-manifests/state-workflow-engine/1.0.4/manifest.json`
  - `handoff.md`
- Last verification:
  - command: `npm run verify`
  - result: passed
  - timestamp UTC: 2026-05-19T20:02:02Z
- Handoff freshness: fresh-to-HEAD
- Safe-to-continue basis: this handoff is committed with the checkpoint it describes; `npm run verify` passed on `state-workflow-engine@1.0.4`; the `1.0.4` AppLauncher repo and install-source manifests validated with zero errors and zero warnings and matched byte-for-byte before commit.
- Next checkpoint action: continue from clean `main`, or create a new branch before the next workstream if desired.

## 2. Executive Summary

The current checkpoint is `1.0.4`. The editor now has browser-local IndexedDB persistence with a recoverable current workspace draft and an explicit Library page for saved state-machine and workflow definitions.

The state-machine core remains project-agnostic and limited to states, terminal states, legal transitions, definition metadata, and validation. Workflow definitions remain app-facing contracts. A single exact state-machine definition version can have multiple saved workflows.

Exported JSON formats are unchanged: state-machine schema remains `0.2.0`, workflow schema remains `0.5.0`, and persistence metadata is not emitted in normal exports.

## 3. Current Objective

Immediate goal: checkpoint the persistence work as version `1.0.4`.

Intended finished state:

- package/app version is `1.0.4`
- browser-local Library storage uses IndexedDB
- current editor workspace autosaves as a draft
- saved state machines use `stateMachine:<id>@<definitionVersion>`
- saved workflows use `workflow:<stateMachine.id>@<stateMachine.definitionVersion>/<workflow.id>@<workflowVersion>`
- workflows link to exact state-machine versions, not latest versions
- import/export JSON remains compatible with the existing file-format docs
- AppLauncher has a validated `localWebApp` `1.0.4` manifest in the repo artifact path and machine install-source path

Definition of done for this checkpoint:

- `npm run verify` passes
- AppLauncher manifest validation reports zero errors and zero warnings
- repo and installed AppLauncher manifest copies match
- `handoff.md` is current and committed

## 4. Current State

### Working

- App/package version is `1.0.4` in `package.json`, `package-lock.json`, README status, and UI test expectations.
- The Library page can save the current state-machine definition and the current workflow definition.
- IndexedDB persistence stores:
  - one current workspace draft keyed by `current_workspace`
  - saved state-machine definitions
  - saved workflow definitions linked to exact state-machine definition versions
- The current workspace draft restores state-machine, workflow, active page, and selected workflow view when available.
- Explicit Library saves require overwrite confirmation when the same composite key already exists.
- Workflow saves require the linked state-machine version to be saved first.
- Deleting a saved state-machine version is blocked while saved workflows still reference it.
- Duplicate-as-new-version flows exist for saved state machines and saved workflows.
- Import behavior remains draft-only until the user explicitly saves to Library.
- Linked and bundled workflow exports still omit persistence metadata.
- `docs/json-file-formats.md` documents unchanged export formats and the internal Library key model.
- AppLauncher `1.0.4` manifest is `manifestVersion: "1.1.0"` and `appKind: "localWebApp"`.

### Partially Working

- Persistence is browser-local only; there is no repo-file or backend database persistence.
- The Library stores saved definition records, but there is no bulk export/import of the whole Library.
- Lifecycle hooks remain contract metadata only; the editor validates and exports handler keys but does not execute them.

### Not Working Yet

- No generic workflow runtime exists.
- No lifecycle handler execution exists.
- No explicit success/failure transition outcome model exists.
- No direct graph editing exists.
- No package publishing, Docker image publishing, or hosted deployment flow exists.

### Not Yet Verified

- No automated cross-browser IndexedDB compatibility matrix was run.
- No browser screenshot automation was completed for narrow/mobile Library layouts.
- The existing Mermaid/jsdom React `act(...)` warning still appears in one App test and remains non-failing.
- Vite still reports Mermaid-related chunk-size warnings during production build; these are non-blocking for this checkpoint.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Keep workflow execution semantics in target apps; this editor authors and validates contracts only.
- Do not add workflow guards, side effects, authorization, logging, jobs, retries, idempotency, or runtime orchestration to the state-machine core.
- Browser Library persistence must stay separate from exported JSON contracts.
- `schemaVersion` is file-format version.
- `definitionVersion` and `workflowVersion` are user-controlled definition versions, separate from package/app version.
- Saved state-machine IDs are globally unique in the local Library by `id + definitionVersion`.
- Saved workflow IDs are scoped under exact `stateMachine.id + stateMachine.definitionVersion`.
- AppLauncher manifest work stays `localWebApp`; do not introduce Docker/container release behavior unless explicitly requested.
- Use numbered versions only.

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

Latest full verification:

```sh
npm run verify
```

Result: passed for `state-workflow-engine@1.0.4` at 2026-05-19T20:02:02Z. It ran TypeScript checking, 87 Vitest tests, and a Vite production build.

AppLauncher validation:

```sh
node '/Users/paulmarshall/Software Development/All Skills/applauncher-manifest/scripts/validate_manifest.mjs' --manifest dist/applauncher-manifests/state-workflow-engine/1.0.4/manifest.json
node '/Users/paulmarshall/Software Development/All Skills/applauncher-manifest/scripts/validate_manifest.mjs' --manifest "$HOME/Library/Application Support/AppLauncher/manifest-install/state-workflow-engine/1.0.4/manifest.json"
```

Result: both passed with `Errors: 0` and `Warnings: 0`; repo and install-source copies matched byte-for-byte.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `README.md`: current project summary, version, Library storage model, and dev commands.
- `docs/json-file-formats.md`: canonical import/export JSON format reference plus internal Library key model.
- `src/lib/persistence.ts`: IndexedDB stores, record types, and composite key builders.
- `src/App.tsx`: Library page, autosave restore/save effects, and save/load/delete flows.
- `src/App.test.tsx`: UI coverage for Library saves and existing import/export behavior.
- `src/lib/persistence.test.ts`: persistence key and IndexedDB wrapper coverage.
- `dist/applauncher-manifests/state-workflow-engine/1.0.4/manifest.json`: current repo AppLauncher manifest artifact.

## 8. Next Actions

Next:

- Continue from clean `main` with any new user-requested workflow editor refinements.
- If visual confidence is needed, inspect the Library page at narrow and desktop widths.

Blocked:

- None for the `1.0.4` checkpoint.

Later:

- Add a bulk Library export/import format only after an approved plan.
- Add explicit success/failure action outcome fields only after a new approved plan.
- Add direct graph editing only after an approved plan.
- Add a generic workflow runtime only after an approved plan that preserves the state-machine/workflow boundary.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as the hot-context source for current state. Review `AGENTS.md`, `README.md`, `docs/json-file-formats.md`, `src/lib/persistence.ts`, `src/App.tsx`, `src/App.test.tsx`, `src/lib/persistence.test.ts`, and `dist/applauncher-manifests/state-workflow-engine/1.0.4/manifest.json` before changing code. Preserve the separation between the pure state-machine core, the workflow contract layer, browser-local Library persistence, and any future runtime workflow engine. The app/package version is `1.0.4`; state-machine schema is `0.2.0`; workflow schema is `0.5.0`; Library persistence uses IndexedDB and must not alter exported JSON formats. Start from clean `main`, distinguish confirmed state from new recommendations, and run `npm run verify` before committing.
