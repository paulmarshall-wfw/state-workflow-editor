# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: implementation handoff
- created timestamp in UTC: 2026-05-20T00:21:15Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: uncommitted header navigation and action-menu UI refinement on top of committed `1.0.4`

### Checkpoint Status

- Git HEAD: `f5d3824`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `src/App.tsx`
  - `src/App.test.tsx`
  - `src/styles.css`
  - `handoff.md`
- Dirty files intentionally out of scope: None
- Untracked files intentionally in scope: None
- Untracked files intentionally out of scope: None
- Canonical files described:
  - `AGENTS.md`
  - `src/App.tsx`
  - `src/App.test.tsx`
  - `src/styles.css`
  - `handoff.md`
- Last verification:
  - command: `npm run verify`
  - result: passed
  - timestamp UTC: 2026-05-20T00:21:15Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD` is the committed `1.0.4` persistence checkpoint, and every dirty file is part of the active header navigation/action-menu UI workstream. `npm run verify` passed after the layout refinement: TypeScript, 87 Vitest tests, and production build.
- Next checkpoint action: inspect the UI if desired, then commit the dirty tree when accepted.

## 2. Executive Summary

The committed baseline remains `1.0.4`: browser-local IndexedDB Library persistence, current-workspace autosave, and exact-version workflow linking are in place. The current uncommitted work changes only the editor header UI.

The page navigation labels `State Machine`, `Workflow`, `Library`, and `Settings` remain visible navigation buttons, now styled as a tab group and fixed around the center of the header on desktop. Page-specific file/save/export commands moved into right-justified dropdowns: `State Machine Actions` on the State Machine page and `Workflow Actions` on the Workflow page.

The state-machine core, workflow schema, JSON import/export formats, Library persistence model, and AppLauncher manifests were not intentionally changed.

## 3. Current Objective

Immediate goal: finish the header navigation and page-action menu refinement.

Intended finished state:

- page navigation sits visually around the center of the header on desktop
- the active page tab is visibly distinct
- `State Machine Actions` and `Workflow Actions` are right-justified
- State Machine page actions live in the State Machine dropdown
- Workflow page actions live in the Workflow dropdown
- disabled save/export behavior remains unchanged for invalid definitions
- mobile layout remains stacked and full-width

Definition of done for this workstream:

- `npm run verify` passes
- browser smoke confirms centered tabs and right-justified action dropdowns
- no schema, persistence, or runtime behavior changes are introduced
- accepted dirty tree is committed if the user asks for a checkpoint

## 4. Current State

### Working

- Header navigation is split from page actions in `src/App.tsx`.
- `ActionMenu` renders menu triggers and menu-item buttons for page-specific commands.
- State Machine menu contains:
  - `Import State Machine`
  - `Save State Machine`
  - `Export State Machine`
- Workflow menu contains:
  - `Import Workflow`
  - `Reset Workflow`
  - `Save Workflow`
  - `Export Workflow`
  - `Export Bundled Workflow`
- `src/styles.css` uses a desktop three-column header grid: brand left, tabs centered, actions right.
- The small-screen media query keeps navigation and actions stacked full-width.
- Tests in `src/App.test.tsx` now open action menus before asserting or invoking moved commands.
- Browser smoke check was performed on `http://127.0.0.1:5176/?codex-smoke=3`; the temporary dev server was stopped afterward.

### Partially Working

- The dropdown is a lightweight local component, not a full menu library. It supports click-to-open, outside-click close, disabled items, and Escape handling in app tests, but no broader keyboard roving-focus model has been added.

### Not Working Yet

- No new functionality is intentionally pending for this UI request.
- No generic workflow runtime exists; this remains out of scope.
- No lifecycle handler execution exists; this remains out of scope.

### Not Yet Verified

- No automated visual screenshot assertion was added for exact pixel alignment.
- No cross-browser visual matrix was run.
- The existing Mermaid/jsdom React `act(...)` warning still appears in one App test and remains non-failing.
- Vite still reports Mermaid-related chunk-size warnings during production build; these remain non-blocking.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Keep workflow execution semantics in target apps; this editor authors and validates contracts only.
- Do not add workflow guards, side effects, authorization, logging, jobs, retries, idempotency, or runtime orchestration to the state-machine core.
- Browser Library persistence must stay separate from exported JSON contracts.
- `schemaVersion` is file-format version.
- `definitionVersion` and `workflowVersion` are user-controlled definition versions, separate from package/app version.
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

Temporary browser-smoke port used because `5174` was already occupied:

```sh
npm run dev -- --host 127.0.0.1 --port 5176 --strictPort
```

Latest full verification:

```sh
npm run verify
```

Result: passed for `state-workflow-engine@1.0.4` at 2026-05-20T00:21:15Z. It ran TypeScript checking, 87 Vitest tests, and a Vite production build.

Note: `npm run build` can remove tracked AppLauncher manifest files under `dist/applauncher-manifests/...`; restore those tracked files from `HEAD` if they show as accidental deletions after a build. They are not part of this UI change.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `src/App.tsx`: header navigation structure and `ActionMenu` implementation.
- `src/styles.css`: centered tab layout, right-justified action menu, and mobile rules.
- `src/App.test.tsx`: menu-aware React tests for moved commands and disabled states.
- `handoff.md`: this current dirty-tree transfer document.

## 8. Next Actions

Next:

- Review the header visually if needed.
- If accepted, commit `src/App.tsx`, `src/styles.css`, `src/App.test.tsx`, and `handoff.md`.

Blocked:

- None.

Later:

- Add automated browser screenshot checks only if visual alignment keeps changing.
- Add a fuller keyboard menu model only if keyboard navigation beyond ordinary button focus becomes a requirement.
- Add direct graph editing, bulk Library export/import, or workflow runtime behavior only after separate approved plans.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as the hot-context source for current state. The repo is on `main` at `f5d3824`, with an intentional dirty tree for the header navigation/action-menu UI change. Review `AGENTS.md`, `src/App.tsx`, `src/styles.css`, and `src/App.test.tsx` before changing code. Preserve the separation between state-machine core, workflow contract layer, browser-local Library persistence, and future runtime workflow behavior. The app/package version is still `1.0.4`; state-machine schema is `0.2.0`; workflow schema is `0.5.0`. Run `npm run verify` before committing.
