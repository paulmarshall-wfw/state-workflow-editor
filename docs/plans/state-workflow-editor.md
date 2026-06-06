# PRD And Implementation Plan: State Workflow Editor

## PRD

### Summary
Expand the current State Machine Editor into **State Workflow Editor**, a browser-based local-first tool for authoring two linked artifacts:

- **State Machine Definition**: reusable state/transition contract owned by the state-machine core.
- **Workflow Definition**: app-facing contract that references a state-machine definition, maps named workflow actions onto valid state transitions, groups states into exported workflow buckets, and attaches optional lifecycle handler metadata.

The project should not become a generic workflow runtime yet. The next version should produce clean, validated workflow contract files that real apps can consume either at build time or runtime.

### Product Goals
- Preserve the current state-machine core boundary: states, terminal states, and legal transitions only.
- Add a second editor page for workflow action definitions.
- Let workflow definitions reference the current state-machine definition by `id` and `definitionVersion`.
- Validate workflow actions, workflow buckets, and lifecycle hooks against the selected state-machine definition.
- Export workflow definitions as separate linked JSON files, with an explicit bundled export option for portability.
- Keep runtime execution, guards, authorization, persistence, side effects, jobs, retries, and idempotency out of this phase.

### User Experience
- Rename the app header to **State Workflow Editor**.
- Add top-level navigation:
  - **State Machine**
  - **Workflow**
  - **Settings**
- Keep the existing State Machine page behavior intact.
- Add a Workflow page with:
  - workflow metadata fields
  - action list/editor
  - Actions / Buckets / Lifecycle segmented editor view
  - bucket list and state-to-bucket mapping editor
  - validation panel
  - read-only Mermaid preview showing action-labelled transitions
  - workflow JSON import/export controls
- Keep state-machine JSON import/export separate from workflow JSON import/export.

### Public Interfaces

State-machine definition remains unchanged.

Add a new workflow definition shape:

```json
{
  "schemaVersion": "0.8.0",
  "appName": "Example Project",
  "workflowVersion": "0.1.0",
  "id": "scan_job_workflow",
  "stateMachine": {
    "id": "scan_job_state",
    "definitionVersion": "0.1.0"
  },
  "actions": [
    {
      "id": "start",
      "label": "Start",
      "from": "queued",
      "to": "running"
    },
    {
      "id": "complete",
      "label": "Complete",
      "from": "running",
      "to": "completed"
    }
  ],
  "buckets": [
    {
      "id": "waiting",
      "label": "Waiting",
      "states": ["queued"]
    },
    {
      "id": "active",
      "label": "Active",
      "states": ["running", "failed"]
    },
    {
      "id": "finished",
      "label": "Finished",
      "states": ["completed", "cancelled"]
    }
  ],
  "hooks": [
    {
      "id": "before_transition_start",
      "phase": "before_transition",
      "targetType": "action",
      "targetId": "start",
      "handlerKey": "start_scan",
      "onSuccess": { "handlerKey": "start_scan_success" },
      "onFailure": { "handlerKey": "start_scan_failure" }
    },
    {
      "id": "while_in_state_failed",
      "phase": "while_in_state",
      "targetType": "state",
      "targetId": "failed",
      "handlerKey": "recheck_failed",
      "schedule": { "trigger": "every_interval", "intervalMs": 900000 },
      "runLimit": { "maxRuns": 12 },
      "retryPolicy": { "maxAttempts": 3, "delayMs": 60000 }
    }
  ]
}
```

`stateMachine.definitionVersion` is not a concatenation. It is the version number of the referenced state-machine definition. The stable linked identity is the pair `stateMachine.id` plus `stateMachine.definitionVersion`. Workflows follow the same convention: `id` and `workflowVersion` remain separate fields.

Bundled workflow exports preserve the same reference fields and add the full state-machine definition:

```json
{
  "schemaVersion": "0.8.0",
  "appName": "Example Project",
  "workflowVersion": "0.1.0",
  "id": "scan_job_workflow",
  "stateMachine": {
    "id": "scan_job_state",
    "definitionVersion": "0.1.0"
  },
  "embeddedStateMachineDefinition": {
    "schemaVersion": "0.2.0",
    "appName": "Example Project",
    "definitionVersion": "0.1.0",
    "id": "scan_job_state",
    "states": ["queued", "running", "completed", "failed", "cancelled"],
    "terminalStates": ["completed", "cancelled"],
    "transitions": [
      { "from": "queued", "to": "running" },
      { "from": "running", "to": "completed" }
    ]
  },
  "actions": [
    {
      "id": "start",
      "label": "Start",
      "from": "queued",
      "to": "running"
    }
  ],
  "buckets": [
    {
      "id": "workflow",
      "label": "Workflow",
      "states": ["queued", "running", "completed", "failed", "cancelled"]
    }
  ],
  "hooks": []
}
```

Add workflow core helpers outside the existing state-machine core boundary:

```ts
validateWorkflowDefinition(workflow, stateMachineDefinition)
defineWorkflow(workflow, stateMachineDefinition)
getAllowedActions(workflow, currentState)
getActionTargetState(workflow, actionId)
```

The workflow layer may validate action mappings and schedule metadata, including recurring run-limit metadata, but must not enforce app authorization, guards, side effects, timer execution, due-work records, persistence, retries, jobs, or idempotency.

### Validation Rules
- `schemaVersion` must match the workflow schema version.
- `appName`, `workflowVersion`, and `id` are required.
- `workflowVersion` must be numbered SemVer.
- Workflow action IDs must be lowercase snake_case.
- Action IDs must be unique.
- Action `from` and `to` must exist in the linked state-machine definition.
- Action `from -> to` must be a legal state-machine transition.
- Actions cannot start from terminal states.
- Workflow `stateMachine.id` and `stateMachine.definitionVersion` must match the loaded state-machine definition.
- Bucket IDs must be lowercase snake_case and unique.
- Bucket labels are required.
- Bucket states must exist in the linked state-machine definition.
- Buckets are optional presentation metadata. States do not need bucket assignments, and duplicate or empty bucket assignments do not affect action validity.
- Lifecycle hook IDs and handler keys must be lowercase snake_case.
- `before_transition` hooks must reference existing workflow actions.
- State lifecycle hooks must reference existing states, and `on_terminal_entry` hooks must reference terminal states.
- `while_in_state` hooks must define a valid `handlerKey` and a schedule.
- Schedules are valid only on `while_in_state` hooks.
- `after_duration` schedules must define positive-integer `delayMs`; `every_interval` schedules must define positive-integer `intervalMs`; `daily` schedules must define local target-app wall-clock `timeOfDay` in 24-hour `HH:mm` format.
- Optional recurring run limits are valid only on `every_interval` and `daily` schedules and must define positive-integer `maxRuns` per state residency.
- Optional retry policies must define positive-integer `maxAttempts` and non-negative-integer `delayMs`. Retry attempts are separate from recurring run limits.
- Duplicate lifecycle hooks for the same phase and target are invalid.

### Export Rules
- State-machine export remains:
  - `(target-project)-(definition-version)-state-specification.json`
- Workflow export uses:
  - `(target-project)-(workflow-version)-workflow-definition.json`
- Bundled workflow export uses:
  - `(target-project)-(workflow-version)-workflow-definition-bundled.json`
- Linked workflow JSON references the linked state-machine definition but does not embed it.
- Bundled workflow JSON includes both the reference and `embeddedStateMachineDefinition`.
- Linked and bundled workflow exports always include `buckets` and `hooks` arrays. If none are present, export `buckets: []` or `hooks: []`.
- Importing a linked workflow definition validates it against the currently loaded state-machine definition.
- Importing a bundled workflow validates the embedded state-machine definition and loads it when valid.
- Importing older workflow schema `0.1.0`, `0.2.0`, `0.3.0`, `0.4.0`, `0.5.0`, `0.6.0`, or `0.7.0` files upgrades them in memory to the current workflow schema. Missing `buckets` and `hooks` import as `[]`; legacy action `processing.handlerKey` values convert to `before_transition` lifecycle hooks.
- Browser-local Library workflows and current workspace drafts from older workflow schemas are upgraded in memory on load, without rewriting saved records until the user saves or duplicates them.
- Imported schedule, run-limit, and retry objects are preserved closely enough for validation to report specific unsupported trigger, duration, time, run-limit, and retry-field errors.
- The editor authors schedule metadata only. Daily times are local target-app wall-clock times; host apps own timezone, daylight-saving behavior, catch-up behavior, missed executions, timers, due-work records, retry execution, persistence, authorization, logging, jobs, and idempotency.

## Implementation Plan

### Key Changes
- Rename visible app title, browser title, README references, and tests from `State Machine Editor` to `State Workflow Editor`.
- Replace `activePage: "editor" | "settings"` with explicit pages:
  - `"state-machine"`
  - `"workflow"`
  - `"settings"`
- Preserve the existing state-machine editor as the **State Machine** page.
- Add workflow state and initial sample workflow derived from the initial state-machine definition.
- Add `src/lib/workflow.ts` for workflow types, validation, and helper APIs.
- Keep `src/lib/stateMachine.ts` unchanged except for exports if needed through `src/lib/index.ts`.

### Workflow Page
- Add metadata fields:
  - Target Project
  - Workflow Version
  - Workflow ID
  - Linked State Machine ID/version shown read-only from the current state-machine definition
- Add actions column/list:
  - Action ID
  - Label
  - From state selector
  - To state selector
  - Remove action
  - Add action
- Add buckets view:
  - Bucket list with one editable name field per bucket plus add/remove controls
  - State mapping pane showing only states assigned to the selected bucket
  - Add State action that creates a draft dropdown row listing all states
  - Row-level Remove action that removes the state from the selected bucket and leaves it unassigned until mapped again
  - Retained workflow Mermaid preview pane
- Add lifecycle view:
  - Hook list grouped by before-transition, state-entry, while-in-state, and terminal-entry phases
  - Hook detail editor for target, main handler key, success handler key, failure handler key, while-in-state schedule, daily time, and optional recurring run limit
  - Action rows show a compact lifecycle indicator when a before-transition hook exists
- Add validation panel specific to workflow definitions.
- Add Mermaid workflow preview using action labels on edges, and in Buckets view distinguish the selected bucket's states with solid boundaries while other states use dotted boundaries. Edge example:
  - `queued -->|start| running`
- Disable workflow export when either the state-machine definition or workflow definition is invalid.

### Import/Export
- Keep state-machine import/export buttons scoped to the State Machine page.
- Add workflow import/export buttons scoped to the Workflow page.
- Workflow import validates against the current state-machine definition.
- If a workflow references a different state-machine ID/version, show a validation error rather than silently changing the loaded state machine.
- Workflow import accepts bundled definitions with `embeddedStateMachineDefinition`; when present, validate the embedded definition against the workflow reference and load it with the workflow.
- Workflow export includes two explicit commands: linked export and bundled export.

### Documentation
- Update README with the new product name, page model, and two-artifact definition model.
- Add a new PRD or update the existing PRD to describe the expanded State Workflow Editor.
- Refresh `handoff.md` after implementation with dirty files, verification, and current behavior.

### Test Plan
- Add workflow core tests for:
  - valid workflow definition
  - missing metadata
  - duplicate action IDs
  - invalid action ID format
  - unknown action states
  - action mapping not allowed by state machine
  - action from terminal state
  - linked state-machine mismatch
  - invalid embedded state machine
  - embedded state-machine reference mismatch
  - allowed action lookup
- Add app tests for:
  - app title changed to `State Workflow Editor`
  - navigation between State Machine, Workflow, and Settings
  - workflow page renders current linked state-machine metadata
  - adding/editing/removing workflow actions
	  - adding/editing/removing workflow buckets
	  - adding/editing/removing workflow lifecycle hooks
	  - assigning, removing, and exporting optional workflow bucket overlays
  - workflow validation blocks export
  - linked workflow import/export uses the new workflow filename rule
  - bundled workflow import/export uses the bundled filename rule and embedded definition
  - Mermaid workflow preview includes action-labelled directed transitions and bucket-focused boundary styling in Buckets view
- Run `npm run verify`.

## Assumptions
- The default workflow definition is a **separate linked file**; bundled export is an explicit second option.
- The first workflow layer is a contract/editor layer, not a runtime execution engine.
- Apps may choose build-time or runtime ingestion later; this project only produces validated artifacts for either path.
- State-machine schema remains `0.3.0`; workflow schema is `0.8.0` after adding daily `while_in_state` schedules and optional recurring run limits as app-processing contract metadata.
- The current repo stays local-first with file import/export only.
