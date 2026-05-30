import { describe, expect, it } from "vitest";
import {
  STATE_MACHINE_SCHEMA_VERSION,
  StateMachineDefinition,
  StateMachineDefinitionError,
  StateTransitionError,
  assertTransition,
  canTransition,
  defineStateMachine,
  getAllowedTargetStates,
  isEntryState,
  isTerminalState,
  validateStateMachineDefinition,
} from "./stateMachine";

const validDefinition = {
  schemaVersion: STATE_MACHINE_SCHEMA_VERSION,
  appName: "Example App",
  definitionVersion: "0.1.0",
  id: "scan_job_state",
  states: ["queued", "running", "completed", "failed", "cancelled"],
  entryStates: ["queued"],
  terminalStates: ["completed", "cancelled"],
  transitions: [
    { from: "queued", to: "running" },
    { from: "running", to: "completed" },
    { from: "running", to: "failed" },
    { from: "failed", to: "queued" },
    { from: "queued", to: "cancelled" },
    { from: "running", to: "cancelled" },
  ],
} as const satisfies StateMachineDefinition;

describe("validateStateMachineDefinition", () => {
  it("accepts a valid state machine definition", () => {
    expect(validateStateMachineDefinition(validDefinition)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("rejects duplicate states", () => {
    const result = validateStateMachineDefinition({
      ...validDefinition,
      states: ["queued", "queued", "running"],
      entryStates: [],
      terminalStates: [],
      transitions: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "duplicate_state",
      }),
    );
  });

  it("rejects unknown states in transitions", () => {
    const result = validateStateMachineDefinition({
      ...validDefinition,
      transitions: [{ from: "queued", to: "missing" }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "unknown_transition_state",
      }),
    );
  });

  it("rejects duplicate transitions", () => {
    const result = validateStateMachineDefinition({
      ...validDefinition,
      transitions: [
        { from: "queued", to: "running" },
        { from: "queued", to: "running" },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "duplicate_transition",
      }),
    );
  });

  it("rejects invalid terminal states", () => {
    const result = validateStateMachineDefinition({
      ...validDefinition,
      terminalStates: ["missing"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "unknown_terminal_state",
      }),
    );
  });

  it("accepts empty and terminal entry states", () => {
    expect(
      validateStateMachineDefinition({
        ...validDefinition,
        entryStates: [],
      }),
    ).toEqual({
      valid: true,
      errors: [],
    });

    expect(
      validateStateMachineDefinition({
        ...validDefinition,
        entryStates: ["completed"],
      }),
    ).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("rejects invalid entry states", () => {
    const result = validateStateMachineDefinition({
      ...validDefinition,
      entryStates: ["queued", "missing", "queued"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown_entry_state",
        }),
        expect.objectContaining({
          code: "duplicate_entry_state",
        }),
      ]),
    );
  });

  it("rejects outgoing transitions from terminal states", () => {
    const result = validateStateMachineDefinition({
      ...validDefinition,
      terminalStates: ["queued"],
      transitions: [{ from: "queued", to: "running" }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "terminal_state_has_outgoing_transition",
      }),
    );
  });

  it("rejects an empty state list", () => {
    const result = validateStateMachineDefinition({
      ...validDefinition,
      states: [],
      terminalStates: [],
      transitions: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "empty_states",
      }),
    );
  });

  it("rejects missing app names and invalid definition versions", () => {
    const result = validateStateMachineDefinition({
      ...validDefinition,
      appName: "",
      definitionVersion: "draft",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "missing_app_name",
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: "invalid_definition_version",
      }),
    );
  });
});

describe("state machine runtime", () => {
  it("checks allowed and rejected transitions", () => {
    const machine = defineStateMachine(validDefinition);

    expect(canTransition(machine, "queued", "running")).toBe(true);
    expect(canTransition(machine, "completed", "running")).toBe(false);
    expect(assertTransition(machine, "queued", "running")).toEqual({
      from: "queued",
      to: "running",
      allowed: true,
    });
    expect(() => assertTransition(machine, "completed", "running")).toThrow(StateTransitionError);
  });

  it("rejects invalid definitions at definition time", () => {
    expect(() =>
      defineStateMachine({
        ...validDefinition,
        terminalStates: ["queued"],
        transitions: [{ from: "queued", to: "running" }],
      }),
    ).toThrow(StateMachineDefinitionError);
  });

  it("returns allowed targets and terminal-state status", () => {
    const machine = defineStateMachine(validDefinition);

    expect(getAllowedTargetStates(machine, "running")).toEqual(["completed", "failed", "cancelled"]);
    expect(machine.entryStates).toEqual(new Set(["queued"]));
    expect(machine.definition.entryStates).toEqual(["queued"]);
    expect(isEntryState(machine, "queued")).toBe(true);
    expect(isEntryState(machine, "running")).toBe(false);
    expect(isTerminalState(machine, "completed")).toBe(true);
    expect(isTerminalState(machine, "running")).toBe(false);
  });

  it("does not mutate the supplied definition", () => {
    const definition = structuredClone(validDefinition);
    const original = structuredClone(definition);
    const machine = defineStateMachine(definition);

    expect(machine.definition).toEqual(original);
    expect(machine.definition.states).not.toBe(definition.states);
    expect(definition).toEqual(original);
  });

  it("preserves state IDs as string literal unions", () => {
    const machine = defineStateMachine(validDefinition);
    const state: (typeof machine.definition.states)[number] = "queued";

    expect(state).toBe("queued");
  });
});
