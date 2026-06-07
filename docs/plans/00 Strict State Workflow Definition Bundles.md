# Strict State Workflow Definition Bundles

## Summary
Convert State Workflow Editor from split state-machine/workflow versioning to one canonical `StateWorkflowDefinitionBundle` format. New saved, exported, and imported definitions use one top-level `schemaVersion: "1.0.0"` and one top-level `definitionVersion`. The state-machine core remains project-agnostic; workflow behavior remains app-facing metadata only.

## Key Changes
- Add a bundled contract type, likely in a new `src/lib/stateWorkflowDefinition.ts`, with this canonical shape:
  - `schemaVersion: "1.0.0"`
  - `appName`
  - `id`
  - `definitionVersion`
  - `stateMachineDefinition`
  - `workflowDefinition`
- Remove independent authored versioning from the new nested exported sections. Internally, map the bundle `definitionVersion` onto existing state-machine/workflow validation models so current validators can still be reused.
- Add bundle validation that requires:
  - one supported bundle schema version
  - valid SemVer `definitionVersion`
  - valid state-machine definition
  - valid workflow definition against that state machine
  - workflow state/action/bucket/hook references matching the embedded state machine
- Keep old bundled workflow files with `embeddedStateMachineDefinition` importable, normalize them into the new strict bundle shape, and export only the new `1.0.0` format.
- Reject standalone state-machine files and linked workflow files in the strict bundle import path.

## Library And UI
- Replace split Library persistence with a canonical bundle store keyed by `stateWorkflowDefinition:(id)@(definitionVersion)`.
- Update Library UI to show saved state workflow definitions as single records with load, duplicate, and delete actions.
- Replace separate Save State Machine / Save Workflow / Save Both commands with one `Save Definition`.
- Replace separate Export State Machine / Export Workflow / Export Bundled Workflow commands with one `Export Definition`.
- Keep State Machine and Workflow editing pages, but make their save/export/import actions operate on the current bundle.
- Duplicate prompts ask for one new definition version and create one new bundled record.

## Docs And Compatibility
- Update `README.md` and `docs/json-file-formats.md` to document strict bundled JSON as the only new export format.
- Document old bundled workflow imports as compatibility-only normalization.
- Remove or rewrite docs that describe linked workflow exports and separate Library records as current behavior.
- Do not migrate arbitrary old split IndexedDB records; they are no longer canonical. Current workspace drafts can be normalized into the new bundle shape on load.

## Test Plan
- Unit-test bundle key building, validation, save/load/delete, and duplicate behavior.
- Unit-test old bundled workflow import normalization into `schemaVersion: "1.0.0"`.
- Component-test that export writes the new strict bundle shape and filename.
- Component-test that standalone state-machine and linked workflow imports are rejected.
- Component-test Library single-record save/load/duplicate/delete flows.
- Run `npm run verify`.

## Assumptions
- First strict bundle file-format version is `1.0.0`.
- Old bundled workflow files remain importable; old separate state-machine or linked workflow files do not.
- New exports never emit the old split or workflow-shaped bundled formats.
- The implementation does not add runtime execution, persistence, authorization, jobs, retries, or handler behavior to the state-machine core.
