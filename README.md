# State Workflow Editor

A TypeScript state-machine and workflow contract library with a browser-based definition editor.

The state-machine layer is deliberately narrow. It owns valid states, allowed state-to-state transitions, terminal states, and definition validation. The workflow layer maps named app actions onto valid state-machine transitions and may add optional bucket presentation metadata, but guards, side effects, persistence, authorization, jobs, retries, idempotency, and runtime orchestration remain app/runtime concerns.

## Status

- Version: `1.0.2`
- Runtime: TypeScript, React, Vite, Mermaid
- Storage: local file import/export only; exports use the File System Access API when supported and browser download fallback otherwise
- App selection: Target App fields can be filled from a local folder picker when the browser supports directory selection
- App settings: logo URL and light/dark theme are stored in browser local storage
- Release state: private `1.0.2` project checkpoint, not published

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
- `docs/plans/`: approved planning artifacts
- `.github/workflows/verify.yml`: CI verification baseline

## State-Machine Definition Format

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

Workflow definitions keep their own `id` and `workflowVersion` separate. The linked state-machine identity is the pair `stateMachine.id` plus `stateMachine.definitionVersion`.

```json
{
  "schemaVersion": "0.4.0",
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
      "visible": true,
      "processing": { "handlerKey": "start_scan" }
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
    },
    {
      "id": "finished",
      "label": "Finished",
      "visible": true,
      "states": ["completed", "cancelled"]
    }
  ]
}
```

Workflow buckets, state visibility, action visibility, action trigger mode, and handler keys are exported contract metadata. Bucket IDs and handler keys use lowercase snake_case and labels are required. Buckets are optional UI presentation metadata: a workflow may have no buckets, empty buckets, or partial bucket assignments without invalidating actions. Exports always include the `buckets` array, even when it is empty. Imports from older `0.1.0`, `0.2.0`, and `0.3.0` workflow files are upgraded in memory with visible workflow states and user-visible actions by default; new exports use workflow schema `0.4.0`.

Linked workflow exports use:

```text
(target-app)-(workflow-version)-workflow-definition.json
```

Bundled workflow exports include `embeddedStateMachineDefinition` and use:

```text
(target-app)-(workflow-version)-workflow-definition-bundled.json
```

## Target App Integration Model

A target app is an app that ingests a state-machine definition and workflow definition exported from this editor, then uses those definitions to configure its own workflow engine for its own work items. Work items are intentionally documentation-only here: they might be photos, articles, orders, or any other target-app record, but this editor does not define work-item schemas, storage, ownership, authorization, or app data models.

The exported workflow is a contract, not an executable workflow engine. Buckets and state visibility describe an optional user-facing workflow surface that a target app may render. Hidden or missing buckets and hidden states remain valid contract metadata choices and do not affect whether actions are valid.

Actions describe how a valid transition is initiated. Actions are grounded in the state-machine states and legal transitions, not in bucket placement. A `user` action must be visible. An `automatic` action must be hidden from user controls. If an action has no `processing.handlerKey`, the target app may commit the transition immediately after accepting the trigger. If a handler key is present, the target app runs its own processing logic for that app-agnostic identifier and commits the state transition only after successful completion.

Failure handling, retries, logging, authorization, idempotency, persistence, job orchestration, and handler implementation stay entirely in the target app.

## Editor Layout

- The app is titled `State Workflow Editor`, with the app version displayed beside the title.
- The logo appears to the left of the app title and can be configured from Settings.
- The light/dark mode icon appears beside the app title and version.
- The app has State Machine, Workflow, and Settings pages.
- The Target App control includes a folder picker that updates both state-machine and workflow app names.
- The State Machine page uses three independently scrolling columns: states, selected-state transitions, and a read-only Mermaid preview.
- The Workflow page has Actions and Buckets views. Actions maps named action-button labels onto legal state-machine transitions and lets users set trigger mode, user visibility, and optional handler keys. Buckets lets users edit bucket names directly, toggle bucket visibility, add states to the selected bucket from an all-state dropdown, toggle workflow-level state visibility, and remove states from the selected bucket. Both workflow views retain the action-labelled Mermaid preview; in Buckets view, the selected bucket's states use solid boundaries while all other states use dotted boundaries.

## Core API

```ts
defineStateMachine(definition);
validateStateMachineDefinition(definition);
canTransition(machine, from, to);
assertTransition(machine, from, to);
getAllowedTargetStates(machine, from);
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
