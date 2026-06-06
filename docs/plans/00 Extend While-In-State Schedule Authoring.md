# Plan: Extend While-In-State Schedule Authoring

## Summary
Add daily and capped-run schedule metadata for `while_in_state` lifecycle hooks in State Workflow Editor. This remains contract authoring only: the editor validates, imports, exports, and documents the metadata, while host apps own timers, due-work records, retries, persistence, and execution.

## Key Changes
- Bump workflow schema from `0.7.0` to `0.8.0` because the exported lifecycle schedule contract changes.
- Extend `WorkflowLifecycleHookSchedule`:
  - Existing: `{ "trigger": "after_duration", "delayMs": number }`
  - Existing: `{ "trigger": "every_interval", "intervalMs": number }`
  - New: `{ "trigger": "daily", "timeOfDay": "HH:mm" }`
- Add optional recurring run cap metadata on `while_in_state` hooks:
  - `runLimit?: { "maxRuns": number }`
  - Semantics: per state residency, cap scheduled handler executions after state entry, then stop while the item remains in that state.
  - Valid only for recurring schedules: `every_interval` and `daily`.
  - It is separate from `retryPolicy.maxAttempts`, which still means retry attempts for a failed scheduled execution.

## Implementation Changes
- Update workflow validation to accept `daily`, validate `timeOfDay` as 24-hour `HH:mm`, validate positive-integer `runLimit.maxRuns`, and report clear validation errors for unsupported/malformed run limits.
- Preserve imported schedule and run-limit objects closely enough for repair-path validation, matching the current behavior for invalid schedules and retry policies.
- Update the Lifecycle hook details UI:
  - Schedule Trigger options: `Every Interval`, `After Duration`, `Daily`.
  - Show duration amount/unit only for `Every Interval` and `After Duration`.
  - Show a native time input for `Daily`, storing local target-app wall-clock time as `HH:mm` without timezone.
  - Show run-limit controls only for recurring schedules, with an unbounded default and optional “Stop after N runs” number input.
- Keep the default new `while_in_state` hook schedule as the existing 15-minute `every_interval`; daily and run limit are explicit author choices.

## Docs
- Update `README.md`, `docs/json-file-formats.md`, and `docs/plans/state-workflow-editor.md` with schema `0.8.0`, the new `daily` shape, the `runLimit` shape, import/validation behavior, and the editor/runtime boundary.
- Document daily time as local target-app time; target apps decide timezone, DST behavior, catch-up behavior, missed executions, and scheduler persistence.

## Test Plan
- Add validation tests for valid daily schedules, invalid daily times, valid recurring run limits, invalid run limits, and run limits on unsupported schedules.
- Add editor tests for adding a daily hook, selecting a time, exporting linked/bundled workflow JSON, and preserving the daily schedule on import.
- Add editor tests for interval hooks with “Stop after N runs” and for imported invalid run-limit repair behavior.
- Regression-check existing schedule behavior: 15-minute default, seconds/minutes/hours conversion, retry controls, legacy import upgrades, and invalid imported schedule preservation.
- Run `npm test`, `npm run lint`, and `npm run build`.

## Assumptions
- “Specific number of times” means a per-state-residency cap on scheduled executions.
- Daily time is exported as local target-app wall-clock `HH:mm`; no timezone field is added.
- This repo does not implement runtime scheduling or hook execution.
