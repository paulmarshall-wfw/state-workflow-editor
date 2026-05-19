# JSON File Formats

This document defines the JSON files imported and exported by State Workflow Editor.

Current exported file-format versions:

- State-machine definition: `schemaVersion: "0.2.0"`
- Workflow definition: `schemaVersion: "0.5.0"`
- Bundled workflow definition: `schemaVersion: "0.5.0"` plus `embeddedStateMachineDefinition`

`schemaVersion` is the file-format version. `definitionVersion` and `workflowVersion` are user-controlled SemVer values for the authored definitions. They are separate from the app/package version in `package.json`.

## File Types

| File type | Export button | Filename pattern | Embeds state machine | Normal export includes |
| --- | --- | --- | --- | --- |
| State-machine definition | Export State Machine | `(target-app)-(definition-version)-state-specification.json` | Not applicable | State IDs, terminal states, legal transitions |
| Workflow definition | Export Workflow | `(target-app)-(workflow-version)-workflow-definition.json` | No | State visibility, actions, buckets, lifecycle hooks |
| Bundled workflow definition | Export Bundled Workflow | `(target-app)-(workflow-version)-workflow-definition-bundled.json` | Yes | Workflow definition plus full state-machine definition |

All export paths write formatted JSON with a trailing newline. The editor uses the File System Access API when available and falls back to a browser download.

## Common Rules

- IDs use lowercase letters, numbers, and underscores, and must start with a lowercase letter.
- `definitionVersion` and `workflowVersion` must be numbered SemVer values such as `0.1.0`.
- Target app names are exported in `appName`.
- The app does not export local folder paths, browser file handles, app settings, logo URL, theme, runtime state, work items, logs, jobs, authorization, persistence, or handler implementations.

## State-Machine Definition

State-machine definitions are the project-agnostic core contract. They define only valid states, terminal states, and legal state-to-state transitions.

```json
{
  "schemaVersion": "0.2.0",
  "appName": "Example App",
  "definitionVersion": "0.1.0",
  "id": "scan_job_state",
  "states": ["queued", "running", "completed", "failed", "cancelled"],
  "terminalStates": ["completed", "cancelled"],
  "transitions": [
    { "from": "queued", "to": "running" },
    { "from": "running", "to": "completed" },
    { "from": "running", "to": "failed" },
    { "from": "running", "to": "cancelled" }
  ]
}
```

### Fields

| Field | Required | Description |
| --- | --- | --- |
| `schemaVersion` | Yes | Must be `"0.2.0"` for current exports. |
| `appName` | Yes | Human-facing target app/project name. |
| `definitionVersion` | Yes | User-controlled SemVer for this state-machine definition. |
| `id` | Yes | Stable state-machine definition ID. |
| `states` | Yes | Ordered list of state IDs. Must contain at least one state. |
| `terminalStates` | Yes | State IDs that have no outgoing transitions. Each must exist in `states`. |
| `transitions` | Yes | Legal transitions between states. Each `from` and `to` must exist in `states`. |

### Validation

- `states` cannot be empty.
- State IDs must be lowercase snake_case identifiers.
- State IDs must be unique.
- Terminal states must be listed in `states`.
- Terminal state entries must be unique.
- Transitions must reference known states.
- Duplicate transitions are invalid.
- Terminal states cannot have outgoing transitions.

## Workflow Definition

Workflow definitions are app-facing contracts linked to a state-machine definition by `stateMachine.id` and `stateMachine.definitionVersion`.

```json
{
  "schemaVersion": "0.5.0",
  "appName": "Example App",
  "workflowVersion": "0.1.0",
  "id": "scan_job_workflow",
  "stateMachine": {
    "id": "scan_job_state",
    "definitionVersion": "0.1.0"
  },
  "states": [
    { "id": "queued", "visible": true },
    { "id": "running", "visible": true },
    { "id": "completed", "visible": true },
    { "id": "failed", "visible": false },
    { "id": "cancelled", "visible": true }
  ],
  "actions": [
    {
      "id": "start",
      "label": "Start",
      "from": "queued",
      "to": "running",
      "trigger": "user",
      "visible": true
    },
    {
      "id": "fail",
      "label": "Fail",
      "from": "running",
      "to": "failed",
      "trigger": "automatic",
      "visible": false
    }
  ],
  "buckets": [
    {
      "id": "waiting",
      "label": "Waiting",
      "visible": true,
      "states": ["queued"]
    },
    {
      "id": "active",
      "label": "Active",
      "visible": true,
      "states": ["running", "failed"]
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
      "id": "on_state_entry_running",
      "phase": "on_state_entry",
      "targetType": "state",
      "targetId": "running",
      "handlerKey": "run_scan"
    }
  ]
}
```

### Fields

| Field | Required | Description |
| --- | --- | --- |
| `schemaVersion` | Yes | Must be `"0.5.0"` for current exports. |
| `appName` | Yes | Human-facing target app/project name. |
| `workflowVersion` | Yes | User-controlled SemVer for this workflow definition. |
| `id` | Yes | Stable workflow definition ID. |
| `stateMachine` | Yes | Linked state-machine reference. Its `id` and `definitionVersion` must match the loaded or embedded state-machine definition. |
| `states` | Yes | One workflow presentation entry for every state in the linked state machine. |
| `actions` | Yes | Named actions mapped to legal state-machine transitions. |
| `buckets` | Yes | Optional presentation groups. Exported as `[]` when no buckets exist. |
| `hooks` | Yes | Optional lifecycle handler metadata. Exported as `[]` when no hooks exist. |

### Workflow State Presentation

```json
{ "id": "queued", "visible": true }
```

- `id` must reference a state in the linked state machine.
- Every linked state must have one workflow state presentation entry.
- `visible` controls presentation only. Hidden states remain valid workflow states.

### Actions

```json
{
  "id": "start",
  "label": "Start",
  "from": "queued",
  "to": "running",
  "trigger": "user",
  "visible": true
}
```

- `id` must be unique and lowercase snake_case.
- `label` is required.
- `from` and `to` must exist in the linked state machine.
- `from -> to` must be a legal state-machine transition.
- Actions cannot start from terminal states.
- `trigger` must be `"user"` or `"automatic"`.
- User-triggered actions must be visible.
- Automatic actions must be hidden from user controls.
- Current workflow exports do not include action-level `processing` or handler keys.

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
- `states` entries must exist in the linked state machine.
- Buckets are optional presentation metadata. Empty buckets, partial assignments, and duplicate state assignments across buckets do not affect action validity.

### Lifecycle Hooks

Lifecycle hooks are optional app-processing metadata. The editor validates and exports them, but does not execute handlers.

```json
{
  "id": "before_transition_start",
  "phase": "before_transition",
  "targetType": "action",
  "targetId": "start",
  "handlerKey": "start_scan",
  "onSuccess": { "handlerKey": "start_scan_success" },
  "onFailure": { "handlerKey": "start_scan_failure" }
}
```

| Field | Required | Description |
| --- | --- | --- |
| `id` | Yes | Unique lifecycle hook ID. |
| `phase` | Yes | Lifecycle phase. |
| `targetType` | Yes | `"action"` for `before_transition`; `"state"` for state lifecycle phases. |
| `targetId` | Yes | Action ID or state ID, depending on `targetType`. |
| `handlerKey` | No | Main target-app handler key. |
| `onSuccess.handlerKey` | No | Optional target-app success handler key. |
| `onFailure.handlerKey` | No | Optional target-app failure handler key. |

Supported phases:

| Phase | Target type | Target requirement |
| --- | --- | --- |
| `before_transition` | `action` | `targetId` must reference an existing workflow action. |
| `on_state_entry` | `state` | `targetId` must reference an existing state. |
| `while_in_state` | `state` | `targetId` must reference an existing state. |
| `on_terminal_entry` | `state` | `targetId` must reference a terminal state. |

Hook IDs and handler keys must be lowercase snake_case identifiers. A workflow cannot define two hooks for the same `phase`, `targetType`, and `targetId`.

## Bundled Workflow Definition

A bundled workflow definition has the same workflow fields as a linked workflow definition and adds `embeddedStateMachineDefinition`.

```json
{
  "schemaVersion": "0.5.0",
  "appName": "Example App",
  "workflowVersion": "0.1.0",
  "id": "scan_job_workflow",
  "stateMachine": {
    "id": "scan_job_state",
    "definitionVersion": "0.1.0"
  },
  "embeddedStateMachineDefinition": {
    "schemaVersion": "0.2.0",
    "appName": "Example App",
    "definitionVersion": "0.1.0",
    "id": "scan_job_state",
    "states": ["queued", "running", "completed", "failed", "cancelled"],
    "terminalStates": ["completed", "cancelled"],
    "transitions": [
      { "from": "queued", "to": "running" },
      { "from": "running", "to": "completed" }
    ]
  },
  "states": [
    { "id": "queued", "visible": true },
    { "id": "running", "visible": true },
    { "id": "completed", "visible": true },
    { "id": "failed", "visible": true },
    { "id": "cancelled", "visible": true }
  ],
  "actions": [],
  "buckets": [],
  "hooks": []
}
```

Bundled workflow imports validate the embedded state-machine definition and load it when valid. The workflow `stateMachine.id` and `stateMachine.definitionVersion` must match the embedded state-machine definition.

## Import Behavior

### State Machine Import

The State Machine import control accepts `.json` state-machine definition files. The imported file is normalized into the current state-machine shape and then validated.

### Workflow Import

The Workflow import control accepts:

- linked workflow definition JSON
- bundled workflow definition JSON
- state-machine definition JSON, as a convenience import that loads the state machine

Linked workflow imports validate against the currently loaded state-machine definition. Bundled workflow imports validate against their embedded state-machine definition and replace the currently loaded state machine when valid.

When a workflow is imported, it is reconciled to the effective state-machine definition:

- missing workflow state presentation entries are added as visible
- stale workflow state presentation entries are removed
- actions that no longer map to a current legal transition are removed
- stale bucket state assignments are removed
- lifecycle hooks targeting missing actions or states are removed

### Legacy Workflow Imports

The editor accepts workflow schema `0.1.0`, `0.2.0`, `0.3.0`, and `0.4.0` imports and upgrades them in memory to current schema `0.5.0`.

Legacy normalization rules:

- missing `states` becomes one visible workflow state entry per linked state
- string state entries become `{ "id": "...", "visible": true }`
- missing `trigger` becomes `"user"`
- missing `visible` becomes `true` for user actions
- missing `buckets` becomes `[]`
- missing `hooks` becomes `[]`
- legacy `action.processing.handlerKey` values become `before_transition` lifecycle hooks unless an explicit hook already exists for the same action

New exports always use workflow schema `0.5.0`, always omit action-level `processing`, and always include `buckets` and `hooks` arrays.

