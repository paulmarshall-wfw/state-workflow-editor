import { describe, expect, it } from "vitest";
import { StateMachineDefinition } from "./stateMachine";
import {
  WORKFLOW_SCHEMA_VERSION,
  WorkflowDefinition,
  defineWorkflow,
  getActionTargetState,
  getAllowedActions,
  validateWorkflowDefinition,
} from "./workflow";

const stateMachine: StateMachineDefinition = {
  schemaVersion: "0.2.0",
  appName: "Example Project",
  definitionVersion: "0.1.0",
  id: "scan_job_state",
  states: ["queued", "running", "completed", "failed", "cancelled"],
  terminalStates: ["completed", "cancelled"],
  transitions: [
    { from: "queued", to: "running" },
    { from: "running", to: "completed" },
    { from: "running", to: "failed" },
    { from: "failed", to: "queued" },
    { from: "queued", to: "cancelled" },
    { from: "running", to: "cancelled" },
  ],
};

const workflow: WorkflowDefinition = {
  schemaVersion: WORKFLOW_SCHEMA_VERSION,
  appName: "Example Project",
  workflowVersion: "0.1.0",
  id: "scan_job_workflow",
  stateMachine: {
    id: "scan_job_state",
    definitionVersion: "0.1.0",
  },
  states: stateMachine.states.map((state) => ({ id: state, visible: true })),
  actions: [
    { id: "start", label: "Start", from: "queued", to: "running", trigger: "user", visible: true },
    { id: "complete", label: "Complete", from: "running", to: "completed", trigger: "user", visible: true },
    { id: "fail", label: "Fail", from: "running", to: "failed", trigger: "user", visible: true },
    { id: "retry", label: "Retry", from: "failed", to: "queued", trigger: "user", visible: true },
  ],
  buckets: [
    { id: "waiting", label: "Waiting", visible: true, states: ["queued"] },
    { id: "active", label: "Active", visible: true, states: ["running", "failed"] },
    { id: "finished", label: "Finished", visible: true, states: ["completed", "cancelled"] },
  ],
  hooks: [],
};

describe("workflow definition validation", () => {
  it("accepts a valid linked workflow definition", () => {
    const result = validateWorkflowDefinition(workflow, stateMachine);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts a valid embedded workflow definition", () => {
    const result = validateWorkflowDefinition({
      ...workflow,
      embeddedStateMachineDefinition: stateMachine,
    });

    expect(result.valid).toBe(true);
  });

  it("rejects missing metadata and invalid workflow versions", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        appName: "",
        workflowVersion: "draft",
        id: "",
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["missing_app_name", "invalid_workflow_version", "missing_id"]),
    );
  });

  it("rejects duplicate and invalid action IDs", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        actions: [
          ...workflow.actions,
          { id: "start", label: "Duplicate start", from: "queued", to: "running", trigger: "user", visible: true },
          { id: "Bad Action", label: "Bad action", from: "queued", to: "running", trigger: "user", visible: true },
        ],
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["duplicate_action", "invalid_action_id"]),
    );
  });

  it("accepts semantic dotted action IDs", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        actions: [
          { id: "ingestion.promote_to_memo", label: "Promote", from: "queued", to: "running", trigger: "user", visible: true },
          { id: "memo.accept", label: "Accept", from: "running", to: "completed", trigger: "user", visible: true },
          { id: "accepted.reopen_as_memo", label: "Reopen", from: "failed", to: "queued", trigger: "user", visible: true },
        ],
      },
      stateMachine,
    );

    expect(result.valid).toBe(true);
  });

  it("rejects malformed dotted action IDs", () => {
    const invalidIds = ["Bad.Action", "bad action", ".bad", "bad.", "bad..action"];

    const result = validateWorkflowDefinition(
      {
        ...workflow,
        actions: invalidIds.map((id) => ({
          id,
          label: "Invalid",
          from: "queued",
          to: "running",
          trigger: "user",
          visible: true,
        })),
      },
      stateMachine,
    );

    expect(result.errors.filter((error) => error.code === "invalid_action_id")).toHaveLength(invalidIds.length);
  });

  it("rejects duplicate and invalid workflow bucket IDs", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        buckets: [
          ...workflow.buckets,
          { id: "waiting", label: "Duplicate waiting", visible: true, states: [] },
          { id: "Bad Bucket", label: "Bad bucket", visible: true, states: [] },
        ],
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["duplicate_bucket", "invalid_bucket_id"]),
    );
  });

  it("rejects workflow buckets without labels", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        buckets: [{ id: "waiting", label: "", visible: true, states: stateMachine.states }],
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toContain("missing_bucket_label");
  });

  it("rejects bucket mappings to unknown states", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        buckets: [{ id: "workflow", label: "Workflow", visible: true, states: [...stateMachine.states, "archived"] }],
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toContain("unknown_bucket_state");
  });

  it("allows duplicate bucket state assignments because buckets are presentation metadata", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        buckets: [
          { id: "waiting", label: "Waiting", visible: true, states: ["queued", "running", "completed", "failed", "cancelled"] },
          { id: "also_waiting", label: "Also waiting", visible: true, states: ["queued"] },
        ],
      },
      stateMachine,
    );

    expect(result.valid).toBe(true);
  });

  it("allows unmapped states and empty bucket overlays", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        buckets: [],
      },
      stateMachine,
    );

    expect(result.valid).toBe(true);
  });

  it("rejects unknown action states", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        actions: [{ id: "archive", label: "Archive", from: "queued", to: "archived", trigger: "user", visible: true }],
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toContain("unknown_action_state");
  });

  it("rejects action mappings that are not legal state-machine transitions", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        actions: [{ id: "skip", label: "Skip", from: "queued", to: "completed", trigger: "user", visible: true }],
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toContain("illegal_action_transition");
  });

  it("rejects actions from terminal states", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        actions: [{ id: "restart", label: "Restart", from: "completed", to: "queued", trigger: "user", visible: true }],
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["terminal_state_has_action", "illegal_action_transition"]),
    );
  });

  it("rejects a linked state-machine mismatch", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        stateMachine: { id: "other_state", definitionVersion: "0.1.0" },
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toContain("state_machine_reference_mismatch");
  });

  it("rejects an embedded state-machine mismatch", () => {
    const result = validateWorkflowDefinition({
      ...workflow,
      embeddedStateMachineDefinition: {
        ...stateMachine,
        id: "other_state",
      },
    });

    expect(result.errors.map((error) => error.code)).toContain("state_machine_reference_mismatch");
  });

  it("rejects duplicate, unknown, and missing workflow state presentation metadata", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        states: [
          { id: "queued", visible: true },
          { id: "queued", visible: false },
          { id: "archived", visible: true },
        ],
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["duplicate_workflow_state", "unknown_workflow_state", "missing_workflow_state"]),
    );
  });

  it("rejects hidden user actions and visible automatic actions", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        actions: [
          { id: "hidden_user", label: "Hidden User", from: "queued", to: "running", trigger: "user", visible: false },
          { id: "visible_auto", label: "Visible Auto", from: "queued", to: "running", trigger: "automatic", visible: true },
        ],
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["hidden_user_action", "visible_automatic_action"]),
    );
  });

  it("keeps user actions valid when workflow states or buckets are hidden", () => {
    const hiddenStateResult = validateWorkflowDefinition(
      {
        ...workflow,
        states: workflow.states.map((state) => (state.id === "queued" ? { ...state, visible: false } : state)),
      },
      stateMachine,
    );
    const hiddenBucketResult = validateWorkflowDefinition(
      {
        ...workflow,
        buckets: workflow.buckets.map((bucket) => (bucket.id === "waiting" ? { ...bucket, visible: false } : bucket)),
      },
      stateMachine,
    );

    expect(hiddenStateResult.valid).toBe(true);
    expect(hiddenBucketResult.valid).toBe(true);
  });

  it("accepts lifecycle hooks and keeps hook IDs and handler keys snake_case", () => {
    const validResult = validateWorkflowDefinition(
      {
        ...workflow,
        hooks: [
          {
            id: "start_processing",
            phase: "before_transition",
            targetType: "action",
            targetId: "start",
            handlerKey: "publish_photo",
            onSuccess: { handlerKey: "publish_done" },
            onFailure: { handlerKey: "publish_failed" },
          },
        ],
      },
      stateMachine,
    );
    const invalidResult = validateWorkflowDefinition(
      {
        ...workflow,
        hooks: [
          {
            id: "start.processing",
            phase: "before_transition",
            targetType: "action",
            targetId: "start",
            handlerKey: "Publish Photo",
          },
        ],
      },
      stateMachine,
    );

    expect(validResult.valid).toBe(true);
    expect(invalidResult.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["invalid_hook_id", "invalid_handler_key"]),
    );
  });

  it("rejects lifecycle hooks with duplicate or unknown targets", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        hooks: [
          { id: "before_start", phase: "before_transition", targetType: "action", targetId: "start" },
          { id: "before_start_again", phase: "before_transition", targetType: "action", targetId: "start" },
          { id: "before_missing", phase: "before_transition", targetType: "action", targetId: "missing_action" },
          { id: "entry_missing", phase: "on_state_entry", targetType: "state", targetId: "missing_state" },
          { id: "terminal_running", phase: "on_terminal_entry", targetType: "state", targetId: "running" },
        ],
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "duplicate_lifecycle_hook",
        "unknown_hook_action",
        "unknown_hook_state",
        "non_terminal_hook_state",
      ]),
    );
  });

  it("accepts scheduled while-in-state hooks with retry policy", () => {
    const afterDurationResult = validateWorkflowDefinition(
      {
        ...workflow,
        hooks: [
          {
            id: "while_running",
            phase: "while_in_state",
            targetType: "state",
            targetId: "running",
            handlerKey: "check_running",
            schedule: { trigger: "after_duration", delayMs: 60000 },
            retryPolicy: { maxAttempts: 3, delayMs: 1000 },
          },
        ],
      },
      stateMachine,
    );
    const everyIntervalResult = validateWorkflowDefinition(
      {
        ...workflow,
        hooks: [
          {
            id: "while_failed",
            phase: "while_in_state",
            targetType: "state",
            targetId: "failed",
            handlerKey: "check_failed",
            schedule: { trigger: "every_interval", intervalMs: 900000 },
          },
        ],
      },
      stateMachine,
    );

    expect(afterDurationResult.valid).toBe(true);
    expect(everyIntervalResult.valid).toBe(true);
  });

  it("rejects invalid lifecycle schedules and retry policies", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        hooks: [
          {
            id: "while_running",
            phase: "while_in_state",
            targetType: "state",
            targetId: "running",
          },
          {
            id: "while_failed",
            phase: "while_in_state",
            targetType: "state",
            targetId: "failed",
            handlerKey: "check_failed",
            schedule: { trigger: "every_interval", intervalMs: 0 },
          },
          {
            id: "while_queued",
            phase: "while_in_state",
            targetType: "state",
            targetId: "queued",
            handlerKey: "check_queued",
            schedule: { trigger: "every_interval", intervalMs: 1.5 },
            retryPolicy: { maxAttempts: 0, delayMs: -1 },
          },
          {
            id: "while_cancelled",
            phase: "while_in_state",
            targetType: "state",
            targetId: "cancelled",
            handlerKey: "check_cancelled",
            schedule: { trigger: "every_minute", intervalMs: 60000 },
          } as unknown as WorkflowDefinition["hooks"][number],
          {
            id: "while_completed",
            phase: "while_in_state",
            targetType: "state",
            targetId: "completed",
            schedule: { trigger: "after_duration", delayMs: 60000 },
          },
          {
            id: "entry_running",
            phase: "on_state_entry",
            targetType: "state",
            targetId: "running",
            schedule: { trigger: "after_duration", delayMs: 60000 },
            retryPolicy: { maxAttempts: 3, delayMs: 1000 },
          },
        ],
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "missing_lifecycle_schedule",
        "missing_scheduled_handler",
        "invalid_lifecycle_schedule_trigger",
        "invalid_lifecycle_schedule_duration",
        "lifecycle_retry_on_unsupported_phase",
        "invalid_lifecycle_retry_policy",
        "lifecycle_schedule_on_unsupported_phase",
      ]),
    );
  });

  it("preserves copied schedule and retry policy data when defining workflows", () => {
    const definedWorkflow = defineWorkflow(
      {
        ...workflow,
        hooks: [
          {
            id: "while_running",
            phase: "while_in_state",
            targetType: "state",
            targetId: "running",
            handlerKey: "check_running",
            schedule: { trigger: "every_interval", intervalMs: 900000 },
            retryPolicy: { maxAttempts: 3, delayMs: 60000 },
          },
        ],
      },
      stateMachine,
    );
    const hook = definedWorkflow.definition.hooks[0];

    expect(hook.schedule).toEqual({ trigger: "every_interval", intervalMs: 900000 });
    expect(hook.retryPolicy).toEqual({ maxAttempts: 3, delayMs: 60000 });
    expect(hook.schedule).not.toBe(workflow.hooks[0]?.schedule);
  });
});

describe("workflow runtime helpers", () => {
  it("returns allowed actions and target states", () => {
    const definedWorkflow = defineWorkflow(workflow, stateMachine);

    expect(getAllowedActions(definedWorkflow, "queued").map((action) => action.id)).toEqual(["start"]);
    expect(getActionTargetState(definedWorkflow, "complete")).toBe("completed");
    expect(definedWorkflow.bucketsByState.get("queued")?.id).toBe("waiting");
    expect(definedWorkflow.statePresentationByState.get("queued")?.visible).toBe(true);
  });

  it("indexes lifecycle hooks by phase and target", () => {
    const definedWorkflow = defineWorkflow(
      {
        ...workflow,
        hooks: [{ id: "before_start", phase: "before_transition", targetType: "action", targetId: "start" }],
      },
      stateMachine,
    );

    expect(definedWorkflow.hooksByTarget.get("before_transition:action:start")?.[0]?.id).toBe("before_start");
  });
});
