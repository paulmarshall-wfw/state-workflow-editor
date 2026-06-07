# Plan: Runtime Library Support For Strict Bundle 2.0.0

## Summary

Update `/Users/paulmarshall/Software Development/state-workflow-runtime` so it can import State Workflow Editor strict state workflow definition bundles with top-level `schemaVersion: "2.0.0"`.

The editor's `2.0.0` bundle shape is:

- `schemaVersion`
- `appName`
- `id`
- `definitionVersion`
- `stateMachineDefinition`
- `workflowDefinition`

The field shape is intentionally the same strict bundle shape introduced in `1.0.0`; the current version bump marks this as the runtime-facing bundle contract. Strict `1.0.0` bundles remain compatibility input and should normalize forward. Old bundled workflow files with `embeddedStateMachineDefinition` remain editor compatibility input, but the runtime should prefer the strict `2.0.0` bundle as the active import contract.

## Runtime Contract

The runtime importer should accept strict bundle `schemaVersion: "2.0.0"` and normalize it into the runtime's active workflow definition model.

Mapping rules:

- Use top-level `appName` as the imported app name.
- Use top-level `id` as the state-machine definition ID.
- Use top-level `definitionVersion` as the shared definition version for the state-machine and workflow validator models.
- Use `workflowDefinition.id` as the runtime `workflowId`.
- Default runtime `variantKey` to `"default"`; it is not exported by the editor.
- Reconstruct the runtime's state-machine reference from top-level `id` and `definitionVersion`.
- Do not expect nested `stateMachineDefinition.schemaVersion`, `stateMachineDefinition.appName`, or `stateMachineDefinition.definitionVersion`.
- Do not expect nested `workflowDefinition.schemaVersion`, `workflowDefinition.appName`, `workflowDefinition.workflowVersion`, `workflowDefinition.stateMachine`, or `workflowDefinition.embeddedStateMachineDefinition`.

Workflow schema semantics remain `0.8.0`:

- actions preserve durable action IDs, labels, `trigger`, and `visible`
- buckets preserve labels, visibility, and state assignments
- hooks preserve lifecycle phase, target, main handler key, `schedule`, `runLimit`, `retryPolicy`, `onSuccess`, and `onFailure`
- `daily` `while_in_state` schedules use target-app local wall-clock `HH:mm`
- `runLimit.maxRuns` is per state residency and separate from retry attempts

## Runtime Implementation Touchpoints

Update `/Users/paulmarshall/Software Development/state-workflow-runtime/src/contracts/definition.ts`:

- Add a strict state workflow definition bundle input type for schema `2.0.0`.
- Keep workflow schema support at `0.8.0`; do not treat the bundle schema as the workflow schema.
- Represent nested state-machine and workflow sections without the stripped metadata fields listed above.

Update `/Users/paulmarshall/Software Development/state-workflow-runtime/src/definitions/import.ts`:

- Accept strict `2.0.0` bundles as the preferred editor export format.
- Accept strict `1.0.0` bundles as compatibility input and normalize them into the same active runtime model as `2.0.0`.
- Build validator-compatible state-machine and workflow records from the strict bundle before applying existing workflow validation.
- Preserve all workflow `0.8.0` metadata when projecting hooks, actions, buckets, and workflow state visibility.
- Reject standalone state-machine files and old linked workflow files in the strict bundle import path unless a separate legacy import path already handles them deliberately.

Update runtime active-bundle selection/storage code:

- Persist the active runtime workflow ID from `workflowDefinition.id`.
- Persist or derive `variantKey: "default"` when the imported bundle does not provide one.
- Keep existing active workflow selection behavior for target apps that already supply a variant key through runtime-owned configuration.
- Do not write `variantKey` back into editor-exported JSON.

Update debugger/event projections if they display definition identity:

- Show both state-machine definition identity (`id` + `definitionVersion`) and runtime workflow identity (`workflowDefinition.id` mapped to `workflowId`).
- Keep the bundle schema version visible separately from workflow schema `0.8.0` when useful for debugging imports.

## Runtime Documentation Touchpoints

Update these runtime repo docs so target apps do not have to infer strict bundle behavior from editor docs:

- `/Users/paulmarshall/Software Development/state-workflow-runtime/README.md`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/docs/target-apps/README.md`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/docs/target-apps/runtime-library.md`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/docs/target-apps/workflow-runtime-app-contract.v1.md`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/docs/target-apps/app-architect-workflow-runtime-prompt.md`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/docs/plans/state-workflow-runtime.md`

Docs should state:

- Editor strict bundle schema `2.0.0` is the preferred import shape.
- Strict `1.0.0` bundles are compatibility input only.
- Bundle schema `2.0.0` is not the same as workflow schema `0.8.0`.
- `workflowDefinition.id` becomes runtime `workflowId`.
- Runtime `variantKey` defaults to `"default"` and remains runtime-owned.
- The editor does not export handlers, jobs, due-work records, authorization, persistence, logging, retries, idempotency, or runtime state.

## Tests

Update runtime import tests:

- Import a strict `2.0.0` bundle and confirm the active runtime workflow ID comes from `workflowDefinition.id`.
- Import a strict `1.0.0` bundle and confirm it normalizes to the same runtime model.
- Confirm top-level `id` is used for the state-machine definition identity, not for `workflowId`.
- Confirm missing nested metadata fields are accepted and reconstructed only for validation.
- Confirm `variantKey` defaults to `"default"` when absent.
- Confirm workflow `0.8.0` fields survive import: actions, buckets, hooks, daily schedules, `runLimit`, `retryPolicy`, `onSuccess`, and `onFailure`.
- Reject unsupported bundle schema versions with a clear import error.
- Reject strict bundles whose nested state-machine ID conflicts with top-level `id`.

Update package tests as needed:

- `/Users/paulmarshall/Software Development/state-workflow-runtime/packages/app-framework/tests/app-framework.test.ts`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/packages/import-react/tests/WorkflowDefinitionImportPanel.test.tsx`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/packages/debugger-react/tests/WorkflowDebuggerPanel.test.tsx`

## Compatibility

- Existing runtime imports of older workflow JSON should continue through any existing legacy path.
- Strict `1.0.0` bundles should not require manual target-app rewrites.
- New editor exports always use strict `2.0.0`.
- Existing active runtime records should not need migration unless they persist the old assumption that bundle top-level `id` is the runtime workflow ID.
- Target apps that store `variantKey` explicitly may keep doing so; the default applies only when editor-imported JSON does not supply runtime variant metadata.

## Verification

Run from `/Users/paulmarshall/Software Development/state-workflow-runtime` after implementation:

```bash
npm run verify
```

If `npm run verify` is unavailable at implementation time, run the runtime repo's documented typecheck, test, and build commands.

## Out Of Scope

- No state-machine core changes.
- No bundle field-shape change beyond accepting schema `2.0.0`.
- No runtime-owned worker loop or process timer.
- No editor export of `variantKey`.
- No app-specific handler logic.
- No forced rewrite of target-app workflow JSON files.
