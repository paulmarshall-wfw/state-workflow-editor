---
format: "myworkorders.work_order"
format_version: 1
id:
title: "Add state-machine JSON import drop zone"
project_id: "state-workflow-engine"
project_scope: "single-project"
primary_project_id: "state-workflow-engine"
related_project_ids: []
work_order_group_id: null
work_order_group_title: null
focus_area: "state-machine-import"
type: "feature"
status: "triage-needed"
priority: "medium"
assigned_to: "codex"
created_by: "user"
execution_mode: "codex-exec"
approval_boundary: "ready-for-codex -> queued-for-codex"
codex_launcher: "dry-run"
codex_approval_policy_override: "inherit"
sandbox: "workspace-write"
requires_completion_report: true
completion_report_schema: "myworkorders.completion_report.v1"
requires_project_assignment: false
inferred: false
review_status: "not-reviewed"
human_review_required: true
created_at: "2026-05-15T20:48:23Z"
updated_at: "2026-05-15T20:48:23Z"
local_project_path: "/Users/paulmarshall/Software Development/state-workflow-engine"
source_type: "markdown-inbox"
capture_method: "explicit"
confidence: "high"
---

# Work Order: Add state-machine JSON import drop zone

## Project

state-workflow-engine

## Summary

Add a dedicated drop zone on the State Machine page of state-workflow-engine so users can import state-machine .json files by dragging them from Finder. Keep the existing Import State Machine button and make both import paths share the same parsing, normalization, validation, state replacement, selected-state update, and user messaging behavior.

## Problem Statement

The editor currently supports state-machine JSON import through the hidden file input and Import State Machine button only. Users cannot drag a state-machine .json file from Finder into the app, and adding drag import must avoid duplicating importer behavior or disrupting existing internal drag-and-drop row reordering.

## Goal

The State Machine page shows a visible import drop zone that accepts valid state-machine JSON files from Finder, loads them into the editor with the same behavior as the existing import button, rejects unsupported or invalid files with clear feedback, and preserves existing state-row, workflow-action, and workflow-bucket drag behavior.

## Non-Goal

This Work Order does not add workflow JSON drag import, change exported state-machine or workflow schemas, introduce runtime workflow behavior, or change release, Docker, publishing, or external integration behavior.

## Scope

### In Scope

- Add a visible import drop zone to the State Machine page, positioned near the metadata and validation controls using the app's existing panel and status styling.
- Allow users to drag a .json file from Finder onto the drop zone to import a state-machine definition.
- Allow users to click or keyboard-activate the drop zone to open the existing state-machine file picker.
- Extract or reuse a shared importStateMachineFile(file) helper so file-input import and drop-zone import use the same JSON parsing, normalizeImportedDefinition behavior, validateStateMachineDefinition behavior, state replacement, selected-state update, and message handling.
- Accept external JSON files by .json filename or application/json MIME type, with browser-tolerant handling for cases where Finder does not provide a useful MIME type.
- Show clear feedback for unsupported file types, invalid JSON, and invalid state-machine definitions while preserving the current loaded definition on failure.
- Scope drag handlers to the drop zone so internal drag interactions for state rows, workflow actions, and workflow buckets continue to work.
- Add focused React component tests for valid drop import, click/file-picker import, invalid JSON preservation, non-JSON rejection, and existing reorder drag behavior.
- Run npm run verify before marking the Work Order complete.

### Out of Scope

- Do not add workflow JSON drag import or change linked or bundled workflow import behavior.
- Do not change public library APIs in src/lib or alter the state-machine core contract.
- Do not add an overwrite confirmation dialog; import continues to replace the current editor definition when validation succeeds.
- Do not add runtime workflow actions, guards, side effects, persistence, authorization, logging, jobs, retries, or idempotency.
- Do not change app versioning, Docker behavior, release behavior, publishing, or external service integrations.

## Acceptance Criteria

- [ ] AC-001: The State Machine page displays a visible drop zone for state-machine JSON import, and the drop zone is absent from Workflow and Settings pages.
- [ ] AC-002: Dropping a valid state-machine .json file onto the drop zone updates Target App, State Machine ID, State Machine Version, states, selected state, validation status, and Mermaid preview consistently with the existing file-input import path.
- [ ] AC-003: Clicking or keyboard-activating the drop zone opens the existing state-machine file input, and importing through that path still works.
- [ ] AC-004: Dropping invalid JSON or an invalid state-machine definition shows an actionable error message and leaves the previous loaded definition unchanged.
- [ ] AC-005: Dropping a non-JSON file is rejected with a clear unsupported-file message and does not mutate editor state.
- [ ] AC-006: Existing drag reordering tests for states, workflow actions, and workflow buckets continue to pass, proving the file drop zone does not hijack internal drag behavior.
- [ ] AC-007: npm run verify completes successfully.

## Codex Instructions

- Work only within the local project folder.
- Inspect the existing implementation before editing.
- Keep changes focused on this Work Order.
- Run relevant tests where possible.
- Create follow-up Work Orders for newly discovered work.

## Source

Create a Work Order for the state-workflow-engine feature that adds a dedicated State Machine page drop zone for importing state-machine .json files from Finder. Include the complete implementation scope, exclusions, acceptance criteria, and verification requirements without referring to an external plan.

## Completion Report

Pending.
