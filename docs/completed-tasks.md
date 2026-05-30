# Completed Tasks

Append brief entries here when project work is completed. Keep this file concise and append-only.

## 2026-05-30

- Task: Separate workflow action IDs from labels in the editor
  Outcome: Workflow schema `0.7.0` now supports stable dotted action IDs, editable action labels, label-based Mermaid previews, lifecycle hook retargeting on ID edits, and documented audit guidance.
  Verification: `npm run verify` passed.
  Traceability: `main` at `ae984bc`; changed `src/lib/workflow.ts`, `src/App.tsx`, `src/styles.css`, tests, README, and `docs/json-file-formats.md`.
