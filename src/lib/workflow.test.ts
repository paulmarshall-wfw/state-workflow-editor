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

  it("rejects duplicate bucket state assignments", () => {
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

    expect(result.errors.map((error) => error.code)).toContain("duplicate_bucket_state");
  });

  it("rejects unmapped bucket states", () => {
    const result = validateWorkflowDefinition(
      {
        ...workflow,
        buckets: [{ id: "waiting", label: "Waiting", visible: true, states: ["queued"] }],
      },
      stateMachine,
    );

    expect(result.errors.map((error) => error.code)).toContain("unmapped_bucket_state");
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

  it("rejects user actions from hidden workflow states or hidden buckets", () => {
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

    expect(hiddenStateResult.errors.map((error) => error.code)).toContain("hidden_user_action_state");
    expect(hiddenBucketResult.errors.map((error) => error.code)).toContain("hidden_user_action_state");
  });

  it("accepts valid handler keys and rejects app-specific handler names that are not string identifiers", () => {
    const validResult = validateWorkflowDefinition(
      {
        ...workflow,
        actions: [{ ...workflow.actions[0], processing: { handlerKey: "publish_photo" } }],
      },
      stateMachine,
    );
    const invalidResult = validateWorkflowDefinition(
      {
        ...workflow,
        actions: [{ ...workflow.actions[0], processing: { handlerKey: "Publish Photo" } }],
      },
      stateMachine,
    );

    expect(validResult.valid).toBe(true);
    expect(invalidResult.errors.map((error) => error.code)).toContain("invalid_handler_key");
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
});
