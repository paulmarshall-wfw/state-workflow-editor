# PRD: State Machine Core Library And Visual Definition Editor

## Summary
Build a project-agnostic TypeScript state machine package plus a browser-based visual editor for authoring state-machine definitions. The state machine layer owns only states, allowed state-to-state transitions, terminal states, and validation. Workflow behavior remains a separate future layer that maps business actions/events onto these state transitions.

The v0 product consists of:
- A reusable TypeScript core library.
- A Vite + React editor app.
- Versioned JSON import/export for state-machine definitions.
- A form/table authoring UI with a read-only graph preview.

## Product Requirements
- Users can create configurable state IDs as string literals.
- Users can define directed allowed transitions: `from -> to`.
- Users can mark states as terminal.
- Terminal states cannot have outgoing transitions.
- The editor validates definitions continuously and blocks export when invalid.
- The graph preview displays states, transitions, and terminal states read-only.
- Definitions export as versioned JSON and can be imported back into the editor.
- The core library can validate and consume the same JSON definition format.
- The state machine layer must not include workflow actions, guards, side effects, authorization, persistence, logging, jobs, retries, idempotency, or UI-specific behavior.

## Public Interfaces
Define a versioned JSON shape:

```json
{
  "schemaVersion": "0.1.0",
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
- State table for adding, renaming, and deleting state IDs.
- Terminal-state toggle per state.
- Transition table with `from` and `to` selectors.
- Validation panel for duplicate IDs, unknown references, invalid terminal transitions, and missing required fields.
- Read-only graph preview that updates from the current valid draft.
- Import/export controls for versioned JSON definitions.

## Test Plan
- Core tests for valid definitions, duplicate states, unknown transition states, duplicate transitions, invalid terminal states, and terminal outgoing transitions.
- Runtime tests for allowed transitions, rejected transitions, unknown states, terminal states, and allowed-target lookup.
- Import/export tests proving exported JSON can be re-imported and consumed by the core library.
- Editor tests for adding states, marking terminal states, creating transitions, validation errors, and disabled export on invalid definitions.
- Visual smoke check for the graph preview rendering states, arrows, and terminal-state styling.

## Assumptions
- v0 uses TypeScript throughout.
- The core library and editor live in the same repo initially.
- The editor is local-first and file-based; no backend database in v0.
- The graph is preview-only in v0; all edits happen through forms and tables.
- Workflow definition is explicitly out of scope except that it will later consume these state-machine definitions.
