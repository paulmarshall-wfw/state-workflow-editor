# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: release handoff
- created timestamp in UTC: 2026-05-26T03:21:07Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: `1.0.6` checkpoint: package version bump, Library timestamp UI, lifecycle-hook ID fix, AppLauncher local-web manifest refresh, and checkpoint documentation.

### Checkpoint Status

- Git HEAD: `current HEAD`
- Working tree: `clean`
- Dirty files intentionally in scope: None
- Dirty files intentionally out of scope: None
- Untracked files intentionally in scope: None
- Untracked files intentionally out of scope: None
- Canonical files described:
  - `AGENTS.md`
  - `README.md`
  - `package.json`
  - `package-lock.json`
  - `src/App.tsx`
  - `src/App.test.tsx`
  - `src/styles.css`
  - `dist/applauncher-manifests/state-workflow-engine/1.0.6/manifest.json`
  - `handoff.md`
- Last verification:
  - command: `npm run verify`
  - result: `passed`
  - timestamp UTC: 2026-05-26T03:20:22Z
- AppLauncher manifest validation:
  - repo artifact: `dist/applauncher-manifests/state-workflow-engine/1.0.6/manifest.json`
  - installed install-source copy: `/Users/paulmarshall/Library/Application Support/AppLauncher/manifest-install/state-workflow-engine/1.0.6/manifest.json`
  - installed registry copy: `/Users/paulmarshall/Library/Application Support/AppLauncher/manifests/state-workflow-engine/1.0.6/manifest.json`
  - result: repo and installed copies validated with `Errors: 0`, `Warnings: 0`; installed copies matched the repo artifact byte-for-byte.
- Handoff freshness: `fresh-to-HEAD`
- Safe-to-continue basis: this handoff is committed with the `1.0.6` checkpoint it describes; `npm run verify` passed after the version bump, and the AppLauncher `localWebApp` manifests validated cleanly.
- Next checkpoint action: none required unless new work begins.

## 2. Executive Summary

The current checkpoint is `1.0.6`. It includes the package/app version bump from `1.0.5` to `1.0.6`, refreshed README version text, a validated AppLauncher `localWebApp` manifest for `state-workflow-engine/1.0.6`, and the latest editor UI fixes.

Functional changes now in the checkpoint:

- Lifecycle hook IDs regenerate when a hook target changes, so generated IDs stay aligned with the actual target.
- Library rows show the saved date/time for saved State Machines and Workflows using each record's existing `savedAt` metadata.
- The editor uses one global Actions menu and supports saving the current State Machine and Workflow together.

No state-machine schema, workflow schema, exported JSON shape, or runtime execution behavior was intentionally changed.

## 3. Current Objective

Immediate goal: preserve a clean `1.0.6` project checkpoint with matching package metadata, tests, handoff state, and AppLauncher manifest artifacts.

Intended finished state:

- `package.json` and `package-lock.json` both report `1.0.6`
- README reports private checkpoint `1.0.6`
- the app header version test expects `v1.0.6`
- `npm run verify` passes
- the AppLauncher manifest uses `manifestVersion: 1.1.0`, `appKind: localWebApp`, and `appVersion: 1.0.6`
- repo and machine-level manifest copies validate with zero errors and warnings
- the Git working tree is clean after commit

Definition of done: complete when the `1.0.6` checkpoint commit is present and `git status --short` is clean.

## 4. Current State

### Working

- State Workflow Editor runs as a Vite/React local web app.
- The browser UI displays the package app version and the test suite expects `v1.0.6`.
- Library persistence, autosave, exact-version workflow linking, and linked/bundled workflow import-export remain in place.
- Library records display `Saved <local date/time>` for saved State Machines and Workflows.
- Lifecycle hook target changes regenerate target-derived hook IDs and preserve collision suffixing.
- AppLauncher manifest family is confirmed as `localWebApp` with preferred host port `5174`, `npm run dev`, explicit `PATH`, and a single `production` profile.

### Partially Working

- The app menu dropdown remains a lightweight local component with click, outside-click close, disabled-item handling, and Escape handling in tests; no broader roving-focus menu model has been added.

### Not Working Yet

- No generic workflow runtime exists in this repo; workflow execution remains out of scope.
- No lifecycle handler execution exists; this editor authors workflow contract metadata only.

### Not Yet Verified

- No browser screenshot pass was run for this checkpoint.
- Existing non-failing Mermaid React `act(...)` warning still appears during one App test.
- Existing Vite Mermaid chunk-size warnings still appear during production build.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Keep workflow guards, side effects, authorization, persistence, logging, jobs, retries, idempotency, and runtime orchestration out of the state-machine core.
- Keep browser Library persistence separate from exported JSON contracts.
- `schemaVersion` is file-format version.
- `definitionVersion` and `workflowVersion` are user-controlled definition versions and remain separate from package/app version.
- AppLauncher work stays `localWebApp` unless a later explicit request changes the app kind.
- Use numbered versions only; do not use `latest`.

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

Latest verification:

```sh
npm run verify
```

Result: passed for `state-workflow-engine@1.0.6` at 2026-05-26T03:20:22Z. It ran TypeScript checking, 99 Vitest tests, and a Vite production build.

AppLauncher validation:

```sh
node "/Users/paulmarshall/Software Development/All Skills/applauncher-manifest/scripts/validate_manifest.mjs" --manifest "dist/applauncher-manifests/state-workflow-engine/1.0.6/manifest.json"
```

Result: `Errors: 0`, `Warnings: 0` for repo, install-source, and registry manifest copies.

Note: `npm run build` can remove tracked AppLauncher manifest files under `dist/applauncher-manifests/...`; restore tracked manifests and regenerate the current version manifest after builds.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `package.json`: app/package version source of truth.
- `src/App.tsx`: Library UI, lifecycle hook editing, and global Actions menu behavior.
- `src/App.test.tsx`: version assertion and UI behavior tests.
- `src/styles.css`: Library row layout for saved timestamps.
- `dist/applauncher-manifests/state-workflow-engine/1.0.6/manifest.json`: repo-local AppLauncher manifest artifact.
- `handoff.md`: current hot-context transfer document.

## 8. Next Actions

Next:

- None for the checkpoint itself.
- For new feature work, start by rereading `AGENTS.md` and this handoff.

Blocked:

- None.

Later:

- Add automated browser screenshot checks only if visual alignment keeps changing.
- Add a fuller keyboard menu model only if keyboard navigation beyond ordinary button focus becomes a requirement.
- Add direct graph editing, bulk Library export/import, or workflow runtime behavior only after separate approved plans.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as the hot-context source for current state. The repo should be on `main` at the committed `1.0.6` checkpoint with a clean working tree. Review `AGENTS.md`, `package.json`, `src/App.tsx`, `src/App.test.tsx`, `src/styles.css`, and `dist/applauncher-manifests/state-workflow-engine/1.0.6/manifest.json` before changing code. Preserve the separation between state-machine core, workflow contract layer, browser-local Library persistence, and future runtime workflow behavior. Do not load broader context unless the task clearly requires it. Run `npm run verify` before committing future changes.
