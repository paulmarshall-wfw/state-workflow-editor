# Workflow Model Reconciliation And Reset

## Summary

Adopt this invariant: if a workflow item is no longer backed by the current state-machine states or transitions, it must not remain in the workflow model. Add automatic reconciliation for routine stale-data cleanup, plus a separate explicit “Reset Workflow” command for intentionally starting the workflow layer over.

## Key Changes

- Add a workflow reconciliation step that runs whenever the loaded state machine changes or a workflow is imported.
- Reconcile `workflow.states` to exactly match current state-machine states, preserving existing visibility for matching states and defaulting new states to visible.
- Remove workflow actions whose `from` or `to` states no longer exist, or whose `from -> to` transition is no longer legal in the current state machine.
- Reconcile bucket state assignments by removing unknown states from buckets while preserving valid assignments, empty buckets, duplicate assignments, and missing assignments.
- Do not auto-assign newly added states to buckets during reconciliation; buckets are optional presentation metadata.
- Keep user-defined bucket records unless the bucket itself is removed by the user; empty buckets may exist as intentional draft structure.
- Add a “Reset Workflow” command that rebuilds the workflow layer from the current state machine: current app name, workflow id/version retained; workflow states regenerated; actions cleared; buckets reset to one visible default bucket containing all current states.
- Update validation so it reflects this canonical reconciled workflow model, not stale imported/default state.

## UI Behavior

- Place “Reset Workflow” near the Workflow import/export controls as a destructive secondary action.
- Require confirmation before reset, with copy that makes clear it removes workflow actions and bucket structure but keeps the state machine.
- When automatic reconciliation removes stale data, show a concise status message such as: `Workflow synced to current state machine. Removed 5 stale actions and added 8 state entries.`
- When reset completes, show: `Workflow reset from current state machine.`
- Keep existing manual remove controls for actions, buckets, and bucket state assignments.

## Test Plan

- Import a new state machine over the default workflow and confirm old `queued/running/cancelled` metadata and actions are removed.
- Confirm all current state-machine states get workflow state metadata.
- Confirm valid existing actions and bucket assignments survive reconciliation.
- Remove a state-machine transition and confirm actions for that transition are removed.
- Add a new state-machine state and confirm it appears in workflow metadata without requiring a bucket assignment.
- Use “Reset Workflow” and confirm actions are cleared, one default bucket contains all current states, workflow state metadata matches the state machine, and workflow id/version/app name are retained.
- Verify Workflow Validation issue count updates immediately after import, state-machine edits, and reset.

## Assumptions

- The state machine remains the source of truth for states and legal transitions.
- Workflow actions are valid only when backed by a current legal state-machine transition.
- Buckets are user-authored presentation structure, so empty buckets are allowed during normal editing and should not be auto-deleted.
- “Reset Workflow” intentionally discards workflow actions and bucket structure, but does not change the state machine definition.
