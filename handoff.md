# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: release checkpoint
- created timestamp in UTC: 2026-05-19T10:57:44Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: version bump to `1.0.3`, Lifecycle UI cleanup, lifecycle-hook export coverage, JSON file-format documentation, AppLauncher manifest refresh, verification, and commit

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
  - `docs/plans/state-workflow-editor.md`
  - `src/App.tsx`
  - `src/App.test.tsx`
  - `src/lib/workflow.ts`
  - `src/lib/workflow.test.ts`
  - `src/styles.css`
  - `package.json`
  - `dist/applauncher-manifests/state-workflow-engine/1.0.3/manifest.json`
  - `handoff.md`
- Last verification:
  - command: `npm run verify`
  - result: passed
  - timestamp UTC: 2026-05-19T10:57:44Z
- Handoff freshness: fresh-to-HEAD
- Safe-to-continue basis: this handoff is committed with the checkpoint it describes; `npm run verify` passed on `state-workflow-engine@1.0.3`; the `1.0.3` AppLauncher repo and install-source manifests validated with zero errors and zero warnings and matched byte-for-byte before commit.
- Next checkpoint action: continue from clean `main`, or create a new branch before the next workstream if desired.

## 2. Executive Summary

The current checkpoint is `1.0.3`. The state-machine core remains project-agnostic and limited to states, terminal states, legal transitions, definition metadata, and validation.

The workflow contract/editor layer is current at workflow schema `0.5.0`. Lifecycle hooks are exported in both linked workflow and bundled workflow JSON, action-level `processing` remains removed from new exports, and legacy imported `action.processing.handlerKey` values still migrate to `before_transition` hooks.

Lifecycle UI cleanup is complete: empty lifecycle placeholders were removed, hook rows are denser and fixed-height, hook target labels use action IDs where needed, duplicate action labels such as `Cancel` no longer hide distinct action IDs, and Workflow Preview no longer shows lifecycle hook count badges.

`docs/json-file-formats.md` is now the canonical import/export JSON format reference. Broader project context remains in README and plan docs; no separate `project-dossier.md` is needed right now.

## 3. Current Objective

Immediate goal: checkpoint the current workflow lifecycle-hook and documentation work as version `1.0.3`.

Intended finished state:

- package/app version is `1.0.3`
- `README.md` reflects `1.0.3` and links the JSON format reference
- lifecycle hooks export in linked and bundled workflow JSON
- `docs/json-file-formats.md` defines all current imported/exported JSON shapes
- AppLauncher has a validated `localWebApp` `1.0.3` manifest in the repo artifact path and machine install-source path
- all changes are committed to Git

Definition of done for this checkpoint:

- `npm run verify` passes
- AppLauncher manifest validation reports zero errors and zero warnings
- repo and installed AppLauncher manifest copies match
- `handoff.md` is current and committed

## 4. Current State

### Working

- App/package version is `1.0.3` in `package.json`, `package-lock.json`, README status, and UI test expectations.
- State-machine schema remains `0.2.0`; workflow schema remains `0.5.0`.
- Linked and bundled workflow exports include `hooks`, including non-empty lifecycle-hook arrays.
- Workflow actions no longer emit `processing` in new exports.
- Workflow imports from schema `0.1.0`, `0.2.0`, `0.3.0`, and `0.4.0` normalize to current schema.
- Legacy action `processing.handlerKey` imports convert to `before_transition` lifecycle hooks.
- Lifecycle view layout is denser and independently scrollable in the list panel.
- Workflow Preview omits lifecycle hook count badges.
- Before-transition hook rows and target dropdowns show action IDs, including distinct `cancel_queued` and `cancel_running`.
- `docs/json-file-formats.md` covers state-machine, linked workflow, bundled workflow, lifecycle hooks, import behavior, and legacy import normalization.
- AppLauncher `1.0.3` manifest is `manifestVersion: "1.1.0"` and `appKind: "localWebApp"`.

### Partially Working

- Lifecycle hooks are contract metadata only; the editor validates and exports handler keys but does not execute them.
- Success/failure handler keys are target-app identifiers only, not explicit transition outcome fields.
- Browser screenshot automation was not available in this session; UI verification relied on component tests and local smoke checks.

### Not Working Yet

- No generic workflow runtime exists.
- No lifecycle handler execution exists.
- No explicit `onSuccessActionId` or `onFailureActionId` transition outcome model exists.
- No direct graph editing exists.
- No package publishing, Docker image publishing, or hosted deployment flow exists.

### Not Yet Verified

- No screenshot-based browser verification was completed for the final UI state.
- The existing Mermaid/jsdom React `act(...)` warning still appears in one App test and remains non-failing.
- Vite still reports Mermaid-related chunk-size warnings during production build; these are non-blocking for this checkpoint.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Keep workflow execution semantics in target apps; this editor authors and validates contracts only.
- Do not add workflow guards, side effects, authorization, persistence, logging, jobs, retries, idempotency, or runtime orchestration to the state-machine core.
- Treat `schemaVersion` as file-format version.
- Treat `definitionVersion` and `workflowVersion` as user-controlled definition versions, separate from package/app version.
- Exported workflow JSON must always include `buckets` and `hooks` arrays.
- New workflow exports must not emit `action.processing`.
- Use numbered versions only; `package.json` remains the app/package version source of truth.
- AppLauncher manifest work must stay `localWebApp`; do not introduce Docker/container release behavior unless explicitly requested.
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

Latest full verification:

```sh
npm run verify
```

Result: passed for `state-workflow-engine@1.0.3` at 2026-05-19T10:57:44Z. It ran TypeScript checking, 82 Vitest tests, and a Vite production build.

AppLauncher validation:

```sh
node '/Users/paulmarshall/Software Development/All Skills/applauncher-manifest/scripts/validate_manifest.mjs' --manifest dist/applauncher-manifests/state-workflow-engine/1.0.3/manifest.json
node '/Users/paulmarshall/Software Development/All Skills/applauncher-manifest/scripts/validate_manifest.mjs' --manifest "$HOME/Library/Application Support/AppLauncher/manifest-install/state-workflow-engine/1.0.3/manifest.json"
```

Result: both passed with `Errors: 0` and `Warnings: 0`; repo and install-source copies matched byte-for-byte.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `README.md`: current public project summary, version, and links to JSON format reference.
- `docs/json-file-formats.md`: canonical JSON import/export format reference.
- `src/lib/workflow.ts`: workflow schema, lifecycle hook validation, import/export contract helpers.
- `src/App.tsx`: Lifecycle UI, import normalization, export behavior, preview rendering.
- `src/App.test.tsx`: UI, import/export, lifecycle hook, and version coverage.
- `src/styles.css`: Lifecycle list density and panel scrolling behavior.
- `dist/applauncher-manifests/state-workflow-engine/1.0.3/manifest.json`: current repo AppLauncher manifest artifact.

## 8. Next Actions

Next:

- Continue with any new user-requested workflow editor refinements from clean `main`.
- If visual confidence is needed, add or enable browser automation and inspect the Lifecycle view at desktop and narrow widths.

Blocked:

- None for the `1.0.3` checkpoint.

Later:

- Add explicit success/failure action outcome fields only after a new approved plan.
- Add direct graph editing only after an approved plan.
- Add a generic workflow runtime only after an approved plan that preserves the state-machine/workflow boundary.
- Add Docker, package publishing, or hosted deployment only when distribution is explicitly requested.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as the hot-context source for current state. Review `AGENTS.md`, `README.md`, `docs/json-file-formats.md`, `src/lib/workflow.ts`, `src/App.tsx`, `src/App.test.tsx`, `src/styles.css`, and `dist/applauncher-manifests/state-workflow-engine/1.0.3/manifest.json` before changing code. Preserve the separation between the pure state-machine core, the workflow contract layer, and any future runtime workflow engine. The app/package version is `1.0.3`; state-machine schema is `0.2.0`; workflow schema is `0.5.0`; buckets are optional presentation overlays; lifecycle hooks are optional app-processing metadata; actions do not carry handler keys. Start from clean `main`, distinguish confirmed current state from new recommendations, and run `npm run verify` before committing.
