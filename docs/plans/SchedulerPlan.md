# State Workflow Editor Schedule Support Plan

## Summary

Add first-class schedule authoring, validation, import, export, and documentation support for `while_in_state` lifecycle hooks in `/Users/paulmarshall/Software Development/state-workflow-engine`.

The editor remains an authoring tool only. It will not run timers, evaluate due hooks, create runtime due-work records, or backfill target-app data. It will export enough schedule metadata for target apps such as FileCatalog to normalize into `state-workflow-runtime` lifecycle hook definitions.

Decision: bump the workflow export schema from `0.5.0` to `0.6.0`, because `while_in_state` changes from handler-only metadata into a scheduled lifecycle contract. Legacy `0.5.0` imports remain supported and are upgraded in memory.

## Public Contract Changes

- Extend workflow lifecycle hook JSON for `while_in_state` only:

```json
{
  "id": "while_in_state_unsupported",
  "phase": "while_in_state",
  "targetType": "state",
  "targetId": "unsupported",
  "handlerKey": "recheck_file_type_support",
  "schedule": { "trigger": "every_interval", "intervalMs": 900000 },
  "retryPolicy": { "maxAttempts": 3, "delayMs": 60000 }
}
```

- Add schedule shapes:
  - `{ "trigger": "after_duration", "delayMs": number }`
  - `{ "trigger": "every_interval", "intervalMs": number }`
- Durations must be positive integers in milliseconds.
- A scheduled hook must include a valid `handlerKey`; a schedule without a handler is invalid because host apps would have no handler to evaluate.
- Add optional retry policy:
  - `{ "maxAttempts": number, "delayMs": number }`
  - `maxAttempts` must be a positive integer.
  - `delayMs` must be a non-negative integer.
- Do not allow `schedule` on `before_transition`, `on_state_entry`, or `on_terminal_entry`.
- Keep existing `handlerKey`, `onSuccess`, and `onFailure` fields unchanged.
- Exports use `schemaVersion: "0.6.0"` for linked and bundled workflow definitions.

## Implementation Changes

- Update workflow types and validation in `/Users/paulmarshall/Software Development/state-workflow-engine/src/lib/workflow.ts`:
  - Add `WorkflowLifecycleHookSchedule` and `WorkflowLifecycleHookRetryPolicy`.
  - Extend `WorkflowLifecycleHook` with optional `schedule` and `retryPolicy`.
  - Add validation codes for missing schedule, invalid schedule trigger, invalid duration, invalid retry policy, and schedule on unsupported phase.
  - Preserve duplicate hook detection by phase, target type, and target ID.
  - Ensure `defineWorkflow` deep-copies `schedule` and `retryPolicy`.

- Update import normalization in `/Users/paulmarshall/Software Development/state-workflow-engine/src/App.tsx`:
  - Accept legacy schema versions `0.1.0` through `0.5.0` and normalize to `0.6.0`.
  - Preserve imported `schedule` and `retryPolicy` objects closely enough for validation to explain unsupported triggers, invalid durations, and invalid retry fields instead of silently dropping them into generic missing-field errors.
  - Do not silently invent schedules for imported `while_in_state` hooks. Missing schedules should load visibly and fail workflow validation until the author chooses one.
  - Continue converting legacy `action.processing.handlerKey` to `before_transition` hooks without schedules.

- Update browser-local Library/current workspace loading in `/Users/paulmarshall/Software Development/state-workflow-engine/src/App.tsx`:
  - Normalize saved `0.1.0` through `0.5.0` workflow definitions to `0.6.0` when loading the current workspace draft.
  - Normalize saved `0.1.0` through `0.5.0` workflow definitions when loading or duplicating workflows from the Library.
  - Do not mutate saved Library records just by loading them; write the upgraded schema only when the user saves or duplicates the workflow.

- Update Lifecycle UI:
  - In the Hook Details panel, show schedule controls only when `phase === "while_in_state"`.
  - Provide a trigger control for `after_duration` vs `every_interval`.
  - Provide a numeric duration input plus unit selector for seconds, minutes, and hours; store/export milliseconds.
  - Default a newly added `while_in_state` hook to `{ "trigger": "every_interval", "intervalMs": 900000 }`.
  - Provide optional retry controls in the same Hook Details form: max attempts and retry delay, with empty fields meaning no explicit retry policy.
  - Show lifecycle row status as invalid when a `while_in_state` hook lacks a valid schedule.
  - Keep the existing compact panel style; do not add a landing page, runtime worker controls, or explanatory in-app text.

- Update docs:
  - Update `/Users/paulmarshall/Software Development/state-workflow-engine/docs/json-file-formats.md` with schema `0.6.0`, schedule field tables, validation rules, import behavior, and a FileCatalog-style `while_in_state` example.
  - Update `/Users/paulmarshall/Software Development/state-workflow-engine/README.md` lifecycle/export examples so target apps see the scheduled hook shape.
  - Update `/Users/paulmarshall/Software Development/state-workflow-engine/docs/plans/state-workflow-editor.md` so the architectural plan no longer describes `while_in_state` as handler-only metadata.
  - Explicitly state in docs that host apps own timers and runtime evaluation; the editor only authors schedule metadata.

## Test Plan

- Unit tests in `/Users/paulmarshall/Software Development/state-workflow-engine/src/lib/workflow.test.ts`:
  - Accept valid `while_in_state` hooks with `after_duration` and `every_interval`.
  - Reject missing schedule, unsupported trigger, non-positive duration, non-integer duration, schedule on non-`while_in_state`, scheduled hooks without `handlerKey`, invalid `maxAttempts`, and invalid `retryPolicy.delayMs`.
  - Confirm existing `before_transition`, `on_state_entry`, and `on_terminal_entry` behavior remains unchanged.
  - Confirm `defineWorkflow` preserves copied schedule and retry policy data.

- App tests in `/Users/paulmarshall/Software Development/state-workflow-engine/src/App.test.tsx`:
  - Adding a `while_in_state` hook creates the default 15-minute interval schedule.
  - Editing trigger, duration, unit, retry attempts, and retry delay updates exported JSON.
  - Linked and bundled exports both include `schemaVersion: "0.6.0"` and preserve schedule fields.
  - Importing a scheduled hook round-trips through export unchanged.
  - Importing a legacy unscheduled `while_in_state` hook shows validation issues and disables workflow export.
  - Importing a scheduled hook with invalid schedule fields preserves enough data for the validation message to identify the invalid field.
  - Loading a saved current workspace draft and a saved Library workflow with schema `0.5.0` upgrades them to `0.6.0` in memory.
  - Existing lifecycle hook ID regeneration and legacy `processing.handlerKey` migration still pass.

- Verification:
  - Run `npm run verify` from `/Users/paulmarshall/Software Development/state-workflow-engine`.
  - Manually smoke test the Lifecycle view with a FileCatalog-style hook: `while_in_state_unsupported`, `targetId: "unsupported"`, `handlerKey: "recheck_file_type_support"`, `every_interval`, `900000`.

## Assumptions

- The editor project is `/Users/paulmarshall/Software Development/state-workflow-engine`.
- The editor package remains private; no version bump, release, Docker work, or publishing is included unless requested separately.
- Target apps will update their normalizers to accept workflow schema `0.6.0`.
- FileCatalog’s desired safety-net schedule is `every_interval` with `intervalMs: 900000`.
- The editor does not implement FileCatalog’s app-owned unsupported-item recheck routine; it only enables the workflow JSON needed for that integration.
