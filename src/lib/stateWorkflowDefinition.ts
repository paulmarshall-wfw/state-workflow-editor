import {
  STATE_MACHINE_SCHEMA_VERSION,
  StateMachineDefinition,
  StateMachineValidationError,
  validateStateMachineDefinition,
} from "./stateMachine";
import {
  WORKFLOW_SCHEMA_VERSION,
  WorkflowAction,
  WorkflowActionTrigger,
  WorkflowDefinition,
  WorkflowLifecycleHook,
  WorkflowLifecyclePhase,
  WorkflowValidationError,
  validateWorkflowDefinition,
} from "./workflow";

export const STATE_WORKFLOW_DEFINITION_SCHEMA_VERSION = "2.0.0" as const;
const COMPATIBLE_STATE_WORKFLOW_DEFINITION_SCHEMA_VERSIONS = [
  STATE_WORKFLOW_DEFINITION_SCHEMA_VERSION,
  "1.0.0",
] as const;

export type StateWorkflowDefinitionSchemaVersion = typeof STATE_WORKFLOW_DEFINITION_SCHEMA_VERSION;

export type BundledStateMachineDefinition<State extends string = string> = Omit<
  StateMachineDefinition<State>,
  "schemaVersion" | "appName" | "definitionVersion"
>;

export type BundledWorkflowDefinition<State extends string = string> = Omit<
  WorkflowDefinition<State>,
  "schemaVersion" | "appName" | "workflowVersion" | "stateMachine" | "embeddedStateMachineDefinition"
>;

export type StateWorkflowDefinitionBundle<State extends string = string> = {
  schemaVersion: StateWorkflowDefinitionSchemaVersion;
  appName: string;
  id: string;
  definitionVersion: string;
  stateMachineDefinition: BundledStateMachineDefinition<State>;
  workflowDefinition: BundledWorkflowDefinition<State>;
};

export type StateWorkflowDefinitionValidationCode =
  | "invalid_schema_version"
  | "missing_app_name"
  | "missing_id"
  | "missing_definition_version"
  | "invalid_definition_version"
  | "state_machine_id_mismatch"
  | "invalid_state_machine_definition"
  | "invalid_workflow_definition";

export type StateWorkflowDefinitionValidationError = {
  code: StateWorkflowDefinitionValidationCode;
  message: string;
  path: string;
};

export type StateWorkflowDefinitionValidationResult = {
  valid: boolean;
  errors: StateWorkflowDefinitionValidationError[];
};

export type LegacyBundledWorkflowDefinition<State extends string = string> = WorkflowDefinition<State> & {
  embeddedStateMachineDefinition: StateMachineDefinition<State>;
};

export function createStateWorkflowDefinitionBundle<State extends string>(
  stateMachineDefinition: StateMachineDefinition<State>,
  workflowDefinition: WorkflowDefinition<State>,
): StateWorkflowDefinitionBundle<State> {
  return {
    schemaVersion: STATE_WORKFLOW_DEFINITION_SCHEMA_VERSION,
    appName: stateMachineDefinition.appName,
    id: stateMachineDefinition.id,
    definitionVersion: stateMachineDefinition.definitionVersion,
    stateMachineDefinition: stripStateMachineMetadata(stateMachineDefinition),
    workflowDefinition: stripWorkflowMetadata(workflowDefinition),
  };
}

export function buildValidationStateMachineDefinition<State extends string>(
  bundle: StateWorkflowDefinitionBundle<State>,
): StateMachineDefinition<State> {
  return {
    schemaVersion: STATE_MACHINE_SCHEMA_VERSION,
    appName: bundle.appName,
    definitionVersion: bundle.definitionVersion,
    ...bundle.stateMachineDefinition,
    id: bundle.stateMachineDefinition.id || bundle.id,
  };
}

export function buildValidationWorkflowDefinition<State extends string>(
  bundle: StateWorkflowDefinitionBundle<State>,
): WorkflowDefinition<State> {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    appName: bundle.appName,
    workflowVersion: bundle.definitionVersion,
    ...bundle.workflowDefinition,
    stateMachine: {
      id: bundle.id,
      definitionVersion: bundle.definitionVersion,
    },
  };
}

export function validateStateWorkflowDefinitionBundle<State extends string>(
  bundle: StateWorkflowDefinitionBundle<State>,
): StateWorkflowDefinitionValidationResult {
  const errors: StateWorkflowDefinitionValidationError[] = [];

  if (bundle.schemaVersion !== STATE_WORKFLOW_DEFINITION_SCHEMA_VERSION) {
    errors.push({
      code: "invalid_schema_version",
      message: `State workflow definition schema version must be ${STATE_WORKFLOW_DEFINITION_SCHEMA_VERSION}.`,
      path: "schemaVersion",
    });
  }

  if (!bundle.appName.trim()) {
    errors.push({
      code: "missing_app_name",
      message: "App name is required.",
      path: "appName",
    });
  }

  if (!bundle.id.trim()) {
    errors.push({
      code: "missing_id",
      message: "Definition ID is required.",
      path: "id",
    });
  }

  if (!bundle.definitionVersion.trim()) {
    errors.push({
      code: "missing_definition_version",
      message: "Definition version is required.",
      path: "definitionVersion",
    });
  } else if (!isValidSemVer(bundle.definitionVersion)) {
    errors.push({
      code: "invalid_definition_version",
      message: "Definition version must use a numbered SemVer value such as 0.1.0.",
      path: "definitionVersion",
    });
  }

  if (bundle.stateMachineDefinition.id && bundle.stateMachineDefinition.id !== bundle.id) {
    errors.push({
      code: "state_machine_id_mismatch",
      message: "State-machine definition ID must match the top-level definition ID.",
      path: "stateMachineDefinition.id",
    });
  }

  const stateMachineDefinition = buildValidationStateMachineDefinition(bundle);
  const workflowDefinition = buildValidationWorkflowDefinition(bundle);
  const stateMachineValidation = validateStateMachineDefinition(stateMachineDefinition);

  if (!stateMachineValidation.valid) {
    errors.push(...stateMachineValidation.errors.map(bundleStateMachineError));
  }

  const workflowValidation = validateWorkflowDefinition(workflowDefinition, stateMachineDefinition);

  if (!workflowValidation.valid) {
    errors.push(...workflowValidation.errors.map(bundleWorkflowError));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeStateWorkflowDefinitionBundle(
  value: unknown,
): StateWorkflowDefinitionBundle<string> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (isStrictBundleRecord(record)) {
    return normalizeStrictBundle(record);
  }

  if (isLegacyBundledWorkflowRecord(record)) {
    return normalizeLegacyBundledWorkflow(record);
  }

  return null;
}

function normalizeStrictBundle(record: Record<string, unknown>): StateWorkflowDefinitionBundle<string> {
  const stateMachineRecord = readRecord(record.stateMachineDefinition);
  const workflowRecord = readRecord(record.workflowDefinition);
  const id = readString(record.id) || readString(stateMachineRecord.id);
  const definitionVersion = readString(record.definitionVersion);
  const states = readStringArray(stateMachineRecord.states);

  return {
    schemaVersion: STATE_WORKFLOW_DEFINITION_SCHEMA_VERSION,
    appName: readString(record.appName),
    id,
    definitionVersion,
    stateMachineDefinition: {
      id: readString(stateMachineRecord.id) || id,
      states,
      entryStates: readStringArray(stateMachineRecord.entryStates),
      terminalStates: readStringArray(stateMachineRecord.terminalStates),
      transitions: normalizeTransitions(stateMachineRecord.transitions),
    },
    workflowDefinition: {
      id: readString(workflowRecord.id),
      states: normalizeWorkflowStates(workflowRecord.states, states),
      actions: normalizeWorkflowActions(workflowRecord.actions),
      buckets: normalizeWorkflowBuckets(workflowRecord.buckets),
      hooks: normalizeWorkflowHooks(workflowRecord.hooks),
    },
  };
}

function normalizeLegacyBundledWorkflow(record: Record<string, unknown>): StateWorkflowDefinitionBundle<string> {
  const embeddedStateMachineRecord = readRecord(record.embeddedStateMachineDefinition);
  const stateMachineReferenceRecord = readRecord(record.stateMachine);
  const embeddedDefinitionVersion = readString(embeddedStateMachineRecord.definitionVersion);
  const definitionVersion =
    readString(stateMachineReferenceRecord.definitionVersion) ||
    embeddedDefinitionVersion ||
    readString(record.workflowVersion);
  const appName = readString(record.appName) || readString(embeddedStateMachineRecord.appName);
  const id = readString(embeddedStateMachineRecord.id) || readString(stateMachineReferenceRecord.id);
  const states = readStringArray(embeddedStateMachineRecord.states);

  return {
    schemaVersion: STATE_WORKFLOW_DEFINITION_SCHEMA_VERSION,
    appName,
    id,
    definitionVersion,
    stateMachineDefinition: {
      id,
      states,
      entryStates: readStringArray(embeddedStateMachineRecord.entryStates),
      terminalStates: readStringArray(embeddedStateMachineRecord.terminalStates),
      transitions: normalizeTransitions(embeddedStateMachineRecord.transitions),
    },
    workflowDefinition: {
      id: readString(record.id),
      states: normalizeWorkflowStates(record.states, states),
      actions: normalizeWorkflowActions(record.actions),
      buckets: normalizeWorkflowBuckets(record.buckets),
      hooks: normalizeWorkflowHooks(record.hooks),
    },
  };
}

function stripStateMachineMetadata<State extends string>(
  definition: StateMachineDefinition<State>,
): BundledStateMachineDefinition<State> {
  const {
    schemaVersion: _schemaVersion,
    appName: _appName,
    definitionVersion: _definitionVersion,
    ...stateMachineDefinition
  } = definition;

  return {
    ...stateMachineDefinition,
    states: [...stateMachineDefinition.states],
    entryStates: [...stateMachineDefinition.entryStates],
    terminalStates: [...stateMachineDefinition.terminalStates],
    transitions: stateMachineDefinition.transitions.map((transition) => ({ ...transition })),
  };
}

function stripWorkflowMetadata<State extends string>(
  workflow: WorkflowDefinition<State>,
): BundledWorkflowDefinition<State> {
  const {
    schemaVersion: _schemaVersion,
    appName: _appName,
    workflowVersion: _workflowVersion,
    stateMachine: _stateMachine,
    embeddedStateMachineDefinition: _embeddedStateMachineDefinition,
    ...workflowDefinition
  } = workflow;

  return {
    ...workflowDefinition,
    states: workflowDefinition.states.map((state) => ({ ...state })),
    actions: workflowDefinition.actions.map((action) => ({ ...action })),
    buckets: workflowDefinition.buckets.map((bucket) => ({ ...bucket, states: [...bucket.states] })),
    hooks: workflowDefinition.hooks.map((hook) => ({
      ...hook,
      schedule: hook.schedule ? { ...hook.schedule } : undefined,
      runLimit: hook.runLimit ? { ...hook.runLimit } : undefined,
      retryPolicy: hook.retryPolicy ? { ...hook.retryPolicy } : undefined,
      onSuccess: hook.onSuccess ? { ...hook.onSuccess } : undefined,
      onFailure: hook.onFailure ? { ...hook.onFailure } : undefined,
    })),
  };
}

function bundleStateMachineError(error: StateMachineValidationError): StateWorkflowDefinitionValidationError {
  return {
    code: "invalid_state_machine_definition",
    message: `State-machine definition is invalid: ${error.message}`,
    path: `stateMachineDefinition.${error.path}`,
  };
}

function bundleWorkflowError(error: WorkflowValidationError): StateWorkflowDefinitionValidationError {
  return {
    code: "invalid_workflow_definition",
    message: `Workflow definition is invalid: ${error.message}`,
    path: `workflowDefinition.${error.path}`,
  };
}

function isLegacyBundledWorkflowRecord(record: Record<string, unknown>) {
  return Boolean(record.embeddedStateMachineDefinition) && Array.isArray(record.actions) && Array.isArray(record.buckets);
}

function isStrictBundleRecord(record: Record<string, unknown>) {
  return (
    typeof record.schemaVersion === "string" &&
    COMPATIBLE_STATE_WORKFLOW_DEFINITION_SCHEMA_VERSIONS.includes(
      record.schemaVersion as (typeof COMPATIBLE_STATE_WORKFLOW_DEFINITION_SCHEMA_VERSIONS)[number],
    ) &&
    Boolean(record.stateMachineDefinition) &&
    Boolean(record.workflowDefinition)
  );
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeTransitions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((transition) => {
    const transitionRecord = readRecord(transition);

    return {
      from: readString(transitionRecord.from),
      to: readString(transitionRecord.to),
    };
  });
}

function normalizeWorkflowStates(value: unknown, states: readonly string[]) {
  if (!Array.isArray(value)) {
    return states.map((state) => ({ id: state, visible: true }));
  }

  return value.map((state, index) => {
    if (typeof state === "string") {
      return { id: state, visible: true };
    }

    const stateRecord = readRecord(state);

    return {
      id: readString(stateRecord.id) || states[index] || "",
      visible: typeof stateRecord.visible === "boolean" ? stateRecord.visible : true,
    };
  });
}

function normalizeWorkflowActions(value: unknown): WorkflowAction<string>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((action) => {
    const actionRecord = readRecord(action);
    const trigger: WorkflowActionTrigger = actionRecord.trigger === "automatic" ? "automatic" : "user";

    return {
      id: readString(actionRecord.id),
      label: readString(actionRecord.label),
      from: readString(actionRecord.from),
      to: readString(actionRecord.to),
      trigger,
      visible: typeof actionRecord.visible === "boolean" ? actionRecord.visible : trigger === "user",
    };
  });
}

function normalizeWorkflowBuckets(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((bucket, index) => {
    const bucketRecord = readRecord(bucket);

    return {
      id: readString(bucketRecord.id) || `bucket_${index + 1}`,
      label: readString(bucketRecord.label) || `Bucket ${index + 1}`,
      visible: typeof bucketRecord.visible === "boolean" ? bucketRecord.visible : true,
      states: readStringArray(bucketRecord.states),
    };
  });
}

function normalizeWorkflowHooks(value: unknown): WorkflowLifecycleHook<string>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((hook, index) => {
    const hookRecord = readRecord(hook);
    const handlerKey = readString(hookRecord.handlerKey).trim();
    const onSuccess = normalizeHandler(hookRecord.onSuccess);
    const onFailure = normalizeHandler(hookRecord.onFailure);
    const phase = normalizeLifecyclePhase(hookRecord.phase);

    return {
      id: readString(hookRecord.id) || `hook_${index + 1}`,
      phase,
      targetType: hookRecord.targetType === "state" ? "state" : "action",
      targetId: readString(hookRecord.targetId),
      handlerKey: handlerKey || undefined,
      schedule:
        hookRecord.schedule && typeof hookRecord.schedule === "object"
          ? ({ ...hookRecord.schedule } as WorkflowLifecycleHook<string>["schedule"])
          : undefined,
      runLimit:
        hookRecord.runLimit && typeof hookRecord.runLimit === "object"
          ? ({ ...hookRecord.runLimit } as WorkflowLifecycleHook<string>["runLimit"])
          : undefined,
      retryPolicy:
        hookRecord.retryPolicy && typeof hookRecord.retryPolicy === "object"
          ? ({ ...hookRecord.retryPolicy } as WorkflowLifecycleHook<string>["retryPolicy"])
          : undefined,
      onSuccess,
      onFailure,
    };
  });
}

function normalizeLifecyclePhase(value: unknown): WorkflowLifecyclePhase {
  return value === "on_state_entry" ||
    value === "while_in_state" ||
    value === "on_terminal_entry" ||
    value === "before_transition"
    ? value
    : "before_transition";
}

function normalizeHandler(value: unknown): { handlerKey?: string } | undefined {
  const handlerRecord = readRecord(value);
  const handlerKey = readString(handlerRecord.handlerKey).trim();

  return handlerKey ? { handlerKey } : undefined;
}

function isValidSemVer(version: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version);
}
