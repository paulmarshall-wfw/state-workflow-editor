# State Workflow Editor

A TypeScript state-machine and workflow contract library with a browser-based definition editor.

The state-machine layer is deliberately narrow. It owns valid states, nominated entry states, allowed state-to-state transitions, terminal states, and definition validation. The workflow layer maps named app actions onto valid state-machine transitions and may add optional bucket presentation metadata, but guards, side effects, persistence, authorization, jobs, retries, idempotency, and runtime orchestration remain app/runtime concerns.

## Status

- Version: `1.0.7`
- Runtime: TypeScript, React, Vite, Mermaid
- Storage: browser-local IndexedDB Library plus JSON import/export; exports use the File System Access API when supported and browser download fallback otherwise
- App selection: Target App fields can be filled from a local folder picker when the browser supports directory selection
- App settings: logo URL and light/dark theme are stored in browser local storage
- Release state: private `1.0.7` project checkpoint, not published

## Development

```sh
npm install
npm run dev
npm run lint
npm run test
npm run build
npm run verify
```

`npm run verify` is the required local checkpoint. It runs type checking, unit/component tests, and a production build.

## Project Structure

- `src/lib/`: reusable project-agnostic state-machine and workflow contract helpers
- `src/App.tsx`: browser editor for authoring state-machine and workflow definitions
- `src/styles.css`: editor styling
- `docs/json-file-formats.md`: current import/export JSON file-format reference
- `docs/plans/`: approved planning artifacts
- `.github/workflows/verify.yml`: CI verification baseline

## State-Machine Definition Format

The dedicated format reference is [docs/json-file-formats.md](docs/json-file-formats.md). This README keeps a shorter working example.

```json
{
  "schemaVersion": "0.3.0",
  "appName": "Example App",
  "definitionVersion": "0.1.0",
  "id": "scan_job_state",
  "states": ["queued", "running", "completed", "failed", "cancelled"],
  "entryStates": ["queued"],
  "terminalStates": ["completed", "cancelled"],
  "transitions": [
    { "from": "queued", "to": "running" },
    { "from": "running", "to": "completed" }
  ]
}
```

`schemaVersion` is the definition file-format version. `definitionVersion` is the user-controlled version of the state definition and is separate from the app version in `package.json`.

Exported filenames use:

```text
(target-app)-(definition-version)-state-specification.json
```

For example: `example-project-0.1.0-state-specification.json`.

The editor prefers slug-like Target App values such as `state-workflow-engine`. The folder picker reads `package.json` from the selected project folder first, using `name` and stripping package scopes such as `@scope/state-workflow-engine` to `state-workflow-engine`. If no suitable package name exists, it uses the selected folder name when already slug-like, then a slug-like `.app-dashboard.json` `name`, then a conservative slug conversion of the folder name. Folder paths and handles are not stored or exported.

## Workflow Definition Format

The current linked and bundled workflow JSON contracts are defined in [docs/json-file-formats.md](docs/json-file-formats.md).

Workflow definitions keep their own `id` and `workflowVersion` separate. The linked state-machine identity is the pair `stateMachine.id` plus `stateMachine.definitionVersion`.

```json
{
  "schemaVersion": "0.7.0",
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
      "id": "scan.start",
      "label": "Start",
      "from": "queued",
      "to": "running",
      "trigger": "user",
      "visible": true
    },
    {
      "id": "scan.fail",
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
    },
    {
      "id": "finished",
      "label": "Finished",
      "visible": true,
      "states": ["completed", "cancelled"]
    }
  ],
  "hooks": [
    {
      "id": "before_transition_start",
      "phase": "before_transition",
      "targetType": "action",
      "targetId": "scan.start",
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
    },
    {
      "id": "while_in_state_failed",
      "phase": "while_in_state",
      "targetType": "state",
      "targetId": "failed",
      "handlerKey": "recheck_failed",
      "schedule": { "trigger": "every_interval", "intervalMs": 900000 },
      "retryPolicy": { "maxAttempts": 3, "delayMs": 60000 }
    }
  ]
}
```

Workflow buckets, state visibility, action visibility, action trigger mode, lifecycle handler keys, while-in-state schedules, and retry policies are exported contract metadata. Action IDs use stable lowercase dotted identifier segments, while action labels are visible button text. Bucket IDs, hook IDs, and handler keys use lowercase snake_case and labels are required for buckets and actions. Buckets are optional UI presentation metadata: a workflow may have no buckets, empty buckets, or partial bucket assignments without invalidating actions. Lifecycle hooks are optional app-processing metadata and may target action or state lifecycle points. `while_in_state` hooks require a handler key and a schedule; schedule metadata is allowed only on `while_in_state`. Exports always include the `buckets` and `hooks` arrays, even when either one is empty. Imports from older `0.1.0`, `0.2.0`, `0.3.0`, `0.4.0`, `0.5.0`, and `0.6.0` workflow files are upgraded in memory with visible workflow states, user-visible actions by default, empty hooks by default, and legacy `action.processing.handlerKey` values converted to `before_transition` lifecycle hooks; new exports use workflow schema `0.7.0`.

Linked workflow exports use:

```text
(target-app)-(workflow-version)-workflow-definition.json
```

Bundled workflow exports include `embeddedStateMachineDefinition` and use:

```text
(target-app)-(workflow-version)-workflow-definition-bundled.json
```

## Browser Library Storage

The editor keeps a browser-local IndexedDB Library for saved definitions and a recoverable current workspace draft. The saved Library is separate from import/export JSON: storage metadata is not included in normal exported files. Saved workflow records and current workspace drafts from older workflow schemas are upgraded in memory when loaded; the stored record is rewritten only when the user saves or duplicates it.

Saved state-machine definitions are keyed by the exact definition identity:

```text
stateMachine:(state-machine-id)@(definition-version)
```

For example: `stateMachine:scan_job_state@0.1.0`.

Saved workflow definitions are scoped under the exact state-machine version they reference:

```text
workflow:(state-machine-id)@(definition-version)/(workflow-id)@(workflow-version)
```

For example: `workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0`.

The Library page can save the current state machine, save the current workflow, load saved records, duplicate records as new versions, and delete records. A workflow can only be saved after its linked state-machine version is saved. A state-machine version cannot be deleted while saved workflows still reference it.

Imports load into the current workspace draft only. They do not create saved Library records until the user explicitly saves them.

## Target App Integration Model

A target app is an app that ingests a state-machine definition and workflow definition exported from this editor, then uses those definitions to configure its own workflow engine for its own work items. Work items are intentionally documentation-only here: they might be photos, articles, orders, or any other target-app record, but this editor does not define work-item schemas, storage, ownership, authorization, or app data models.

The exported workflow is a contract, not an executable workflow engine. Buckets and state visibility describe an optional user-facing workflow surface that a target app may render. Hidden or missing buckets and hidden states remain valid contract metadata choices and do not affect whether actions are valid.

State-machine `entryStates` are project-agnostic contract metadata that nominate states a target app may treat as valid creation or start states. They are distinct from the editor's currently selected state and from workflow actions. Empty `entryStates` arrays are valid and mean the state-machine definition does not nominate entry states. Entry states do not imply runtime record creation behavior, guards, authorization, persistence, or transition execution.

Actions describe how a valid transition is initiated. Actions are grounded in the state-machine states and legal transitions, not in bucket placement. Action `id` is the stable runtime/audit identifier; `label` is the visible button text. Generated/default IDs are starting points and should be edited to semantic app-facing IDs when needed. Audit consumers should store the exact workflow action `id`, previous state, and new state. A `user` action must be visible. An `automatic` action must be hidden from user controls. Actions do not carry handler keys in schema `0.7.0`.

Lifecycle hooks describe optional app-specific processing points. Supported phases are `before_transition` for action-targeted pre-transition work, `on_state_entry` for state-entry work, `while_in_state` for scheduled work while an item remains in a state, and `on_terminal_entry` for terminal-state entry work. Each hook may define a main `handlerKey`, plus optional success and failure handler keys. `while_in_state` hooks must define a schedule using either `after_duration` with `delayMs` or `every_interval` with `intervalMs`, and may define retry metadata with `maxAttempts` and `delayMs`. These keys and schedules are identifiers and contract metadata for the target app; this editor does not execute timers, evaluate due hooks, retry work, or guarantee state changes from success or failure.

Failure handling, timers, due-work records, retries, logging, authorization, idempotency, persistence, job orchestration, and handler implementation stay entirely in the target app.

## Editor Layout

- The app is titled `State Workflow Editor`, with the app version displayed beside the title.
- The logo appears to the left of the app title and can be configured from Settings.
- The light/dark mode icon appears beside the app title and version.
- The app has State Machine, Workflow, Library, and Settings pages.
- The Target App control includes a folder picker that updates both state-machine and workflow app names.
- The State Machine page uses three independently scrolling columns: states, selected-state transitions, and a read-only Mermaid preview. State rows include Entry and Terminal markers. Mermaid previews default to vertical top-to-bottom layout and include a local horizontal/vertical direction toggle.
- The Workflow page has Actions, Buckets, and Lifecycle views. Actions maps stable action IDs and visible button labels onto legal state-machine transitions and lets users set trigger mode and user visibility. Buckets lets users edit bucket names directly, toggle bucket visibility, add states to the selected bucket from an all-state dropdown, toggle workflow-level state visibility, and remove states from the selected bucket. Lifecycle lets users add app-specific handler keys for before-transition, state-entry, while-in-state, and terminal-entry phases, with schedule and optional retry controls for while-in-state hooks plus optional success and failure handler metadata. All workflow views retain the action-labelled Mermaid preview and the same local horizontal/vertical direction toggle; in Buckets view, the selected bucket's states use solid boundaries while all other states use dotted boundaries.
- The Library page manages browser-local saved state-machine definitions and their exact-version linked workflow definitions.

## Core API

```ts
defineStateMachine(definition);
validateStateMachineDefinition(definition);
canTransition(machine, from, to);
assertTransition(machine, from, to);
getAllowedTargetStates(machine, from);
isEntryState(machine, state);
isTerminalState(machine, state);
validateWorkflowDefinition(workflow, stateMachineDefinition);
defineWorkflow(workflow, stateMachineDefinition);
getAllowedActions(workflow, currentState);
getActionTargetState(workflow, actionId);
```

## Configuration

No environment variables are required for local development. The Vite dev server defaults to `127.0.0.1:5174` with strict port binding.

Optional overrides:

```sh
VITE_HOST=127.0.0.1
VITE_PORT=5174
```

## Versioning And Release

`package.json` is the version source of truth. The project uses numbered SemVer versions. This repository does not publish packages, images, or hosted deployments yet.
