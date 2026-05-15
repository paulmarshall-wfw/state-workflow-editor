import {
  StateMachineDefinition,
  StateMachineValidationError,
  canTransition,
  defineStateMachine,
  isTerminalState,
  validateStateMachineDefinition,
} from "./stateMachine";

export const WORKFLOW_SCHEMA_VERSION = "0.1.0" as const;

export type WorkflowSchemaVersion = typeof WORKFLOW_SCHEMA_VERSION;

export type WorkflowStateMachineReference = {
  id: string;
  definitionVersion: string;
};

export type WorkflowAction<State extends string = string> = {
  id: string;
  label: string;
  from: State;
  to: State;
};

export type WorkflowDefinition<State extends string = string> = {
  schemaVersion: WorkflowSchemaVersion;
  appName: string;
  workflowVersion: string;
  id: string;
  stateMachine: WorkflowStateMachineReference;
  embeddedStateMachineDefinition?: StateMachineDefinition<State>;
  actions: readonly WorkflowAction<State>[];
};

export type WorkflowValidationCode =
  | "invalid_schema_version"
  | "missing_app_name"
  | "missing_workflow_version"
  | "invalid_workflow_version"
  | "missing_id"
  | "invalid_action_id"
  | "duplicate_action"
  | "missing_action_label"
  | "missing_state_machine_reference"
  | "state_machine_reference_mismatch"
  | "invalid_embedded_state_machine"
  | "missing_state_machine_definition"
  | "unknown_action_state"
  | "illegal_action_transition"
  | "terminal_state_has_action";

export type WorkflowValidationError = {
  code: WorkflowValidationCode;
  message: string;
  path: string;
};

export type WorkflowValidationResult = {
  valid: boolean;
  errors: WorkflowValidationError[];
};

export type DefinedWorkflow<State extends string = string> = {
  definition: WorkflowDefinition<State>;
  stateMachine: ReturnType<typeof defineStateMachine<State>>;
  actionsByState: ReadonlyMap<State, readonly WorkflowAction<State>[]>;
  actionTargets: ReadonlyMap<string, State>;
};

export class WorkflowDefinitionError extends Error {
  readonly errors: WorkflowValidationError[];

  constructor(errors: WorkflowValidationError[]) {
    super(errors.map((error) => error.message).join("; "));
    this.name = "WorkflowDefinitionError";
    this.errors = errors;
  }
}

export function validateWorkflowDefinition<State extends string>(
  workflow: WorkflowDefinition<State>,
  stateMachineDefinition?: StateMachineDefinition<State>,
): WorkflowValidationResult {
  const errors: WorkflowValidationError[] = [];
  const actionCounts = countValues(workflow.actions.map((action) => action.id));
  const embeddedStateMachine = workflow.embeddedStateMachineDefinition;
  const effectiveStateMachine = embeddedStateMachine ?? stateMachineDefinition;

  if (workflow.schemaVersion !== WORKFLOW_SCHEMA_VERSION) {
    errors.push({
      code: "invalid_schema_version",
      message: `Workflow schema version must be ${WORKFLOW_SCHEMA_VERSION}.`,
      path: "schemaVersion",
    });
  }

  if (!workflow.appName.trim()) {
    errors.push({
      code: "missing_app_name",
      message: "App name is required.",
      path: "appName",
    });
  }

  if (!workflow.workflowVersion.trim()) {
    errors.push({
      code: "missing_workflow_version",
      message: "Workflow version is required.",
      path: "workflowVersion",
    });
  } else if (!isValidWorkflowVersion(workflow.workflowVersion)) {
    errors.push({
      code: "invalid_workflow_version",
      message: "Workflow version must use a numbered SemVer value such as 0.1.0.",
      path: "workflowVersion",
    });
  }

  if (!workflow.id.trim()) {
    errors.push({
      code: "missing_id",
      message: "Workflow ID is required.",
      path: "id",
    });
  }

  if (!workflow.stateMachine.id.trim() || !workflow.stateMachine.definitionVersion.trim()) {
    errors.push({
      code: "missing_state_machine_reference",
      message: "Workflow must reference a state machine ID and definition version.",
      path: "stateMachine",
    });
  }

  if (embeddedStateMachine) {
    const embeddedValidation = validateStateMachineDefinition(embeddedStateMachine);

    if (!embeddedValidation.valid) {
      errors.push(
        ...embeddedValidation.errors.map((error) => embeddedStateMachineError(error)),
      );
    }
  }

  if (!effectiveStateMachine) {
    errors.push({
      code: "missing_state_machine_definition",
      message: "A state machine definition is required to validate workflow actions.",
      path: "stateMachine",
    });
  } else if (
    effectiveStateMachine.id !== workflow.stateMachine.id ||
    effectiveStateMachine.definitionVersion !== workflow.stateMachine.definitionVersion
  ) {
    errors.push({
      code: "state_machine_reference_mismatch",
      message: "Workflow state machine reference must match the loaded or embedded state machine definition.",
      path: "stateMachine",
    });
  }

  for (const [actionId, count] of actionCounts) {
    if (count > 1) {
      errors.push({
        code: "duplicate_action",
        message: `Action "${actionId}" is defined more than once.`,
        path: "actions",
      });
    }
  }

  if (!effectiveStateMachine) {
    return { valid: errors.length === 0, errors };
  }

  let machine: ReturnType<typeof defineStateMachine<State>> | null = null;

  try {
    machine = defineStateMachine(effectiveStateMachine);
  } catch {
    return { valid: errors.length === 0, errors };
  }

  workflow.actions.forEach((action, index) => {
    if (!isValidActionId(action.id)) {
      errors.push({
        code: "invalid_action_id",
        message: `Action "${action.id}" must be a lowercase string literal using letters, numbers, and underscores.`,
        path: `actions.${index}.id`,
      });
    }

    if (!action.label.trim()) {
      errors.push({
        code: "missing_action_label",
        message: `Action "${action.id || index + 1}" needs a label.`,
        path: `actions.${index}.label`,
      });
    }

    if (!machine?.states.has(action.from) || !machine.states.has(action.to)) {
      errors.push({
        code: "unknown_action_state",
        message: `Action "${action.id}" references an unknown state.`,
        path: `actions.${index}`,
      });
      return;
    }

    if (isTerminalState(machine, action.from)) {
      errors.push({
        code: "terminal_state_has_action",
        message: `Action "${action.id}" cannot start from terminal state "${action.from}".`,
        path: `actions.${index}.from`,
      });
    }

    if (!canTransition(machine, action.from, action.to)) {
      errors.push({
        code: "illegal_action_transition",
        message: `Action "${action.id}" maps to an illegal transition "${action.from} -> ${action.to}".`,
        path: `actions.${index}`,
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function defineWorkflow<State extends string>(
  workflow: WorkflowDefinition<State>,
  stateMachineDefinition?: StateMachineDefinition<State>,
): DefinedWorkflow<State> {
  const validation = validateWorkflowDefinition(workflow, stateMachineDefinition);

  if (!validation.valid) {
    throw new WorkflowDefinitionError(validation.errors);
  }

  const effectiveStateMachineDefinition = workflow.embeddedStateMachineDefinition ?? stateMachineDefinition;

  if (!effectiveStateMachineDefinition) {
    throw new WorkflowDefinitionError([
      {
        code: "missing_state_machine_definition",
        message: "A state machine definition is required to define a workflow.",
        path: "stateMachine",
      },
    ]);
  }

  const stateMachine = defineStateMachine(effectiveStateMachineDefinition);
  const actionsByState = new Map<State, WorkflowAction<State>[]>();
  const actionTargets = new Map<string, State>();

  for (const state of stateMachine.definition.states) {
    actionsByState.set(state, []);
  }

  for (const action of workflow.actions) {
    actionsByState.get(action.from)?.push({ ...action });
    actionTargets.set(action.id, action.to);
  }

  return {
    definition: {
      schemaVersion: workflow.schemaVersion,
      appName: workflow.appName,
      workflowVersion: workflow.workflowVersion,
      id: workflow.id,
      stateMachine: { ...workflow.stateMachine },
      embeddedStateMachineDefinition: workflow.embeddedStateMachineDefinition
        ? {
            ...workflow.embeddedStateMachineDefinition,
            states: [...workflow.embeddedStateMachineDefinition.states],
            terminalStates: [...workflow.embeddedStateMachineDefinition.terminalStates],
            transitions: workflow.embeddedStateMachineDefinition.transitions.map((transition) => ({ ...transition })),
          }
        : undefined,
      actions: workflow.actions.map((action) => ({ ...action })),
    },
    stateMachine,
    actionsByState,
    actionTargets,
  };
}

export function getAllowedActions<State extends string>(
  workflow: DefinedWorkflow<State>,
  currentState: State,
): readonly WorkflowAction<State>[] {
  return [...(workflow.actionsByState.get(currentState) ?? [])];
}

export function getActionTargetState<State extends string>(
  workflow: DefinedWorkflow<State>,
  actionId: string,
): State | undefined {
  return workflow.actionTargets.get(actionId);
}

function embeddedStateMachineError(error: StateMachineValidationError): WorkflowValidationError {
  return {
    code: "invalid_embedded_state_machine",
    message: `Embedded state machine definition is invalid: ${error.message}`,
    path: `embeddedStateMachineDefinition.${error.path}`,
  };
}

function countValues(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function isValidActionId(actionId: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(actionId);
}

function isValidWorkflowVersion(version: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}
