import {
  StateMachineDefinition,
  StateMachineValidationError,
  canTransition,
  defineStateMachine,
  isTerminalState,
  validateStateMachineDefinition,
} from "./stateMachine";

export const WORKFLOW_SCHEMA_VERSION = "0.7.0" as const;

export type WorkflowSchemaVersion = typeof WORKFLOW_SCHEMA_VERSION;

export type WorkflowStateMachineReference = {
  id: string;
  definitionVersion: string;
};

export type WorkflowActionTrigger = "user" | "automatic";

export type WorkflowAction<State extends string = string> = {
  id: string;
  label: string;
  from: State;
  to: State;
  trigger: WorkflowActionTrigger;
  visible: boolean;
};

export type WorkflowLifecyclePhase =
  | "before_transition"
  | "on_state_entry"
  | "while_in_state"
  | "on_terminal_entry";

export type WorkflowLifecycleTargetType = "action" | "state";

export type WorkflowLifecycleHandler = {
  handlerKey?: string;
};

export type WorkflowLifecycleHookSchedule =
  | {
      trigger: "after_duration";
      delayMs: number;
    }
  | {
      trigger: "every_interval";
      intervalMs: number;
    };

export type WorkflowLifecycleHookRetryPolicy = {
  maxAttempts: number;
  delayMs: number;
};

export type WorkflowLifecycleHook<State extends string = string> = {
  id: string;
  phase: WorkflowLifecyclePhase;
  targetType: WorkflowLifecycleTargetType;
  targetId: string;
  handlerKey?: string;
  schedule?: WorkflowLifecycleHookSchedule;
  retryPolicy?: WorkflowLifecycleHookRetryPolicy;
  onSuccess?: WorkflowLifecycleHandler;
  onFailure?: WorkflowLifecycleHandler;
};

export type WorkflowBucket<State extends string = string> = {
  id: string;
  label: string;
  visible: boolean;
  states: readonly State[];
};

export type WorkflowStatePresentation<State extends string = string> = {
  id: State;
  visible: boolean;
};

export type WorkflowDefinition<State extends string = string> = {
  schemaVersion: WorkflowSchemaVersion;
  appName: string;
  workflowVersion: string;
  id: string;
  stateMachine: WorkflowStateMachineReference;
  embeddedStateMachineDefinition?: StateMachineDefinition<State>;
  states: readonly WorkflowStatePresentation<State>[];
  actions: readonly WorkflowAction<State>[];
  buckets: readonly WorkflowBucket<State>[];
  hooks: readonly WorkflowLifecycleHook<State>[];
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
  | "terminal_state_has_action"
  | "invalid_action_trigger"
  | "visible_automatic_action"
  | "hidden_user_action"
  | "invalid_handler_key"
  | "invalid_hook_id"
  | "invalid_hook_phase"
  | "invalid_hook_target_type"
  | "duplicate_lifecycle_hook"
  | "unknown_hook_action"
  | "unknown_hook_state"
  | "non_terminal_hook_state"
  | "missing_lifecycle_schedule"
  | "invalid_lifecycle_schedule_trigger"
  | "invalid_lifecycle_schedule_duration"
  | "lifecycle_schedule_on_unsupported_phase"
  | "missing_scheduled_handler"
  | "lifecycle_retry_on_unsupported_phase"
  | "invalid_lifecycle_retry_policy"
  | "duplicate_workflow_state"
  | "unknown_workflow_state"
  | "missing_workflow_state"
  | "invalid_bucket_id"
  | "duplicate_bucket"
  | "missing_bucket_label"
  | "unknown_bucket_state";

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
  bucketsByState: ReadonlyMap<State, WorkflowBucket<State>>;
  statePresentationByState: ReadonlyMap<State, WorkflowStatePresentation<State>>;
  hooksByTarget: ReadonlyMap<string, readonly WorkflowLifecycleHook<State>[]>;
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
  const bucketCounts = countValues(workflow.buckets.map((bucket) => bucket.id));
  const workflowStateCounts = countValues(workflow.states.map((state) => state.id));
  const hookTargetCounts = countValues(
    workflow.hooks.map((hook) => lifecycleHookTargetKey(hook.phase, hook.targetType, hook.targetId)),
  );
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

  for (const [bucketId, count] of bucketCounts) {
    if (count > 1) {
      errors.push({
        code: "duplicate_bucket",
        message: `Bucket "${bucketId}" is defined more than once.`,
        path: "buckets",
      });
    }
  }

  for (const [stateId, count] of workflowStateCounts) {
    if (count > 1) {
      errors.push({
        code: "duplicate_workflow_state",
        message: `Workflow state metadata for "${stateId}" is defined more than once.`,
        path: "states",
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

  const stateVisibility = new Map<State, boolean>();

  workflow.states.forEach((state, index) => {
    if (!machine?.states.has(state.id)) {
      errors.push({
        code: "unknown_workflow_state",
        message: `Workflow state metadata references unknown state "${state.id}".`,
        path: `states.${index}.id`,
      });
      return;
    }

    stateVisibility.set(state.id, state.visible);
  });

  for (const state of machine.definition.states) {
    if (!stateVisibility.has(state)) {
      errors.push({
        code: "missing_workflow_state",
        message: `Workflow state metadata must include state "${state}".`,
        path: "states",
      });
    }
  }

  workflow.actions.forEach((action, index) => {
    if (!isValidWorkflowActionId(action.id)) {
      errors.push({
        code: "invalid_action_id",
        message: `Action "${action.id}" must use lowercase dotted identifier segments such as memo.accept or accepted.reopen_as_memo.`,
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

    if (action.trigger !== "user" && action.trigger !== "automatic") {
      errors.push({
        code: "invalid_action_trigger",
        message: `Action "${action.id}" trigger must be "user" or "automatic".`,
        path: `actions.${index}.trigger`,
      });
    }

    if (action.trigger === "user" && !action.visible) {
      errors.push({
        code: "hidden_user_action",
        message: `User-triggered action "${action.id}" must be visible.`,
        path: `actions.${index}.visible`,
      });
    }

    if (action.trigger === "automatic" && action.visible) {
      errors.push({
        code: "visible_automatic_action",
        message: `Automatic action "${action.id}" must be hidden from user controls.`,
        path: `actions.${index}.visible`,
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

  workflow.buckets.forEach((bucket, bucketIndex) => {
    if (!isValidWorkflowIdentifier(bucket.id)) {
      errors.push({
        code: "invalid_bucket_id",
        message: `Bucket "${bucket.id}" must be a lowercase string literal using letters, numbers, and underscores.`,
        path: `buckets.${bucketIndex}.id`,
      });
    }

    if (!bucket.label.trim()) {
      errors.push({
        code: "missing_bucket_label",
        message: `Bucket "${bucket.id || bucketIndex + 1}" needs a label.`,
        path: `buckets.${bucketIndex}.label`,
      });
    }
  });

  workflow.buckets.forEach((bucket, bucketIndex) => {
    bucket.states.forEach((state, stateIndex) => {
      if (!machine?.states.has(state)) {
        errors.push({
          code: "unknown_bucket_state",
          message: `Bucket "${bucket.id || bucketIndex + 1}" references unknown state "${state}".`,
          path: `buckets.${bucketIndex}.states.${stateIndex}`,
        });
        return;
      }

    });
  });

  const actionIds = new Set(workflow.actions.map((action) => action.id));

  for (const [hookTarget, count] of hookTargetCounts) {
    if (count > 1) {
      errors.push({
        code: "duplicate_lifecycle_hook",
        message: `Lifecycle hook target "${hookTarget}" is defined more than once.`,
        path: "hooks",
      });
    }
  }

  workflow.hooks.forEach((hook, index) => {
    if (!isValidWorkflowIdentifier(hook.id)) {
      errors.push({
        code: "invalid_hook_id",
        message: `Lifecycle hook "${hook.id}" must be a lowercase string literal using letters, numbers, and underscores.`,
        path: `hooks.${index}.id`,
      });
    }

    if (!isValidLifecyclePhase(hook.phase)) {
      errors.push({
        code: "invalid_hook_phase",
        message: `Lifecycle hook "${hook.id || index + 1}" has an unsupported phase.`,
        path: `hooks.${index}.phase`,
      });
    }

    if (hook.targetType !== "action" && hook.targetType !== "state") {
      errors.push({
        code: "invalid_hook_target_type",
        message: `Lifecycle hook "${hook.id || index + 1}" must target an action or state.`,
        path: `hooks.${index}.targetType`,
      });
    }

    validateHandlerKey(hook.handlerKey, `hooks.${index}.handlerKey`, hook.id, errors);
    validateHandlerKey(hook.onSuccess?.handlerKey, `hooks.${index}.onSuccess.handlerKey`, hook.id, errors);
    validateHandlerKey(hook.onFailure?.handlerKey, `hooks.${index}.onFailure.handlerKey`, hook.id, errors);
    validateLifecycleSchedule(hook, index, errors);
    validateLifecycleRetryPolicy(hook, index, errors);

    if (hook.phase === "before_transition") {
      if (hook.targetType !== "action" || !actionIds.has(hook.targetId)) {
        errors.push({
          code: "unknown_hook_action",
          message: `Before-transition hook "${hook.id || index + 1}" must reference an existing workflow action.`,
          path: `hooks.${index}.targetId`,
        });
      }
      return;
    }

    if (hook.targetType !== "state" || !machine?.states.has(hook.targetId as State)) {
      errors.push({
        code: "unknown_hook_state",
        message: `Lifecycle hook "${hook.id || index + 1}" must reference an existing state.`,
        path: `hooks.${index}.targetId`,
      });
      return;
    }

    if (hook.phase === "on_terminal_entry" && !isTerminalState(machine, hook.targetId as State)) {
      errors.push({
        code: "non_terminal_hook_state",
        message: `Terminal-entry hook "${hook.id || index + 1}" must reference a terminal state.`,
        path: `hooks.${index}.targetId`,
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
  const bucketsByState = new Map<State, WorkflowBucket<State>>();
  const statePresentationByState = new Map<State, WorkflowStatePresentation<State>>();
  const hooksByTarget = new Map<string, WorkflowLifecycleHook<State>[]>();

  for (const state of stateMachine.definition.states) {
    actionsByState.set(state, []);
  }

  for (const action of workflow.actions) {
    actionsByState.get(action.from)?.push(copyAction(action));
    actionTargets.set(action.id, action.to);
  }

  for (const bucket of workflow.buckets) {
    const copiedBucket = { ...bucket, states: [...bucket.states] };

    for (const state of bucket.states) {
      bucketsByState.set(state, copiedBucket);
    }
  }

  for (const state of workflow.states) {
    statePresentationByState.set(state.id, { ...state });
  }

  for (const hook of workflow.hooks) {
    const targetKey = lifecycleHookTargetKey(hook.phase, hook.targetType, hook.targetId);
    const hooks = hooksByTarget.get(targetKey) ?? [];

    hooks.push(copyLifecycleHook(hook));
    hooksByTarget.set(targetKey, hooks);
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
            entryStates: [...workflow.embeddedStateMachineDefinition.entryStates],
            terminalStates: [...workflow.embeddedStateMachineDefinition.terminalStates],
            transitions: workflow.embeddedStateMachineDefinition.transitions.map((transition) => ({ ...transition })),
          }
        : undefined,
      states: workflow.states.map((state) => ({ ...state })),
      actions: workflow.actions.map(copyAction),
      buckets: workflow.buckets.map((bucket) => ({ ...bucket, states: [...bucket.states] })),
      hooks: workflow.hooks.map(copyLifecycleHook),
    },
    stateMachine,
    actionsByState,
    actionTargets,
    bucketsByState,
    statePresentationByState,
    hooksByTarget,
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

function copyAction<State extends string>(action: WorkflowAction<State>): WorkflowAction<State> {
  return {
    ...action,
  };
}

function copyLifecycleHook<State extends string>(hook: WorkflowLifecycleHook<State>): WorkflowLifecycleHook<State> {
  return {
    ...hook,
    schedule: hook.schedule ? { ...hook.schedule } : undefined,
    retryPolicy: hook.retryPolicy ? { ...hook.retryPolicy } : undefined,
    onSuccess: hook.onSuccess ? { ...hook.onSuccess } : undefined,
    onFailure: hook.onFailure ? { ...hook.onFailure } : undefined,
  };
}

function isValidWorkflowActionId(actionId: string): boolean {
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(actionId);
}

function isValidWorkflowIdentifier(identifier: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(identifier);
}

function isValidLifecyclePhase(phase: string): phase is WorkflowLifecyclePhase {
  return (
    phase === "before_transition" ||
    phase === "on_state_entry" ||
    phase === "while_in_state" ||
    phase === "on_terminal_entry"
  );
}

function lifecycleHookTargetKey(phase: string, targetType: string, targetId: string): string {
  return `${phase}:${targetType}:${targetId}`;
}

function validateHandlerKey(
  handlerKey: string | undefined,
  path: string,
  hookId: string,
  errors: WorkflowValidationError[],
) {
  if (handlerKey && !isValidWorkflowIdentifier(handlerKey)) {
    errors.push({
      code: "invalid_handler_key",
      message: `Lifecycle hook "${hookId || path}" handler key must use lowercase letters, numbers, and underscores.`,
      path,
    });
  }
}

function validateLifecycleSchedule<State extends string>(
  hook: WorkflowLifecycleHook<State>,
  index: number,
  errors: WorkflowValidationError[],
) {
  const schedule = hook.schedule;

  if (hook.phase !== "while_in_state") {
    if (schedule) {
      errors.push({
        code: "lifecycle_schedule_on_unsupported_phase",
        message: `Lifecycle hook "${hook.id || index + 1}" can only define a schedule for while-in-state hooks.`,
        path: `hooks.${index}.schedule`,
      });
    }
    return;
  }

  if (!schedule) {
    errors.push({
      code: "missing_lifecycle_schedule",
      message: `While-in-state hook "${hook.id || index + 1}" must define a schedule.`,
      path: `hooks.${index}.schedule`,
    });
    return;
  }

  if (!hook.handlerKey) {
    errors.push({
      code: "missing_scheduled_handler",
      message: `Scheduled lifecycle hook "${hook.id || index + 1}" must define a handler key.`,
      path: `hooks.${index}.handlerKey`,
    });
  }

  const scheduleRecord = schedule as Record<string, unknown>;

  if (scheduleRecord.trigger !== "after_duration" && scheduleRecord.trigger !== "every_interval") {
    errors.push({
      code: "invalid_lifecycle_schedule_trigger",
      message: `Lifecycle hook "${hook.id || index + 1}" schedule trigger must be after_duration or every_interval.`,
      path: `hooks.${index}.schedule.trigger`,
    });
    return;
  }

  const durationPath = scheduleRecord.trigger === "after_duration" ? "delayMs" : "intervalMs";
  const durationValue = scheduleRecord[durationPath];

  if (!Number.isInteger(durationValue) || Number(durationValue) <= 0) {
    errors.push({
      code: "invalid_lifecycle_schedule_duration",
      message: `Lifecycle hook "${hook.id || index + 1}" schedule ${durationPath} must be a positive integer.`,
      path: `hooks.${index}.schedule.${durationPath}`,
    });
  }
}

function validateLifecycleRetryPolicy<State extends string>(
  hook: WorkflowLifecycleHook<State>,
  index: number,
  errors: WorkflowValidationError[],
) {
  if (!hook.retryPolicy) {
    return;
  }

  if (hook.phase !== "while_in_state") {
    errors.push({
      code: "lifecycle_retry_on_unsupported_phase",
      message: `Lifecycle hook "${hook.id || index + 1}" can only define retry policy for while-in-state hooks.`,
      path: `hooks.${index}.retryPolicy`,
    });
    return;
  }

  const retryPolicy = hook.retryPolicy as Record<string, unknown>;

  if (!Number.isInteger(retryPolicy.maxAttempts) || Number(retryPolicy.maxAttempts) <= 0) {
    errors.push({
      code: "invalid_lifecycle_retry_policy",
      message: `Lifecycle hook "${hook.id || index + 1}" retry maxAttempts must be a positive integer.`,
      path: `hooks.${index}.retryPolicy.maxAttempts`,
    });
  }

  if (!Number.isInteger(retryPolicy.delayMs) || Number(retryPolicy.delayMs) < 0) {
    errors.push({
      code: "invalid_lifecycle_retry_policy",
      message: `Lifecycle hook "${hook.id || index + 1}" retry delayMs must be a non-negative integer.`,
      path: `hooks.${index}.retryPolicy.delayMs`,
    });
  }
}

function isValidWorkflowVersion(version: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}
