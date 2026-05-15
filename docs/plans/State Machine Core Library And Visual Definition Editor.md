# PRD: State Machine Core Library And Visual Definition Editor

## Summary
Build a project-agnostic TypeScript state machine package plus a browser-based visual editor for authoring state-machine definitions. The state machine layer owns only states, allowed state-to-state transitions, terminal states, and validation. Workflow behavior remains a separate future layer that maps business actions/events onto these state transitions.

The v0 product consists of:
- A reusable TypeScript core library.
- A Vite + React editor app.
- Versioned JSON import/export for state-machine definitions.
- A three-column authoring UI with a read-only Mermaid graph preview.

## Product Requirements
- Users can create configurable state IDs as string literals.
- Users can specify the target app name included in exported definitions.
- Users can specify a state definition version included in exported definitions; this is separate from the application version.
- Users can define directed allowed transitions: `from -> to`.
- Users can mark states as terminal.
- Terminal states cannot have outgoing transitions.
- The editor validates definitions continuously and blocks export when invalid.
- The Mermaid graph preview displays states, directed transitions, and terminal states read-only.
- Definitions export as versioned JSON and can be imported back into the editor.
- Export uses the File System Access API where supported, with browser download fallback.
- Exported filenames use `(target-project)-(definition-version)-state-specification.json`.
- The expanded app is branded as `State Workflow Editor` and displays its app version beside the name.
- The app logo is configurable from a Settings page.
- The app supports light and dark mode with a toggle icon beside the app name.
- The core library can validate and consume the same JSON definition format.
- The state machine layer must not include workflow actions, guards, side effects, authorization, persistence, logging, jobs, retries, idempotency, or UI-specific behavior.

## Public Interfaces
Define a versioned JSON shape:

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

Core library API:

```ts
defineStateMachine(definition)
validateStateMachineDefinition(definition)
canTransition(machine, from, to)
assertTransition(machine, from, to)
getAllowedTargetStates(machine, from)
isTerminalState(machine, state)
```

Editor UI:
- Fixed app header showing logo, app name, and app version.
- Light/dark mode toggle beside app name and app version.
- App name and definition version fields.
- State list for adding, renaming, selecting, and deleting state IDs.
- Terminal-state toggle per state.
- Middle column showing outgoing transitions from the selected state.
- Validation panel for duplicate IDs, unknown references, invalid terminal transitions, and missing required fields.
- Read-only Mermaid graph preview that updates from the current valid draft.
- Import/export controls for versioned JSON definitions.
- Save-location picker on supported browsers, with default browser download fallback.
- Settings page for app-level logo URL.

## Test Plan
- Core tests for valid definitions, duplicate states, unknown transition states, duplicate transitions, invalid terminal states, and terminal outgoing transitions.
- Runtime tests for allowed transitions, rejected transitions, unknown states, terminal states, and allowed-target lookup.
- Import/export tests proving exported JSON can be re-imported and consumed by the core library.
- Editor tests for adding states, marking terminal states, creating transitions, validation errors, and disabled export on invalid definitions.
- Visual smoke check for the Mermaid preview rendering states, arrows, and terminal-state styling.

## Assumptions
- v0 uses TypeScript throughout.
- The core library and editor live in the same repo initially.
- The editor is local-first and file-based; no backend database in v0.
- The graph is preview-only in v0; all edits happen through forms, lists, and selectors.
- Workflow definition is explicitly out of scope except that it will later consume these state-machine definitions.
