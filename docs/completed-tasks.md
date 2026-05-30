# Completed Tasks

Append brief entries here when project work is completed. Keep this file concise and append-only.

## 2026-05-30

- Task: Separate workflow action IDs from labels in the editor
  Outcome: Workflow schema `0.7.0` now supports stable dotted action IDs, editable action labels, label-based Mermaid previews, lifecycle hook retargeting on ID edits, and documented audit guidance.
  Verification: `npm run verify` passed.
  Traceability: `main` at `ae984bc`; changed `src/lib/workflow.ts`, `src/App.tsx`, `src/styles.css`, tests, README, and `docs/json-file-formats.md`.

- Task: Improve workflow lifecycle hooks panel readability
  Outcome: Lifecycle phase controls now stack cleanly, and hook rows show target, handler, and status in a readable two-line layout.
  Verification: `npm run lint`, `npm run test`, `npm run build`, and Chrome visual check at `http://127.0.0.1:5174/` passed; existing React `act(...)` warning and Vite chunk-size warning remain.
  Traceability: `main` at `b4bc65d`; changed `src/App.tsx` and `src/styles.css`.

- Task: Fix ambiguous workflow Mermaid labels for duplicate action names
  Outcome: Workflow Mermaid previews now keep duplicate action labels distinct by appending action IDs only when labels collide, preserving readability for unique labels.
  Verification: `npm test` and `npm run lint` passed; existing React `act(...)` warning remains during tests.
  Traceability: `main` at `74c6252`; changed `src/App.tsx` and `src/App.test.tsx`.

- Task: Repair Mermaid workflow preview rendering after duplicate-label fix
  Outcome: Workflow edge labels are now emitted as quoted Mermaid text, so disambiguated labels like `Cancel (cancel_queued)` render correctly instead of breaking the preview.
  Verification: `npm test` and `npm run lint` passed; manual Chrome reload confirmed the workflow diagram renders again at `http://127.0.0.1:5174/`; existing React `act(...)` warning remains during tests.
  Traceability: `main` at `74c6252`; changed `src/App.tsx` and `src/App.test.tsx`.
