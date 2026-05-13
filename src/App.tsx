import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  STATE_MACHINE_SCHEMA_VERSION,
  StateMachineDefinition,
  defineStateMachine,
  validateStateMachineDefinition,
} from "./lib";

type EditableDefinition = StateMachineDefinition<string>;

const initialDefinition: EditableDefinition = {
  schemaVersion: STATE_MACHINE_SCHEMA_VERSION,
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

export function App() {
  const [definition, setDefinition] = useState<EditableDefinition>(initialDefinition);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const validation = useMemo(() => validateStateMachineDefinition(definition), [definition]);
  const machine = useMemo(() => {
    if (!validation.valid) {
      return null;
    }

    return defineStateMachine(definition);
  }, [definition, validation.valid]);
  const stateOptions = Array.from(new Set(definition.states.filter(Boolean)));

  function updateId(id: string) {
    setDefinition((current) => ({ ...current, id }));
  }

  function addState() {
    setDefinition((current) => {
      const nextState = nextUniqueStateId(current.states);

      return {
        ...current,
        states: [...current.states, nextState],
      };
    });
  }

  function renameState(index: number, nextState: string) {
    setDefinition((current) => {
      const previousState = current.states[index];
      const nextStates = current.states.map((state, stateIndex) => (stateIndex === index ? nextState : state));

      return {
        ...current,
        states: nextStates,
        terminalStates: current.terminalStates.map((state) => (state === previousState ? nextState : state)),
        transitions: current.transitions.map((transition) => ({
          from: transition.from === previousState ? nextState : transition.from,
          to: transition.to === previousState ? nextState : transition.to,
        })),
      };
    });
  }

  function removeState(index: number) {
    setDefinition((current) => {
      const removedState = current.states[index];

      return {
        ...current,
        states: current.states.filter((_, stateIndex) => stateIndex !== index),
        terminalStates: current.terminalStates.filter((state) => state !== removedState),
        transitions: current.transitions.filter(
          (transition) => transition.from !== removedState && transition.to !== removedState,
        ),
      };
    });
  }

  function toggleTerminalState(state: string, checked: boolean) {
    setDefinition((current) => ({
      ...current,
      terminalStates: checked
        ? Array.from(new Set([...current.terminalStates, state]))
        : current.terminalStates.filter((terminalState) => terminalState !== state),
    }));
  }

  function addTransition() {
    setDefinition((current) => {
      const from = current.states[0] ?? "";
      const to = current.states[1] ?? current.states[0] ?? "";

      return {
        ...current,
        transitions: [...current.transitions, { from, to }],
      };
    });
  }

  function updateTransition(index: number, field: "from" | "to", value: string) {
    setDefinition((current) => ({
      ...current,
      transitions: current.transitions.map((transition, transitionIndex) =>
        transitionIndex === index ? { ...transition, [field]: value } : transition,
      ),
    }));
  }

  function removeTransition(index: number) {
    setDefinition((current) => ({
      ...current,
      transitions: current.transitions.filter((_, transitionIndex) => transitionIndex !== index),
    }));
  }

  function exportDefinition() {
    const blob = new Blob([`${JSON.stringify(definition, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${definition.id || "state-machine"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importDefinition(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as EditableDefinition;
      const nextDefinition = normalizeImportedDefinition(parsed);
      const result = validateStateMachineDefinition(nextDefinition);

      if (!result.valid) {
        setImportError(result.errors.map((error) => error.message).join(" "));
        return;
      }

      setDefinition(nextDefinition);
      setImportError(null);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to import definition.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">State Machine Core</p>
          <h1>Definition Editor</h1>
        </div>
        <div className="header-actions">
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={importDefinition}
            aria-label="Import JSON definition"
          />
          <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()}>
            Import JSON
          </button>
          <button type="button" onClick={exportDefinition} disabled={!validation.valid}>
            Export JSON
          </button>
        </div>
      </header>

      <section className="workspace-grid">
        <div className="editor-column">
          <section className="panel machine-panel">
            <label htmlFor="machine-id">Machine ID</label>
            <input
              id="machine-id"
              value={definition.id}
              onChange={(event) => updateId(event.target.value)}
              spellCheck={false}
            />
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>States</h2>
              <button type="button" className="secondary compact" onClick={addState}>
                Add State
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>State ID</th>
                    <th>Terminal</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {definition.states.map((state, index) => (
                    <tr key={`state-row-${index}`}>
                      <td>
                        <input
                          aria-label={`State ${index + 1} ID`}
                          value={state}
                          onChange={(event) => renameState(index, event.target.value)}
                          spellCheck={false}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${state || `State ${index + 1}`} terminal`}
                          checked={definition.terminalStates.includes(state)}
                          onChange={(event) => toggleTerminalState(state, event.target.checked)}
                          disabled={!state}
                        />
                      </td>
                      <td className="row-action">
                        <button type="button" className="ghost compact" onClick={() => removeState(index)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Transitions</h2>
              <button
                type="button"
                className="secondary compact"
                onClick={addTransition}
                disabled={definition.states.length === 0}
              >
                Add Transition
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>To</th>
                    <th>
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {definition.transitions.map((transition, index) => (
                    <tr key={`transition-row-${index}`}>
                      <td>
                        <StateSelect
                          label={`Transition ${index + 1} source`}
                          value={transition.from}
                          states={stateOptions}
                          onChange={(value) => updateTransition(index, "from", value)}
                        />
                      </td>
                      <td>
                        <StateSelect
                          label={`Transition ${index + 1} target`}
                          value={transition.to}
                          states={stateOptions}
                          onChange={(value) => updateTransition(index, "to", value)}
                        />
                      </td>
                      <td className="row-action">
                        <button type="button" className="ghost compact" onClick={() => removeTransition(index)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="preview-column">
          <section className="panel status-panel" aria-live="polite">
            <div className="panel-heading">
              <h2>Validation</h2>
              <span className={validation.valid ? "status ok" : "status error"}>
                {validation.valid ? "Valid" : `${validation.errors.length} issue${validation.errors.length === 1 ? "" : "s"}`}
              </span>
            </div>
            {importError ? <p className="error-message">{importError}</p> : null}
            {validation.valid ? (
              <p className="valid-message">Ready to export.</p>
            ) : (
              <ul className="error-list">
                {validation.errors.map((error, index) => (
                  <li key={`${error.code}-${error.path}-${index}`}>
                    <strong>{error.path}</strong> {error.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel graph-panel">
            <div className="panel-heading">
              <h2>Preview</h2>
              <span className="schema-version">v{definition.schemaVersion}</span>
            </div>
            {machine ? <StateGraph machine={machine.definition} /> : <div className="empty-graph">No preview</div>}
          </section>
        </aside>
      </section>
    </main>
  );
}

function StateSelect({
  label,
  value,
  states,
  onChange,
}: {
  label: string;
  value: string;
  states: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {!states.includes(value) ? <option value={value}>{value || "Select state"}</option> : null}
      {states.map((state) => (
        <option key={state} value={state}>
          {state}
        </option>
      ))}
    </select>
  );
}

function StateGraph({ machine }: { machine: EditableDefinition }) {
  const width = 640;
  const height = 380;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(210, Math.max(120, machine.states.length * 22));
  const positions = new Map(
    machine.states.map((state, index) => {
      const angle = (Math.PI * 2 * index) / machine.states.length - Math.PI / 2;

      return [
        state,
        {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * Math.min(radius, 130),
        },
      ];
    }),
  );

  return (
    <svg className="state-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="State graph preview">
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" />
        </marker>
      </defs>
      {machine.transitions.map((transition, index) => {
        const from = positions.get(transition.from);
        const to = positions.get(transition.to);

        if (!from || !to) {
          return null;
        }

        const isSelfTransition = transition.from === transition.to;
        const path = isSelfTransition
          ? `M ${from.x - 8} ${from.y - 28} C ${from.x - 65} ${from.y - 90}, ${from.x + 65} ${from.y - 90}, ${from.x + 8} ${from.y - 28}`
          : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

        return <path key={`${transition.from}-${transition.to}-${index}`} className="edge" d={path} markerEnd="url(#arrow)" />;
      })}
      {machine.states.map((state) => {
        const position = positions.get(state);

        if (!position) {
          return null;
        }

        const isTerminal = machine.terminalStates.includes(state);

        return (
          <g key={state} className={isTerminal ? "node terminal" : "node"}>
            <circle cx={position.x} cy={position.y} r="38" />
            {isTerminal ? <circle cx={position.x} cy={position.y} r="31" className="terminal-ring" /> : null}
            <text x={position.x} y={position.y} textAnchor="middle" dominantBaseline="middle">
              {state}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function nextUniqueStateId(states: readonly string[]) {
  let index = states.length + 1;
  let candidate = `state_${index}`;

  while (states.includes(candidate)) {
    index += 1;
    candidate = `state_${index}`;
  }

  return candidate;
}

function normalizeImportedDefinition(value: Partial<EditableDefinition>): EditableDefinition {
  return {
    schemaVersion: value.schemaVersion ?? STATE_MACHINE_SCHEMA_VERSION,
    id: value.id ?? "",
    states: Array.isArray(value.states) ? value.states : [],
    terminalStates: Array.isArray(value.terminalStates) ? value.terminalStates : [],
    transitions: Array.isArray(value.transitions) ? value.transitions : [],
  };
}
