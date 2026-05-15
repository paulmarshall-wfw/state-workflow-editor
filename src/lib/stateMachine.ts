export const STATE_MACHINE_SCHEMA_VERSION = "0.2.0" as const;

export type StateMachineSchemaVersion = typeof STATE_MACHINE_SCHEMA_VERSION;

export type StateTransition<State extends string = string> = {
  from: State;
  to: State;
};

export type StateMachineDefinition<State extends string = string> = {
  schemaVersion: StateMachineSchemaVersion;
  appName: string;
  definitionVersion: string;
  id: string;
  states: readonly State[];
  terminalStates: readonly State[];
  transitions: readonly StateTransition<State>[];
};

export type StateMachineValidationCode =
  | "invalid_schema_version"
  | "missing_app_name"
  | "missing_definition_version"
  | "invalid_definition_version"
  | "missing_id"
  | "empty_states"
  | "invalid_state_id"
  | "duplicate_state"
  | "unknown_terminal_state"
  | "duplicate_terminal_state"
  | "unknown_transition_state"
  | "duplicate_transition"
  | "terminal_state_has_outgoing_transition";

export type StateMachineValidationError = {
  code: StateMachineValidationCode;
  message: string;
  path: string;
};

export type StateMachineValidationResult = {
  valid: boolean;
  errors: StateMachineValidationError[];
};

export type DefinedStateMachine<State extends string = string> = {
  definition: StateMachineDefinition<State>;
  states: ReadonlySet<State>;
  terminalStates: ReadonlySet<State>;
  transitions: ReadonlySet<string>;
  outgoingTransitions: ReadonlyMap<State, readonly State[]>;
};

export type TransitionResult<State extends string = string> = {
  from: State;
  to: State;
  allowed: true;
};

export class StateMachineDefinitionError extends Error {
  readonly errors: StateMachineValidationError[];

  constructor(errors: StateMachineValidationError[]) {
    super(errors.map((error) => error.message).join("; "));
    this.name = "StateMachineDefinitionError";
    this.errors = errors;
  }
}

export class StateTransitionError extends Error {
  readonly from: string;
  readonly to: string;

  constructor(from: string, to: string, message: string) {
    super(message);
    this.name = "StateTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function validateStateMachineDefinition<State extends string>(
  definition: StateMachineDefinition<State>,
): StateMachineValidationResult {
  const errors: StateMachineValidationError[] = [];
  const stateCounts = countValues(definition.states);
  const states = new Set(definition.states);
  const terminalCounts = countValues(definition.terminalStates);
  const terminalStates = new Set(definition.terminalStates);
  const transitionCounts = new Map<string, number>();

  if (definition.schemaVersion !== STATE_MACHINE_SCHEMA_VERSION) {
    errors.push({
      code: "invalid_schema_version",
      message: `Schema version must be ${STATE_MACHINE_SCHEMA_VERSION}.`,
      path: "schemaVersion",
    });
  }

  if (!definition.id.trim()) {
    errors.push({
      code: "missing_id",
      message: "State machine ID is required.",
      path: "id",
    });
  }

  if (!definition.appName.trim()) {
    errors.push({
      code: "missing_app_name",
      message: "App name is required.",
      path: "appName",
    });
  }

  if (!definition.definitionVersion.trim()) {
    errors.push({
      code: "missing_definition_version",
      message: "State definition version is required.",
      path: "definitionVersion",
    });
  } else if (!isValidDefinitionVersion(definition.definitionVersion)) {
    errors.push({
      code: "invalid_definition_version",
      message: "State definition version must use a numbered SemVer value such as 0.1.0.",
      path: "definitionVersion",
    });
  }

  if (definition.states.length === 0) {
    errors.push({
      code: "empty_states",
      message: "At least one state is required.",
      path: "states",
    });
  }

  definition.states.forEach((state, index) => {
    if (!isValidStateId(state)) {
      errors.push({
        code: "invalid_state_id",
        message: `State "${state}" must be a lowercase string literal using letters, numbers, and underscores.`,
        path: `states.${index}`,
      });
    }
  });

  for (const [state, count] of stateCounts) {
    if (count > 1) {
      errors.push({
        code: "duplicate_state",
        message: `State "${state}" is defined more than once.`,
        path: "states",
      });
    }
  }

  definition.terminalStates.forEach((state, index) => {
    if (!states.has(state)) {
      errors.push({
        code: "unknown_terminal_state",
        message: `Terminal state "${state}" is not listed in states.`,
        path: `terminalStates.${index}`,
      });
    }
  });

  for (const [state, count] of terminalCounts) {
    if (count > 1) {
      errors.push({
        code: "duplicate_terminal_state",
        message: `Terminal state "${state}" is listed more than once.`,
        path: "terminalStates",
      });
    }
  }

  definition.transitions.forEach((transition, index) => {
    if (!states.has(transition.from) || !states.has(transition.to)) {
      errors.push({
        code: "unknown_transition_state",
        message: `Transition "${transition.from} -> ${transition.to}" references an unknown state.`,
        path: `transitions.${index}`,
      });
    }

    const key = transitionKey(transition.from, transition.to);
    transitionCounts.set(key, (transitionCounts.get(key) ?? 0) + 1);

    if (terminalStates.has(transition.from)) {
      errors.push({
        code: "terminal_state_has_outgoing_transition",
        message: `Terminal state "${transition.from}" cannot have outgoing transitions.`,
        path: `transitions.${index}`,
      });
    }
  });

  for (const [key, count] of transitionCounts) {
    if (count > 1) {
      errors.push({
        code: "duplicate_transition",
        message: `Transition "${key.replace("->", " -> ")}" is defined more than once.`,
        path: "transitions",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function defineStateMachine<State extends string>(
  definition: StateMachineDefinition<State>,
): DefinedStateMachine<State> {
  const validation = validateStateMachineDefinition(definition);

  if (!validation.valid) {
    throw new StateMachineDefinitionError(validation.errors);
  }

  const outgoingTransitions = new Map<State, State[]>();

  for (const state of definition.states) {
    outgoingTransitions.set(state, []);
  }

  for (const transition of definition.transitions) {
    outgoingTransitions.get(transition.from)?.push(transition.to);
  }

  return {
    definition: {
      schemaVersion: definition.schemaVersion,
      appName: definition.appName,
      definitionVersion: definition.definitionVersion,
      id: definition.id,
      states: [...definition.states],
      terminalStates: [...definition.terminalStates],
      transitions: definition.transitions.map((transition) => ({ ...transition })),
    },
    states: new Set(definition.states),
    terminalStates: new Set(definition.terminalStates),
    transitions: new Set(
      definition.transitions.map((transition) => transitionKey(transition.from, transition.to)),
    ),
    outgoingTransitions,
  };
}

export function canTransition<State extends string>(
  machine: DefinedStateMachine<State>,
  from: State,
  to: State,
): boolean {
  return machine.states.has(from) && machine.states.has(to) && machine.transitions.has(transitionKey(from, to));
}

export function assertTransition<State extends string>(
  machine: DefinedStateMachine<State>,
  from: State,
  to: State,
): TransitionResult<State> {
  if (!machine.states.has(from)) {
    throw new StateTransitionError(from, to, `Unknown source state "${from}".`);
  }

  if (!machine.states.has(to)) {
    throw new StateTransitionError(from, to, `Unknown target state "${to}".`);
  }

  if (!canTransition(machine, from, to)) {
    throw new StateTransitionError(from, to, `Transition "${from} -> ${to}" is not allowed.`);
  }

  return { from, to, allowed: true };
}

export function getAllowedTargetStates<State extends string>(
  machine: DefinedStateMachine<State>,
  from: State,
): readonly State[] {
  return [...(machine.outgoingTransitions.get(from) ?? [])];
}

export function isTerminalState<State extends string>(
  machine: DefinedStateMachine<State>,
  state: State,
): boolean {
  return machine.terminalStates.has(state);
}

function transitionKey(from: string, to: string): string {
  return `${from}->${to}`;
}

function countValues(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function isValidStateId(state: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(state);
}

function isValidDefinitionVersion(version: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}
