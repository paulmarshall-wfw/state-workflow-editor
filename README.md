# State Workflow Engine

A TypeScript state-machine core library with a browser-based definition editor.

The v0 state-machine layer is deliberately narrow. It owns valid states, allowed state-to-state transitions, terminal states, and definition validation. Workflow actions, guards, side effects, persistence, authorization, jobs, and runtime orchestration are separate future layers.

## Status

- Version: `0.0.1`
- Runtime: TypeScript, React, Vite
- Storage: local file import/export only
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

- `src/lib/`: reusable project-agnostic state-machine core
- `src/App.tsx`: browser editor for authoring state-machine definitions
- `src/styles.css`: editor styling
- `docs/plans/`: approved planning artifacts
- `.github/workflows/verify.yml`: CI verification baseline

## Definition Format

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

## Core API

```ts
defineStateMachine(definition);
validateStateMachineDefinition(definition);
canTransition(machine, from, to);
assertTransition(machine, from, to);
getAllowedTargetStates(machine, from);
isTerminalState(machine, state);
```

## Configuration

No environment variables are required for v0 local development. `.env.example` is included to make that explicit.

## Versioning And Release

`package.json` is the version source of truth. The project uses numbered SemVer versions. This repository does not publish packages, images, or hosted deployments yet.
