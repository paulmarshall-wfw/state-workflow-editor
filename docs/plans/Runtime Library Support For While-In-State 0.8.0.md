# Plan: Runtime Library Support For While-In-State 0.8.0

## Summary

Update `/Users/paulmarshall/Software Development/state-workflow-runtime` so it can import and execute workflow schema `0.8.0` exports from State Workflow Editor.

Related later editor contract: after strict state workflow definition bundles were bumped to top-level `schemaVersion: "2.0.0"`, runtime import work should also apply `docs/plans/Runtime Library Support For Strict Bundle 2.0.0.md`. This document remains the workflow schema `0.8.0` scheduling plan; the strict bundle plan covers the outer editor file format, `workflowDefinition.id` to runtime `workflowId` mapping, and runtime default `variantKey: "default"`.

The editor now authors two new pieces of `while_in_state` contract metadata:

- `daily` schedules: `{ "trigger": "daily", "timeOfDay": "HH:mm" }`
- recurring run caps: `runLimit: { "maxRuns": number }` for `every_interval` and `daily`

The state-machine core should not change. This is workflow runtime lifecycle scheduling work: import validation, runtime hook contracts, due-work scheduling, recurring reschedule behavior, persistence, tests, and target-app documentation.

## Current Runtime Gap

The runtime library currently supports workflow schema `0.7.0`, while the editor now exports schema `0.8.0`.

Known runtime gaps:

- `SUPPORTED_WORKFLOW_SCHEMA_VERSION` is still `0.7.0`.
- `WorkflowStateResidentHookSchedule` only accepts `after_duration` and `every_interval`.
- Runtime import validation rejects schedule triggers other than `after_duration` and `every_interval`.
- `WorkflowLifecycleHookDefinition` does not carry `runLimit`.
- Due-time calculation is duration-only.
- Recurring reschedule currently handles `every_interval` only.
- Storage persists schedule metadata but has no per-state-residency run counter or run-limit metadata.
- Target-app docs still describe duration-only state-resident schedules.

## Contract Changes

Update runtime workflow schema support to `0.8.0`.

Extend state-resident schedule types:

```ts
type WorkflowStateResidentHookSchedule =
  | { readonly trigger: "after_duration"; readonly delayMs: number }
  | { readonly trigger: "every_interval"; readonly intervalMs: number }
  | { readonly trigger: "daily"; readonly timeOfDay: string };
```

Add runtime run-limit metadata:

```ts
interface WorkflowStateResidentHookRunLimit {
  readonly maxRuns: number;
}
```

Add `runLimit?: WorkflowStateResidentHookRunLimit` to:

- `WorkflowLifecycleHookDefinition`
- `WorkflowStateResidentLifecycleHookDefinition`
- any exported aliases used by apps or UI packages

Validation rules should match the editor:

- `daily.timeOfDay` must be 24-hour `HH:mm`.
- `runLimit.maxRuns` must be a positive integer.
- `runLimit` is valid only on recurring `while_in_state` schedules: `every_interval` and `daily`.
- `runLimit` is invalid on `after_duration` and on non-`while_in_state` hooks.
- `retryPolicy.maxAttempts` remains retry-attempt metadata for one failed scheduled execution, not a recurring run cap.

## Runtime Scheduling Semantics

Keep the existing runtime ownership boundary:

- Host apps own process wake-up and call `runtime.lifecycle.evaluateDueStateHooks(...)`.
- The runtime owns workflow-specific due-work records, leases, retries, stale-state checks, stale-definition checks, handler responses, event journaling, and recurring reschedule decisions.

Daily schedule behavior:

- Interpret `timeOfDay` as target-app local wall-clock time.
- On state entry, schedule the next occurrence of `timeOfDay`.
- If the entered-at time is before the configured time, the first due time is today.
- If the entered-at time is at or after the configured time, the first due time is tomorrow.
- On successful no-transition daily evaluation, reschedule to the next calendar-day occurrence.
- Do not create catch-up backlog after downtime unless a later approved plan changes the scheduler model.

Run-limit behavior:

- A run limit applies per state residency.
- Count scheduled execution units, not retry attempts.
- Retries for a failed execution keep the same run number.
- A successful no-transition recurring evaluation reschedules only when the current run number is below `runLimit.maxRuns`.
- When the current run number reaches `runLimit.maxRuns`, mark the work completed and do not create the next recurring due work while the item remains in that state.
- If the item leaves the target state during handler evaluation, existing supersession behavior wins.
- If the handler requests an action that leaves the state, do not reschedule.
- If a recurring hook exhausts retries, keep the existing exhausted terminal behavior unless a separate plan introduces resumed recurrence after exhaustion.

Recommended work-record model:

```ts
interface StateResidentHookWorkRecord {
  readonly schedule: WorkflowStateResidentHookSchedule;
  readonly runLimit?: WorkflowStateResidentHookRunLimit | undefined;
  readonly runNumber?: number | undefined;
}
```

Use `runNumber: 1` for the first scheduled execution in a state residency. Preserve the same `runNumber` across retries. Increment it only when creating the next recurring pending work.

## Runtime Implementation Touchpoints

Update `/Users/paulmarshall/Software Development/state-workflow-runtime/src/contracts/definition.ts`:

- Bump `SUPPORTED_WORKFLOW_SCHEMA_VERSION` to `"0.8.0"`.
- Add `daily` to `WorkflowStateResidentHookSchedule`.
- Add `WorkflowStateResidentHookRunLimit`.
- Add `runLimit` to lifecycle hook definitions.

Update `/Users/paulmarshall/Software Development/state-workflow-runtime/src/contracts/storage.ts`:

- Add optional `runLimit` and `runNumber` fields to `StateResidentHookWorkRecord`.
- Keep these fields optional for compatibility with existing stored records.

Update `/Users/paulmarshall/Software Development/state-workflow-runtime/src/definitions/import.ts`:

- Preserve `runLimit` from normalized editor and runtime bundles.
- Validate `daily.timeOfDay`.
- Validate `runLimit.maxRuns`.
- Reject unsupported run-limit placements.
- Update schedule validation error text to include `daily`.
- Keep older editor files importable through the existing normalization path.

Update `/Users/paulmarshall/Software Development/state-workflow-runtime/src/runtime/create-runtime.ts`:

- Include `hook.runLimit` and `runNumber: 1` when creating state-resident work.
- Replace duration-only `dueAtForSchedule(...)` with schedule-aware due-time calculation.
- Add `nextDueAtForRecurringSchedule(...)` for `every_interval` and `daily`.
- On successful no-transition recurring completion, check `runLimit` before rescheduling.
- Preserve existing retry, superseded, stale-definition, and exhausted behavior.

Update storage adapters:

- `/Users/paulmarshall/Software Development/state-workflow-runtime/src/storage/in-memory-adapter.ts`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/src/storage/sqlite-adapter.ts`

Required storage behavior:

- Persist `runLimit` and `runNumber`.
- Load older rows where these fields are absent.
- If SQLite requires a migration, add nullable columns or a compatible metadata field without breaking existing state-resident hook rows.

Update debugger/event projections if they expose schedule metadata:

- `/Users/paulmarshall/Software Development/state-workflow-runtime/src/debugger/headless.ts`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/packages/debugger-react/src/WorkflowDebuggerPanel.tsx`

The debugger should show enough information to understand daily schedules and capped recurring work. At minimum, event metadata should preserve `schedule`, `runLimit`, and `runNumber`.

Update app-framework/import packages if they compile against lifecycle hook types:

- `/Users/paulmarshall/Software Development/state-workflow-runtime/packages/app-framework/`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/packages/import-react/`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/packages/debugger-react/`

## Documentation Touchpoints

Update runtime docs so target apps do not need to infer behavior from editor docs:

- `/Users/paulmarshall/Software Development/state-workflow-runtime/README.md`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/docs/target-apps/README.md`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/docs/target-apps/runtime-library.md`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/docs/target-apps/workflow-runtime-app-contract.v1.md`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/docs/target-apps/app-architect-workflow-runtime-prompt.md`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/docs/plans/state-workflow-runtime.md`

Docs should state:

- Runtime schema support is `0.8.0`.
- `daily` is local target-app wall-clock time, not UTC and not cron.
- Host apps still own timer wake-up.
- Runtime owns due-work and reschedule semantics once woken.
- `runLimit.maxRuns` is per state residency and separate from retry attempts.
- Older workflow JSON files do not require immediate app-side rewrites unless the app wants to import/export the new `0.8.0` contract or use the new schedule features.

## Tests

Update `/Users/paulmarshall/Software Development/state-workflow-runtime/tests/runtime.test.ts`:

- Accept schema `0.8.0` bundles.
- Import and validate `daily` while-in-state hooks.
- Reject invalid daily times such as `24:00`, `08`, and `8:30`.
- Import and preserve `runLimit.maxRuns`.
- Reject run limits on `after_duration`.
- Reject run limits on non-`while_in_state` phases.
- Schedule first daily due time for today when the configured time has not passed.
- Schedule first daily due time for tomorrow when the configured time has passed.
- Reschedule daily hooks to the next calendar-day occurrence after successful no-transition evaluation.
- Stop recurring reschedule after `runLimit.maxRuns`.
- Confirm retry attempts do not increment the run count.
- Confirm state exit still supersedes pending recurring work.
- Confirm stale-definition behavior still marks pending work stale when active workflow selection changes.

Update package tests as needed:

- `/Users/paulmarshall/Software Development/state-workflow-runtime/packages/app-framework/tests/app-framework.test.ts`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/packages/import-react/tests/WorkflowDefinitionImportPanel.test.tsx`
- `/Users/paulmarshall/Software Development/state-workflow-runtime/packages/debugger-react/tests/WorkflowDebuggerPanel.test.tsx`

## Compatibility

Existing apps using older workflow JSON should not need a forced JSON rewrite.

Expected compatibility model:

- Existing `0.7.0` and older imports continue through normalization where the runtime already supports that import path.
- New runtime exports and normalized active bundles use `0.8.0`.
- Existing stored due-work records without `runLimit` or `runNumber` continue to load.
- Existing `after_duration` and `every_interval` behavior remains unchanged when no `runLimit` is present.
- Target apps only need behavior changes when they import `0.8.0` editor exports, use `daily`, or expect capped recurring runs.

## Verification

Run from `/Users/paulmarshall/Software Development/state-workflow-runtime` after implementation:

```bash
npm test
npm run build
```

If the runtime repo has a broader verification command at the time of implementation, run that instead of only the two commands above.

## Out Of Scope

- No state-machine core changes.
- No runtime-owned worker loop or process timer.
- No cron syntax.
- No timezone field in workflow JSON.
- No catch-up backlog after downtime.
- No app-specific handler logic.
- No forced migration of target-app workflow JSON files.
