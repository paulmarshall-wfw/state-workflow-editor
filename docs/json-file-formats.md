# JSON File Formats

This document defines the JSON files imported and exported by State Workflow Editor.

Current new export format:

- State workflow definition bundle: `schemaVersion: "1.0.0"`

The editor no longer exports standalone state-machine files, linked workflow files, or old `embeddedStateMachineDefinition` bundled workflow files. Old bundled workflow files remain importable as compatibility-only input and are normalized in memory into the strict `1.0.0` bundle shape.

## File Type

| File type | Export button | Filename pattern | Normal export includes |
| --- | --- | --- | --- |
| State workflow definition bundle | Export Definition | `(target-app)-(definition-version)-state-workflow-definition.json` | One state-machine definition section plus one workflow definition section |

All export paths write formatted JSON with a trailing newline. The editor uses the File System Access API when available and falls back to a browser download.

Browser-local Library storage uses IndexedDB records keyed from definition IDs and versions, but those storage keys are not part of exported JSON.

## Common Rules

- IDs use lowercase letters, numbers, and underscores, and must start with a lowercase letter.
- Action IDs use lowercase dotted identifier segments, such as `memo.accept`.
- `definitionVersion` must be a numbered SemVer value such as `0.1.0`.
- Target app names are exported in `appName`.
- The app does not export local folder paths, browser file handles, app settings, logo URL, theme, runtime state, work items, logs, jobs, authorization, persistence, or handler implementations.

## Strict Bundle Shape

```json
{
  "schemaVersion": "1.0.0",
  "appName": "Example App",
  "id": "scan_job_state",
  "definitionVersion": "0.1.0",
  "stateMachineDefinition": {
    "id": "scan_job_state",
    "states": ["queued", "running", "completed", "failed", "cancelled"],
    "entryStates": ["queued"],
    "terminalStates": ["completed", "cancelled"],
    "transitions": [
      { "from": "queued", "to": "running" },
      { "from": "running", "to": "completed" },
      { "from": "running", "to": "failed" },
      { "from": "running", "to": "cancelled" }
    ]
  },
  "workflowDefinition": {
    "id": "scan_job_workflow",
    "states": [
      { "id": "queued", "visible": true },
      { "id": "running", "visible": true },
      { "id": "completed", "visible": true },
      { "id": "failed", "visible": false },
      { "id": "cancelled", "visible": true }
    ],
    "actions": [
      {
        "id": "scan.start",
        "label": "Start",
        "from": "queued",
        "to": "running",
        "trigger": "user",
        "visible": true
      }
    ],
    "buckets": [
      {
        "id": "active",
        "label": "Active",
        "visible": true,
        "states": ["running", "failed"]
      }
    ],
    "hooks": [
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
}
```

The top-level `definitionVersion` is the only authored version in the exported JSON. The nested `stateMachineDefinition` and `workflowDefinition` sections do not include their own `schemaVersion`, `definitionVersion`, `workflowVersion`, `stateMachine`, or `embeddedStateMachineDefinition` fields. Internally, the editor maps the bundle version onto the existing state-machine and workflow validators.

## State-Machine Section

State-machine definitions are the project-agnostic core contract. They define only valid states, nominated entry states, terminal states, and legal state-to-state transitions.

| Field | Required | Description |
| --- | --- | --- |
| `id` | Yes | Stable state-machine definition ID. Must match top-level `id`. |
| `states` | Yes | Ordered list of state IDs. Must contain at least one state. |
| `entryStates` | Yes | State IDs nominated as valid creation or start states for target-app use. Empty arrays are valid. |
| `terminalStates` | Yes | State IDs that have no outgoing transitions. Each must exist in `states`. |
| `transitions` | Yes | Legal transitions between states. Each `from` and `to` must exist in `states`. |

Validation rules:

- State IDs must be lowercase snake_case identifiers and unique.
- Entry and terminal states must be listed in `states`.
- Transitions must reference known states and must be unique.
- Terminal states cannot have outgoing transitions.

`entryStates` are metadata only. They do not imply runtime record creation behavior, guards, authorization, persistence, or transition execution.

## Workflow Section

Workflow definitions are app-facing metadata validated against the embedded state-machine section.

| Field | Required | Description |
| --- | --- | --- |
| `id` | Yes | Stable workflow definition ID. |
| `states` | Yes | One workflow presentation entry for every state in the state-machine section. |
| `actions` | Yes | Named actions mapped to legal state-machine transitions. |
| `buckets` | Yes | Optional presentation groups. Exported as `[]` when no buckets exist. |
| `hooks` | Yes | Optional lifecycle handler metadata. Exported as `[]` when no hooks exist. |

### Workflow State Presentation

```json
{ "id": "queued", "visible": true }
```

- `id` must reference a state in the state-machine section.
- Every state-machine state must have one workflow state presentation entry.
- `visible` controls presentation only. Hidden states remain valid workflow states.

### Actions

```json
{
  "id": "scan.start",
  "label": "Start",
  "from": "queued",
  "to": "running",
  "trigger": "user",
  "visible": true
}
```

- `id` must be unique and use lowercase dotted identifier segments.
- `label` is required and is the visible button text.
- `from` and `to` must exist in the state-machine section.
- `from -> to` must be a legal transition.
- Actions cannot start from terminal states.
- `trigger` must be `"user"` or `"automatic"`.
- User-triggered actions must be visible.
- Automatic actions must be hidden from user controls.
- Action-level `processing` and handler keys are not part of the current export shape.

### Buckets

```json
{
  "id": "active",
  "label": "Active",
  "visible": true,
  "states": ["running", "failed"]
}
```

- `id` must be unique and lowercase snake_case.
- `label` is required.
- `visible` controls presentation only.
- `states` entries must exist in the state-machine section.
- Buckets are optional presentation metadata. Empty buckets, partial assignments, and duplicate state assignments across buckets do not affect action validity.

### Lifecycle Hooks

Lifecycle hooks are optional app-processing metadata. The editor validates and exports them, but does not execute handlers, timers, retries, jobs, or due-work records. Host apps own runtime evaluation.

Supported phases:

| Phase | Target type | Target requirement |
| --- | --- | --- |
| `before_transition` | `action` | `targetId` must reference an existing workflow action. |
| `on_state_entry` | `state` | `targetId` must reference an existing state. |
| `while_in_state` | `state` | `targetId` must reference an existing state. |
| `on_terminal_entry` | `state` | `targetId` must reference a terminal state. |

Hook IDs and handler keys must be lowercase snake_case identifiers. A workflow cannot define two hooks for the same `phase`, `targetType`, and `targetId`.

Only `while_in_state` hooks may define `schedule`; schedules on other phases are invalid. Scheduled hooks require a valid `handlerKey`.

Supported schedule shapes:

| Trigger | Shape | Rule |
| --- | --- | --- |
| `after_duration` | `{ "trigger": "after_duration", "delayMs": number }` | `delayMs` must be a positive integer in milliseconds. |
| `every_interval` | `{ "trigger": "every_interval", "intervalMs": number }` | `intervalMs` must be a positive integer in milliseconds. |
| `daily` | `{ "trigger": "daily", "timeOfDay": "HH:mm" }` | `timeOfDay` must be 24-hour local target-app wall-clock time with no timezone field. |

Recurring `every_interval` and `daily` schedules may define `runLimit.maxRuns`, which caps scheduled handler executions during one state residency. `retryPolicy.maxAttempts` and `retryPolicy.delayMs` describe target-app retry metadata for one scheduled execution and are separate from `runLimit`.

Target apps decide timezone, daylight-saving behavior, catch-up behavior, missed executions, scheduler persistence, and any due-work record model for `daily` schedules.

## Local Library Storage

The browser-local Library stores the current workspace draft plus explicitly saved strict bundles. Library records use `storageSchemaVersion: 2` internally. This metadata is not emitted by Export Definition.

Saved definition records use:

```text
stateWorkflowDefinition:(definition-id)@(definition-version)
```

For example:

```text
stateWorkflowDefinition:scan_job_state@0.1.0
```

Imports load into the current workspace draft. They are not saved as Library records until the user explicitly saves the definition.

Old split state-machine and workflow Library records are not migrated into canonical saved records. Current workspace drafts can still be normalized in memory when loaded.

## Import Behavior

The definition import control accepts:

- strict `schemaVersion: "1.0.0"` state workflow definition bundles
- old bundled workflow exports that include `embeddedStateMachineDefinition`

Standalone state-machine files and linked workflow files are rejected by the strict import path.

When an old bundled workflow is imported, the editor validates the embedded state-machine definition and normalizes the old workflow fields into the strict bundle shape. New exports always use `schemaVersion: "1.0.0"` and never emit old linked or bundled workflow formats.
