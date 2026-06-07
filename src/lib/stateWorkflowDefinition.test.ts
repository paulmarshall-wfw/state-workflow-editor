import { describe, expect, it } from "vitest";
import { StateMachineDefinition } from "./stateMachine";
import {
  STATE_WORKFLOW_DEFINITION_SCHEMA_VERSION,
  StateWorkflowDefinitionBundle,
  buildValidationStateMachineDefinition,
  buildValidationWorkflowDefinition,
  createStateWorkflowDefinitionBundle,
  normalizeStateWorkflowDefinitionBundle,
  validateStateWorkflowDefinitionBundle,
} from "./stateWorkflowDefinition";
import { WORKFLOW_SCHEMA_VERSION, WorkflowDefinition } from "./workflow";

const stateMachine: StateMachineDefinition<string> = {
  schemaVersion: "0.3.0",
  appName: "Example Project",
  definitionVersion: "0.1.0",
  id: "scan_job_state",
  states: ["queued", "running", "completed", "failed"],
  entryStates: ["queued"],
  terminalStates: ["completed"],
  transitions: [
    { from: "queued", to: "running" },
    { from: "running", to: "completed" },
    { from: "running", to: "failed" },
  ],
};

const workflow: WorkflowDefinition<string> = {
  schemaVersion: WORKFLOW_SCHEMA_VERSION,
  appName: "Example Project",
  workflowVersion: "0.1.0",
  id: "scan_job_workflow",
  stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
  states: stateMachine.states.map((state) => ({ id: state, visible: true })),
  actions: [{ id: "start", label: "Start", from: "queued", to: "running", trigger: "user", visible: true }],
  buckets: [{ id: "workflow", label: "Workflow", visible: true, states: ["queued", "running", "completed", "failed"] }],
  hooks: [
    {
      id: "while_in_state_failed",
      phase: "while_in_state",
      targetType: "state",
      targetId: "failed",
      handlerKey: "check_failed",
      schedule: { trigger: "daily", timeOfDay: "18:45" },
      runLimit: { maxRuns: 3 },
      retryPolicy: { maxAttempts: 2, delayMs: 60000 },
      onSuccess: { handlerKey: "record_success" },
      onFailure: { handlerKey: "record_failure" },
    },
  ],
};

describe("state workflow definition bundles", () => {
  it("exports one strict bundle version while stripping nested version metadata", () => {
    const bundle = createStateWorkflowDefinitionBundle(stateMachine, workflow);

    expect(bundle.schemaVersion).toBe(STATE_WORKFLOW_DEFINITION_SCHEMA_VERSION);
    expect(bundle.definitionVersion).toBe("0.1.0");
    expect("schemaVersion" in bundle.stateMachineDefinition).toBe(false);
    expect("appName" in bundle.stateMachineDefinition).toBe(false);
    expect("definitionVersion" in bundle.stateMachineDefinition).toBe(false);
    expect("schemaVersion" in bundle.workflowDefinition).toBe(false);
    expect("appName" in bundle.workflowDefinition).toBe(false);
    expect("workflowVersion" in bundle.workflowDefinition).toBe(false);
    expect("stateMachine" in bundle.workflowDefinition).toBe(false);
    expect("embeddedStateMachineDefinition" in bundle.workflowDefinition).toBe(false);
    expect(bundle.workflowDefinition.hooks).toEqual(workflow.hooks);
    expect(validateStateWorkflowDefinitionBundle(bundle).valid).toBe(true);
  });

  it("maps the bundle definition version back into validation models", () => {
    const bundle = createStateWorkflowDefinitionBundle(stateMachine, workflow);

    expect(buildValidationStateMachineDefinition(bundle).definitionVersion).toBe("0.1.0");
    expect(buildValidationWorkflowDefinition(bundle).workflowVersion).toBe("0.1.0");
    expect(buildValidationWorkflowDefinition(bundle).stateMachine).toEqual({
      id: "scan_job_state",
      definitionVersion: "0.1.0",
    });
  });

  it("rejects mismatched workflow references against the embedded state machine", () => {
    const bundle: StateWorkflowDefinitionBundle<string> = {
      ...createStateWorkflowDefinitionBundle(stateMachine, workflow),
      workflowDefinition: {
        ...createStateWorkflowDefinitionBundle(stateMachine, workflow).workflowDefinition,
        actions: [{ id: "bad", label: "Bad", from: "queued", to: "missing", trigger: "user", visible: true }],
      },
    };

    const result = validateStateWorkflowDefinitionBundle(bundle);

    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("invalid_workflow_definition");
  });

  it("normalizes old bundled workflow exports into strict bundle schema", () => {
    const normalized = normalizeStateWorkflowDefinitionBundle({
      ...workflow,
      workflowVersion: "9.9.9",
      embeddedStateMachineDefinition: stateMachine,
    });

    expect(normalized?.schemaVersion).toBe("2.0.0");
    expect(normalized?.definitionVersion).toBe("0.1.0");
    expect(normalized?.stateMachineDefinition.id).toBe("scan_job_state");
    expect(normalized?.workflowDefinition.id).toBe("scan_job_workflow");
    expect(validateStateWorkflowDefinitionBundle(normalized as StateWorkflowDefinitionBundle<string>).valid).toBe(true);
  });

  it("normalizes strict 1.0.0 bundle imports into the current strict bundle schema", () => {
    const currentBundle = createStateWorkflowDefinitionBundle(stateMachine, workflow);
    const normalized = normalizeStateWorkflowDefinitionBundle({
      ...currentBundle,
      schemaVersion: "1.0.0",
    });

    expect(normalized?.schemaVersion).toBe(STATE_WORKFLOW_DEFINITION_SCHEMA_VERSION);
    expect(normalized?.workflowDefinition.hooks).toEqual(workflow.hooks);
    expect(validateStateWorkflowDefinitionBundle(normalized as StateWorkflowDefinitionBundle<string>).valid).toBe(true);
  });

  it("reports the current strict schema version when validating stale bundles directly", () => {
    const staleBundle = {
      ...createStateWorkflowDefinitionBundle(stateMachine, workflow),
      schemaVersion: "1.0.0",
    } as unknown as StateWorkflowDefinitionBundle<string>;
    const result = validateStateWorkflowDefinitionBundle(staleBundle);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "invalid_schema_version",
        message: "State workflow definition schema version must be 2.0.0.",
      }),
    );
  });

  it("rejects standalone state-machine and linked workflow files from bundle normalization", () => {
    expect(normalizeStateWorkflowDefinitionBundle(stateMachine)).toBeNull();
    expect(normalizeStateWorkflowDefinitionBundle(workflow)).toBeNull();
  });
});
