# Handoff

## 1. Metadata

- project name: State Workflow Editor
- handoff type: implementation handoff
- created timestamp in UTC: 2026-05-29T19:58:21Z
- prepared by: Codex
- repository, workspace, or folder: `/Users/paulmarshall/Software Development/state-workflow-engine`
- branch or working context: `main`
- session scope: fixed the imported-lifecycle repair path so invalid non-`while_in_state` retry metadata can be cleared in the editor, added a regression test, and refreshed the handoff to the new checkpoint.

### Checkpoint Status

- Git HEAD: `0caf036`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - None
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `src/App.tsx`
  - `src/App.test.tsx`
  - `src/lib/workflow.ts`
  - `src/lib/workflow.test.ts`
  - `handoff.md`
- Last verification:
  - command: `npm test -- --run src/App.test.tsx`
  - result: passed
  - timestamp UTC: 2026-05-29T18:02Z
- Handoff freshness: `fresh-to-dirty-tree`
- Safe-to-continue basis: commit `0caf036` contains the imported-retry repair fix, the only intentional dirty file is this handoff refresh, and the focused app and workflow test suites both passed in this session.
- Next checkpoint action: run broader verification before the next code checkpoint, or commit this handoff if no further code changes are needed.

## 2. Executive Summary

The current focus is the workflow-schema repair path around lifecycle retry metadata. The repo already rejected `retryPolicy` on non-`while_in_state` hooks, but imported invalid workflows could still load for repair; the new fix makes that repair path usable by showing retry inputs whenever imported unsupported retry metadata is present, so the user can clear it and re-export a valid workflow.

Complete now:

- `src/lib/workflow.ts` rejects retry metadata on non-`while_in_state` hooks.
- `src/App.tsx` still hides retry controls for normal non-`while_in_state` authoring, but now shows them when an imported hook already carries `retryPolicy`.
- `src/App.test.tsx` includes a regression test that imports invalid retry metadata, confirms the validation issue, clears both retry fields, and restores exportability.
- Focused tests passed for both the app lifecycle UI path and the workflow validator suite.

Incomplete now:

- `npm run lint`, `npm run build`, and full `npm run verify` were not rerun in this session.
- No browser smoke test was run after the imported-retry repair fix.
- The existing Mermaid React `act(...)` warning still appears during the app test suite and was not addressed here.

Safe to continue: yes, from committed code at `0caf036`. The only remaining dirty state should be this handoff update until it is committed or rewritten again.

No `project-dossier.md` exists or is needed for the current scope.

## 3. Current Objective

Immediate goal: continue from the committed imported-retry repair fix without widening the workflow/runtime boundary.

Intended finished state: imported workflow files that carry unsupported retry metadata can be loaded, validated, repaired in the editor, and re-exported cleanly, while new authoring still restricts retry controls to legitimate `while_in_state` hooks.

Definition of done: keep validator, editor behavior, tests, and docs aligned; run `npm run verify` before the next code checkpoint; refresh `handoff.md` if the repo checkpoint changes again.

## 4. Current State

### Working

- State-machine core remains project-agnostic.
- Workflow schema remains `0.6.0`.
- Validator rejects `retryPolicy` on non-`while_in_state` hooks.
- Imported invalid retry metadata can now be cleared from the lifecycle editor without deleting the whole hook.
- Existing imports with lifecycle schedule or retry validation issues can still load for repair.

### Partially Working

- Import normalization preserves malformed schedule or retry objects closely enough for validation to report specific errors instead of silently dropping them.
- Focused lifecycle-hook test coverage is good, but broader verification has not been rerun after the latest commit.

### Not Working Yet

- No runtime timer, due-work, retry execution, job orchestration, handler execution, persistence, authorization, logging, or idempotency behavior exists in this repo.
- No external target-app normalizer has been updated here to enforce the stricter retry-policy contract downstream.

### Not Yet Verified

- `npm run lint`, `npm run build`, and full `npm run verify` were not rerun after commit `0caf036`.
- No browser smoke test was run after the imported-retry repair UI change.
- Existing Mermaid React `act(...)` warning still appears in app tests and was not addressed in this session.

## 5. Active Constraints

- Keep the state-machine core project-agnostic.
- Keep workflow actions, guards, side effects, authorization, persistence, logging, jobs, retries, idempotency, and runtime orchestration out of the state-machine core unless a later approved plan changes the boundary.
- The visual editor may author state-machine and workflow definitions, but it must not turn the state-machine layer into the workflow layer.
- `while_in_state` schedule and retry metadata are authoring-time contract metadata only; the editor does not execute timers or retries.
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
npm test -- --run src/App.test.tsx
npm test -- --run src/lib/workflow.test.ts
```

Results: both passed on 2026-05-29 around 18:02Z. The app suite still emits the existing Mermaid React `act(...)` warning, but the lifecycle repair regression test passes.

Handoff verifier:

```sh
python3 "/Users/paulmarshall/Software Development/All Skills/handoff/scripts/verify_handoff_freshness.py" handoff.md
```

Expected result after this handoff refresh: `fresh-to-dirty-tree`.

## 7. Files to Open First

- `AGENTS.md`: repo-local standards and state/workflow boundary constraints.
- `src/App.tsx`: lifecycle hook editing UI, including imported retry repair behavior.
- `src/App.test.tsx`: regression coverage for imported invalid retry metadata.
- `src/lib/workflow.ts`: workflow schema and lifecycle validation rules.
- `src/lib/workflow.test.ts`: validator coverage for retry restrictions.

## 8. Next Actions

Next:

- Run `npm run verify` before the next code checkpoint.
- If another workflow-schema change is made, keep validator, editor, docs, and tests aligned in the same session.

Blocked:

- None.

Later:

- Decide whether the Mermaid React `act(...)` warning is worth a separate test-hygiene pass.
- Update downstream target apps, such as FileCatalog, if they need to enforce or consume the stricter retry-policy contract.

## 9. Ready-Made Prompt for Starting a New Thread

Read `handoff.md` as hot context. The repo is on `main` at `0caf036`, with only `handoff.md` intentionally dirty after the handoff refresh. Open `AGENTS.md`, `src/App.tsx`, `src/App.test.tsx`, `src/lib/workflow.ts`, and `src/lib/workflow.test.ts`. Preserve the boundary that the editor authors workflow metadata only; host apps own timers, due-work records, retries, jobs, persistence, authorization, logging, and idempotency. Run `npm run verify` before the next code checkpoint.
