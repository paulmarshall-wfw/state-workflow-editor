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

## State Workflow Definition Bundle Format

The dedicated format reference is [docs/json-file-formats.md](docs/json-file-formats.md). This README keeps a shorter working example.

```json
{
  "schemaVersion": "2.0.0",
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
      { "from": "running", "to": "completed" }
    ]
  },
  "workflowDefinition": {
    "id": "scan_job_workflow",
    "states": [
      { "id": "queued", "visible": true },
      { "id": "running", "visible": true },
      { "id": "completed", "visible": true }
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
    "buckets": [],
    "hooks": []
  }
}
```

`schemaVersion` is the bundle file-format version. `definitionVersion` is the one user-controlled version for both nested sections and is separate from the app version in `package.json`. New exports do not include nested state-machine or workflow version fields.

Exported filenames use:

```text
(target-app)-(definition-version)-state-workflow-definition.json
```

For example: `example-project-0.1.0-state-workflow-definition.json`.

The editor prefers slug-like Target App values such as `state-workflow-engine`. The folder picker reads `package.json` from the selected project folder first, using `name` and stripping package scopes such as `@scope/state-workflow-engine` to `state-workflow-engine`. If no suitable package name exists, it uses the selected folder name when already slug-like, then a slug-like `.app-dashboard.json` `name`, then a conservative slug conversion of the folder name. Folder paths and handles are not stored or exported.

Workflow buckets, state visibility, action visibility, action trigger mode, lifecycle handler keys, while-in-state schedules, recurring run limits, and retry policies are exported contract metadata. Action IDs use stable lowercase dotted identifier segments, while action labels are visible button text. Bucket IDs, hook IDs, and handler keys use lowercase snake_case and labels are required for buckets and actions. Buckets are optional UI presentation metadata: a workflow may have no buckets, empty buckets, or partial bucket assignments without invalidating actions. Lifecycle hooks are optional app-processing metadata and may target action or state lifecycle points. `while_in_state` hooks require a handler key and a schedule; schedule metadata is allowed only on `while_in_state`. Recurring schedules may use `runLimit.maxRuns` to cap scheduled handler executions for one state residency.

## Browser Library Storage

The editor keeps a browser-local IndexedDB Library for saved definitions and a recoverable current workspace draft. The saved Library is separate from import/export JSON: storage metadata is not included in normal exported files.

Saved state workflow definition bundles are keyed by the exact definition identity:

```text
stateWorkflowDefinition:(definition-id)@(definition-version)
```

For example: `stateWorkflowDefinition:scan_job_state@0.1.0`.

The Library page can save the current definition, load saved records, duplicate records as new versions, and delete records.

Imports load into the current workspace draft only. They do not create saved Library records until the user explicitly saves them. Strict `2.0.0` bundle imports are current. Strict `1.0.0` bundles and old bundled workflow files with `embeddedStateMachineDefinition` remain importable as compatibility-only input and are normalized in memory; standalone state-machine files and linked workflow files are rejected by the strict import path.

## Target App Integration Model

A target app is an app that ingests a state workflow definition bundle exported from this editor, then uses its state-machine and workflow sections to configure its own workflow engine for its own work items. Work items are intentionally documentation-only here: they might be photos, articles, orders, or any other target-app record, but this editor does not define work-item schemas, storage, ownership, authorization, or app data models.

The exported workflow is a contract, not an executable workflow engine. Buckets and state visibility describe an optional user-facing workflow surface that a target app may render. Hidden or missing buckets and hidden states remain valid contract metadata choices and do not affect whether actions are valid.

State-machine `entryStates` are project-agnostic contract metadata that nominate states a target app may treat as valid creation or start states. They are distinct from the editor's currently selected state and from workflow actions. Empty `entryStates` arrays are valid and mean the state-machine definition does not nominate entry states. Entry states do not imply runtime record creation behavior, guards, authorization, persistence, or transition execution.

Actions describe how a valid transition is initiated. Actions are grounded in the state-machine states and legal transitions, not in bucket placement. Action `id` is the stable runtime/audit identifier; `label` is the visible button text. Generated/default IDs are starting points and should be edited to semantic app-facing IDs when needed. Audit consumers should store the exact workflow action `id`, previous state, and new state. Runtime consumers should use `workflowDefinition.id` as the runtime `workflowId`; runtime `variantKey` defaults to `"default"` and is not exported by the editor. A `user` action must be visible. An `automatic` action must be hidden from user controls. Actions do not carry handler keys in the strict `2.0.0` bundle schema.

Lifecycle hooks describe optional app-specific processing points. Supported phases are `before_transition` for action-targeted pre-transition work, `on_state_entry` for state-entry work, `while_in_state` for scheduled work while an item remains in a state, and `on_terminal_entry` for terminal-state entry work. Each hook may define a main `handlerKey`, plus optional success and failure handler keys. `while_in_state` hooks must define a schedule using `after_duration` with `delayMs`, `every_interval` with `intervalMs`, or `daily` with local target-app wall-clock `timeOfDay` in `HH:mm` format. Recurring `every_interval` and `daily` schedules may define `runLimit.maxRuns`, which caps scheduled handler executions during a single state residency. Retry metadata with `maxAttempts` and `delayMs` is separate and applies to attempts for a failed scheduled execution. These keys and schedules are identifiers and contract metadata for the target app; this editor does not execute timers, evaluate due hooks, retry work, choose timezone or daylight-saving behavior, catch up missed executions, persist scheduler state, or guarantee state changes from success or failure.

Failure handling, timers, due-work records, retries, logging, authorization, idempotency, persistence, job orchestration, and handler implementation stay entirely in the target app.

## Editor Layout

- The app is titled `State Workflow Editor`, with the app version displayed beside the title.
- The logo appears to the left of the app title and can be configured from Settings.
- The light/dark mode icon appears beside the app title and version.
- The app has State Machine, Workflow, Library, and Settings pages.
- The Target App control includes a folder picker that updates both state-machine and workflow app names.
- The State Machine page uses three independently scrolling columns: states, selected-state transitions, and a read-only Mermaid preview. State rows include Entry and Terminal markers. Mermaid previews default to vertical top-to-bottom layout and include a local horizontal/vertical direction toggle.
- The Workflow page has Actions, Buckets, and Lifecycle views. Actions maps stable action IDs and visible button labels onto legal state-machine transitions and lets users set trigger mode and user visibility. Buckets lets users edit bucket names directly, toggle bucket visibility, add states to the selected bucket from an all-state dropdown, toggle workflow-level state visibility, and remove states from the selected bucket. Lifecycle lets users add app-specific handler keys for before-transition, state-entry, while-in-state, and terminal-entry phases, with interval, duration, daily time, optional recurring run-limit, and optional retry controls for while-in-state hooks plus optional success and failure handler metadata. All workflow views retain the action-labelled Mermaid preview and the same local horizontal/vertical direction toggle; in Buckets view, the selected bucket's states use solid boundaries while all other states use dotted boundaries.
- The Library page manages browser-local saved state workflow definition bundles.

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
createStateWorkflowDefinitionBundle(stateMachineDefinition, workflowDefinition);
validateStateWorkflowDefinitionBundle(bundle);
normalizeStateWorkflowDefinitionBundle(value);
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
