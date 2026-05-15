# State Workflow Editor

A TypeScript state-machine and workflow contract library with a browser-based definition editor.

The state-machine layer is deliberately narrow. It owns valid states, allowed state-to-state transitions, terminal states, and definition validation. The workflow layer maps named app actions onto those valid transitions, but guards, side effects, persistence, authorization, jobs, retries, idempotency, and runtime orchestration remain app/runtime concerns.

## Status

- Version: `0.0.2`
- Runtime: TypeScript, React, Vite, Mermaid
- Storage: local file import/export only; exports use the File System Access API when supported and browser download fallback otherwise
- Project selection: Target Project fields can be filled from a local folder picker when the browser supports directory selection
- App settings: logo URL and light/dark theme are stored in browser local storage
- Release state: private development baseline, not published

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
(target-project)-(definition-version)-state-specification.json
```

For example: `example-project-0.1.0-state-specification.json`.

The editor prefers slug-like Target Project values such as `state-workflow-engine`. The folder picker reads `package.json` from the selected project folder first, using `name` and stripping package scopes such as `@scope/state-workflow-engine` to `state-workflow-engine`. If no suitable package name exists, it uses the selected folder name when already slug-like, then a slug-like `.app-dashboard.json` `name`, then a conservative slug conversion of the folder name. Folder paths and handles are not stored or exported.

## Workflow Definition Format

Workflow definitions keep their own `id` and `workflowVersion` separate. The linked state-machine identity is the pair `stateMachine.id` plus `stateMachine.definitionVersion`.

```json
{
  "schemaVersion": "0.1.0",
  "appName": "Example App",
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
    }
  ]
}
```

Linked workflow exports use:

```text
(target-project)-(workflow-version)-workflow-definition.json
```

Bundled workflow exports include `embeddedStateMachineDefinition` and use:

```text
(target-project)-(workflow-version)-workflow-definition-bundled.json
```

## Editor Layout

- The app is titled `State Workflow Editor`, with the app version displayed beside the title.
- The logo appears to the left of the app title and can be configured from Settings.
- The light/dark mode icon appears beside the app title and version.
- The app has State Machine, Workflow, and Settings pages.
- The Target Project control includes a folder picker that updates both state-machine and workflow project names.
- The State Machine page uses three independently scrolling columns: states, selected-state transitions, and a read-only Mermaid preview.
- The Workflow page maps named action-button labels onto legal state-machine transitions, uses a fixed Selected State dropdown above the action rows, and previews action-labelled transitions.

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

No environment variables are required for v0 local development. `.env.example` is included to make that explicit.

## Versioning And Release

`package.json` is the version source of truth. The project uses numbered SemVer versions. This repository does not publish packages, images, or hosted deployments yet.
