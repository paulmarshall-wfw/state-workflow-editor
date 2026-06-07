# State Workflow Editor

## Executive Summary

State Workflow Editor is a browser-based authoring tool and TypeScript contract library for defining state-machine and workflow JSON files. It helps project teams model valid lifecycle states, legal transitions, workflow actions, presentation buckets, and lifecycle hook metadata in a structured format that downstream apps can import. The app is intentionally not a workflow runtime: target applications remain responsible for work-item storage, authorization, side effects, jobs, retries, logging, timers, idempotency, and handler execution.

## Who It Is For

State Workflow Editor is for developers, product owners, and workflow designers who need a clear, versioned way to describe lifecycle state for an application before wiring that behavior into a target app or runtime. It is most useful for projects with durable work items such as scans, memos, orders, reviews, publishing tasks, or any other records that move through named states.

## What It Does

The app lets users create and validate project-agnostic state-machine sections with states, entry states, terminal states, and legal transitions. It also lets users create workflow sections with user or automatic actions, visible labels, bucket presentation metadata, state visibility, lifecycle hooks, schedules, and retry metadata. New imports, exports, and saved Library records use one strict state workflow definition bundle with `schemaVersion: "1.0.0"` and one top-level `definitionVersion`.

Definitions can be imported and exported as formatted JSON files. The browser-local Library stores saved state workflow definition bundles in IndexedDB, while the current workspace draft can be recovered between sessions. Mermaid previews show the model visually, and the editor keeps schema validation visible while definitions are being authored.

## How To Use It

Run the app locally with:

```sh
npm install
npm run dev
```

Open the Vite development server, which defaults to `http://127.0.0.1:5174/`. Use the State Machine page to set the target app, definition version, state IDs, entry states, terminal states, and transitions. Use the Workflow page to define actions, buckets, and lifecycle hooks validated against the current state machine. Use the Library page to save, load, duplicate, or delete browser-local bundle records. Export Definition when the target app is ready to consume the contract.

For local verification, run:

```sh
npm run verify
```

## Technical Foundations

The app is built with TypeScript, React, Vite, Mermaid, Vitest, and browser-local IndexedDB persistence. The package version source of truth is `package.json`; the current private project checkpoint is `1.0.7`.

The current exported contract is the strict state workflow definition bundle schema `1.0.0`. It validates app name, definition version, state IDs, entry states, terminal states, duplicate states, unknown transition references, duplicate transitions, terminal-state transition rules, action IDs and labels, legal action transitions, trigger and visibility rules, buckets, workflow state presentation, lifecycle hook targets, schedules, run limits, and retry metadata.

The reusable core lives in `src/lib/`, while the browser editor lives in `src/App.tsx` with styling in `src/styles.css`. The app uses the File System Access API for saves when supported and falls back to browser downloads. It keeps workflow/runtime boundaries explicit: exported JSON is contract metadata, not executable orchestration.
