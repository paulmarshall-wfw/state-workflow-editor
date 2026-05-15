import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import packageJson from "../package.json";
import {
  STATE_MACHINE_SCHEMA_VERSION,
  WORKFLOW_SCHEMA_VERSION,
  StateMachineDefinition,
  WorkflowAction,
  WorkflowBucket,
  WorkflowDefinition,
  defineStateMachine,
  defineWorkflow,
  validateStateMachineDefinition,
  validateWorkflowDefinition,
} from "./lib";

type EditableDefinition = StateMachineDefinition<string>;
type EditableWorkflowDefinition = WorkflowDefinition<string>;

type AppSettings = {
  logoUrl: string;
  theme: "light" | "dark";
};

type FileSystemWritable = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};

type FileSystemFileHandle = {
  createWritable: () => Promise<FileSystemWritable>;
};

type ProjectDirectoryFileHandle = {
  getFile: () => Promise<{ text: () => Promise<string> }>;
};

type ProjectDirectoryHandle = {
  name: string;
  getFileHandle: (name: string) => Promise<ProjectDirectoryFileHandle>;
};

type WindowWithFileSystemAccess = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<FileSystemFileHandle>;
  showDirectoryPicker?: () => Promise<ProjectDirectoryHandle>;
};

type StateTransitionWithIndex = {
  from: string;
  to: string;
  index: number;
};

type WorkflowActionWithIndex = WorkflowAction<string> & {
  index: number;
};

type WorkflowBucketWithIndex = WorkflowBucket<string> & {
  index: number;
};

type ActivePage = "state-machine" | "workflow" | "settings";
type WorkflowEditorView = "actions" | "buckets";

type MermaidPreviewTheme = AppSettings["theme"];

let mermaidPreviewCounter = 0;

const initialDefinition: EditableDefinition = {
  schemaVersion: STATE_MACHINE_SCHEMA_VERSION,
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

const initialWorkflowDefinition: EditableWorkflowDefinition = {
  schemaVersion: WORKFLOW_SCHEMA_VERSION,
  appName: initialDefinition.appName,
  workflowVersion: "0.1.0",
  id: "scan_job_workflow",
  stateMachine: {
    id: initialDefinition.id,
    definitionVersion: initialDefinition.definitionVersion,
  },
  actions: [
    { id: "start", label: "Start", from: "queued", to: "running" },
    { id: "complete", label: "Complete", from: "running", to: "completed" },
    { id: "fail", label: "Fail", from: "running", to: "failed" },
    { id: "retry", label: "Retry", from: "failed", to: "queued" },
    { id: "cancel_queued", label: "Cancel", from: "queued", to: "cancelled" },
    { id: "cancel_running", label: "Cancel", from: "running", to: "cancelled" },
  ],
  buckets: [
    { id: "waiting", label: "Waiting", states: ["queued"] },
    { id: "active", label: "Active", states: ["running", "failed"] },
    { id: "finished", label: "Finished", states: ["completed", "cancelled"] },
  ],
};

const appSettingsStorageKey = "state-workflow-editor-settings";
const defaultSettings: AppSettings = {
  logoUrl: "",
  theme: "light",
};

export function App() {
  const [definition, setDefinition] = useState<EditableDefinition>(initialDefinition);
  const [workflow, setWorkflow] = useState<EditableWorkflowDefinition>(initialWorkflowDefinition);
  const [stateMachineMessage, setStateMachineMessage] = useState<string | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState(initialDefinition.states[0]);
  const [selectedWorkflowView, setSelectedWorkflowView] = useState<WorkflowEditorView>("actions");
  const [selectedBucketId, setSelectedBucketId] = useState(initialWorkflowDefinition.buckets[0].id);
  const [draftStateBucketId, setDraftStateBucketId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<ActivePage>("state-machine");
  const [settings, setSettings] = useState<AppSettings>(loadAppSettings);
  const stateMachineFileInputRef = useRef<HTMLInputElement | null>(null);
  const workflowFileInputRef = useRef<HTMLInputElement | null>(null);
  const validation = useMemo(() => validateStateMachineDefinition(definition), [definition]);
  const machine = useMemo(() => {
    if (!validation.valid) {
      return null;
    }

    return defineStateMachine(definition);
  }, [definition, validation.valid]);
  const stateOptions = Array.from(new Set(definition.states.filter(Boolean)));
  const selectedStateTransitions = definition.transitions
    .map((transition, index) => ({ ...transition, index }))
    .filter((transition) => transition.from === selectedState);
  const selectedStateIsTerminal = definition.terminalStates.includes(selectedState);
  const selectedStateHasWorkflowTargets = definition.transitions.some((transition) => transition.from === selectedState);
  const linkedWorkflow = useMemo(() => withCurrentStateMachineReference(workflow, definition), [workflow, definition]);
  const workflowValidation = useMemo(() => {
    if (!validation.valid) {
      return {
        valid: false,
        errors: [
          {
            code: "missing_state_machine_definition" as const,
            message: "Fix the state machine definition before exporting workflow definitions.",
            path: "stateMachine",
          },
        ],
      };
    }

    return validateWorkflowDefinition(linkedWorkflow, definition);
  }, [linkedWorkflow, definition, validation.valid]);
  const definedWorkflow = useMemo(() => {
    if (!workflowValidation.valid || !validation.valid) {
      return null;
    }

    return defineWorkflow(linkedWorkflow, definition);
  }, [linkedWorkflow, definition, validation.valid, workflowValidation.valid]);
  const workflowActions = linkedWorkflow.actions
    .map((action, index) => ({ ...action, index }))
    .filter((action) => action.from === selectedState);
  const workflowBuckets = linkedWorkflow.buckets.map((bucket, index) => ({ ...bucket, index }));
  const selectedBucket = workflowBuckets.find((bucket) => bucket.id === selectedBucketId) ?? workflowBuckets[0];
  const selectedBucketStates = selectedBucket?.states ?? [];

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    if (workflow.buckets.length > 0 && !workflow.buckets.some((bucket) => bucket.id === selectedBucketId)) {
      setSelectedBucketId(workflow.buckets[0].id);
    }
  }, [selectedBucketId, workflow.buckets]);

  useEffect(() => {
    if (draftStateBucketId && draftStateBucketId !== selectedBucketId) {
      setDraftStateBucketId(null);
    }
  }, [draftStateBucketId, selectedBucketId]);

  function updateId(id: string) {
    setDefinition((current) => ({ ...current, id }));
  }

  function updateAppName(appName: string) {
    setDefinition((current) => ({ ...current, appName }));
  }

  function updateTargetProject(appName: string) {
    setDefinition((current) => ({ ...current, appName }));
    setWorkflow((current) => ({ ...current, appName }));
  }

  function updateDefinitionVersion(definitionVersion: string) {
    setDefinition((current) => ({ ...current, definitionVersion }));
  }

  function addState() {
    setDefinition((current) => {
      const nextState = nextUniqueStateId(current.states);

      setSelectedState(nextState);
      setWorkflow((currentWorkflow) => assignStateToBucket(currentWorkflow, nextState, selectedBucketId));

      return {
        ...current,
        states: [...current.states, nextState],
      };
    });
  }

  function renameState(index: number, nextState: string) {
    const previousState = definition.states[index];

    setDefinition((current) => {
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
    setSelectedState((current) => (current === previousState ? nextState : current));
    setWorkflow((current) => ({
      ...current,
      actions: current.actions.map((action) => ({
        ...action,
        from: action.from === previousState ? nextState : action.from,
        to: action.to === previousState ? nextState : action.to,
      })),
      buckets: current.buckets.map((bucket) => ({
        ...bucket,
        states: bucket.states.map((state) => (state === previousState ? nextState : state)),
      })),
    }));
  }

  function removeState(index: number) {
    const removedState = definition.states[index];

    setDefinition((current) => {
      const nextStates = current.states.filter((_, stateIndex) => stateIndex !== index);

      return {
        ...current,
        states: nextStates,
        terminalStates: current.terminalStates.filter((state) => state !== removedState),
        transitions: current.transitions.filter(
          (transition) => transition.from !== removedState && transition.to !== removedState,
        ),
      };
    });
    setSelectedState((current) =>
      current === removedState ? definition.states[index + 1] ?? definition.states[index - 1] ?? "" : current,
    );
    setWorkflow((current) => ({
      ...current,
      actions: current.actions.filter((action) => action.from !== removedState && action.to !== removedState),
      buckets: current.buckets.map((bucket) => ({
        ...bucket,
        states: bucket.states.filter((state) => state !== removedState),
      })),
    }));
  }

  function moveState(fromIndex: number, toIndex: number) {
    setDefinition((current) => {
      const nextStates = moveArrayItem(current.states, fromIndex, toIndex);

      if (nextStates === current.states) {
        return current;
      }

      return {
        ...current,
        states: nextStates,
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
      const from = selectedState || current.states[0] || "";
      const to = current.states.find((state) => state !== from) ?? from;

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

  function updateWorkflowAppName(appName: string) {
    setWorkflow((current) => ({ ...current, appName }));
  }

  function updateWorkflowVersion(workflowVersion: string) {
    setWorkflow((current) => ({ ...current, workflowVersion }));
  }

  function updateWorkflowId(id: string) {
    setWorkflow((current) => ({ ...current, id }));
  }

  function addWorkflowAction() {
    setWorkflow((current) => {
      const from = selectedState || definition.states[0] || "";
      const to = definition.transitions.find((transition) => transition.from === from)?.to ?? from;
      const id = nextUniqueActionId(current.actions);

      return {
        ...current,
        actions: [...current.actions, { id, label: titleCaseAction(id), from, to }],
      };
    });
  }

  function updateWorkflowAction(index: number, field: keyof WorkflowAction<string>, value: string) {
    setWorkflow((current) => ({
      ...current,
      actions: current.actions.map((action, actionIndex) => {
        if (actionIndex !== index) {
          return action;
        }

        if (field === "label") {
          return {
            ...action,
            label: value,
            id: value.trim() ? uniqueActionIdFromLabel(value, current.actions, index) : action.id,
          };
        }

        return { ...action, [field]: value };
      }),
    }));
  }

  function moveWorkflowAction(fromVisibleIndex: number, toVisibleIndex: number) {
    setWorkflow((current) => {
      const nextActions = moveFilteredArrayItem(
        current.actions,
        (action) => action.from === selectedState,
        fromVisibleIndex,
        toVisibleIndex,
      );

      if (nextActions === current.actions) {
        return current;
      }

      return {
        ...current,
        actions: nextActions,
      };
    });
  }

  function removeWorkflowAction(index: number) {
    setWorkflow((current) => ({
      ...current,
      actions: current.actions.filter((_, actionIndex) => actionIndex !== index),
    }));
  }

  function moveWorkflowBucket(fromIndex: number, toIndex: number) {
    setWorkflow((current) => {
      const nextBuckets = moveArrayItem(current.buckets, fromIndex, toIndex);

      if (nextBuckets === current.buckets) {
        return current;
      }

      return {
        ...current,
        buckets: nextBuckets,
      };
    });
  }

  function addWorkflowBucket() {
    setWorkflow((current) => {
      const id = nextUniqueBucketId(current.buckets);
      const nextBucket = { id, label: titleCaseAction(id), states: [] };

      setSelectedBucketId(id);

      return {
        ...current,
        buckets: [...current.buckets, nextBucket],
      };
    });
  }

  function updateWorkflowBucketLabel(index: number, label: string) {
    setWorkflow((current) => ({
      ...current,
      buckets: current.buckets.map((bucket, bucketIndex) => {
        if (bucketIndex !== index) {
          return bucket;
        }

        const nextId = label.trim() ? uniqueBucketIdFromLabel(label, current.buckets, index) : bucket.id;

        if (bucket.id === selectedBucketId && nextId !== selectedBucketId) {
          setSelectedBucketId(nextId);
        }

        return {
          ...bucket,
          label,
          id: nextId,
        };
      }),
    }));
  }

  function removeWorkflowBucket(index: number) {
    setWorkflow((current) => {
      const bucket = current.buckets[index];

      if (!bucket || current.buckets.length <= 1 || bucket.states.length > 0) {
        return current;
      }

      const nextBuckets = current.buckets.filter((_, bucketIndex) => bucketIndex !== index);

      setSelectedBucketId(nextBuckets[Math.max(0, index - 1)]?.id ?? nextBuckets[0]?.id ?? "");

      return {
        ...current,
        buckets: nextBuckets,
      };
    });
  }

  function moveStateToBucket(state: string, bucketId: string) {
    setWorkflow((current) => assignStateToBucket(current, state, bucketId));
  }

  function addStateMappingRow() {
    if (selectedBucket) {
      setDraftStateBucketId(selectedBucket.id);
    }
  }

  function selectStateForBucket(state: string) {
    if (!state || !selectedBucket) {
      return;
    }

    moveStateToBucket(state, selectedBucket.id);
    setDraftStateBucketId(null);
  }

  function cancelStateMappingRow() {
    setDraftStateBucketId(null);
  }

  function removeStateFromSelectedBucket(state: string) {
    if (!selectedBucket) {
      return;
    }

    setWorkflow((current) => removeStateFromBucket(current, state, selectedBucket.id));
  }

  function updateLogoUrl(logoUrl: string) {
    updateSettings({ ...settings, logoUrl });
  }

  function toggleTheme() {
    updateSettings({ ...settings, theme: settings.theme === "light" ? "dark" : "light" });
  }

  function updateSettings(nextSettings: AppSettings) {
    setSettings(nextSettings);
    localStorage.setItem(appSettingsStorageKey, JSON.stringify(nextSettings));
  }

  async function exportStateMachineDefinition() {
    const filename = buildDefinitionFilename(definition);

    await saveJsonFile({
      data: definition,
      filename,
      description: "State machine definition",
      onMessage: setStateMachineMessage,
    });
  }

  async function exportWorkflowDefinition(includeEmbeddedStateMachine: boolean) {
    const exportWorkflow = includeEmbeddedStateMachine
      ? { ...linkedWorkflow, embeddedStateMachineDefinition: definition }
      : removeEmbeddedStateMachine(linkedWorkflow);
    const filename = includeEmbeddedStateMachine
      ? buildBundledWorkflowFilename(linkedWorkflow)
      : buildWorkflowFilename(linkedWorkflow);

    await saveJsonFile({
      data: exportWorkflow,
      filename,
      description: includeEmbeddedStateMachine ? "Bundled workflow definition" : "Workflow definition",
      onMessage: setWorkflowMessage,
    });
  }

  async function chooseTargetProjectFolder() {
    const fileSystemWindow = window as WindowWithFileSystemAccess;
    const setActiveMessage = activePage === "workflow" ? setWorkflowMessage : setStateMachineMessage;

    if (!fileSystemWindow.showDirectoryPicker) {
      setActiveMessage("Folder picker is not supported in this browser. Type the target project name manually.");
      return;
    }

    try {
      const directory = await fileSystemWindow.showDirectoryPicker();
      const project = await inferProjectNameFromDirectory(directory);

      updateTargetProject(project.name);
      setActiveMessage(`Selected project "${project.name}" from ${project.source}.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setActiveMessage("Project selection cancelled.");
        return;
      }

      setActiveMessage(error instanceof Error ? error.message : "Unable to select project folder.");
    }
  }

  async function importStateMachineDefinition(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as EditableDefinition;
      const nextDefinition = normalizeImportedDefinition(parsed);
      const result = validateStateMachineDefinition(nextDefinition);

      if (!result.valid) {
        setStateMachineMessage(result.errors.map((error) => error.message).join(" "));
        return;
      }

      setDefinition(nextDefinition);
      setSelectedState(nextDefinition.states[0] ?? "");
      setStateMachineMessage(null);
    } catch (error) {
      setStateMachineMessage(error instanceof Error ? error.message : "Unable to import state machine definition.");
    } finally {
      event.target.value = "";
    }
  }

  async function importWorkflowDefinition(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as ImportedWorkflowDefinition;
      const nextWorkflow = normalizeImportedWorkflowDefinition(parsed, definition);
      const effectiveStateMachine = nextWorkflow.embeddedStateMachineDefinition ?? definition;
      const result = validateWorkflowDefinition(nextWorkflow, effectiveStateMachine);

      if (!result.valid) {
        setWorkflowMessage(result.errors.map((error) => error.message).join(" "));
        return;
      }

      if (nextWorkflow.embeddedStateMachineDefinition) {
        setDefinition(nextWorkflow.embeddedStateMachineDefinition);
        setSelectedState(nextWorkflow.embeddedStateMachineDefinition.states[0] ?? "");
      }

      setWorkflow(removeEmbeddedStateMachine(nextWorkflow));
      setSelectedBucketId(nextWorkflow.buckets[0]?.id ?? "");
      setWorkflowMessage(null);
    } catch (error) {
      setWorkflowMessage(error instanceof Error ? error.message : "Unable to import workflow definition.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <AppLogo logoUrl={settings.logoUrl} />
          <div className="brand-copy">
            <h1>State Workflow Editor</h1>
            <span className="app-version">v{packageJson.version}</span>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={settings.theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              title={settings.theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {settings.theme === "light" ? "◐" : "☀"}
            </button>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={activePage === "state-machine" ? "secondary active" : "secondary"}
            onClick={() => setActivePage("state-machine")}
          >
            State Machine
          </button>
          <button
            type="button"
            className={activePage === "workflow" ? "secondary active" : "secondary"}
            onClick={() => setActivePage("workflow")}
          >
            Workflow
          </button>
          <button
            type="button"
            className={activePage === "settings" ? "secondary active" : "secondary"}
            onClick={() => setActivePage("settings")}
          >
            Settings
          </button>
          <input
            ref={stateMachineFileInputRef}
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={importStateMachineDefinition}
            aria-label="Import state machine JSON definition"
          />
          <input
            ref={workflowFileInputRef}
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={importWorkflowDefinition}
            aria-label="Import workflow JSON definition"
          />
          {activePage === "state-machine" ? (
            <>
              <button type="button" className="secondary" onClick={() => stateMachineFileInputRef.current?.click()}>
                Import State Machine
              </button>
              <button type="button" onClick={exportStateMachineDefinition} disabled={!validation.valid}>
                Export State Machine
              </button>
            </>
          ) : null}
          {activePage === "workflow" ? (
            <>
              <button type="button" className="secondary" onClick={() => workflowFileInputRef.current?.click()}>
                Import Workflow
              </button>
              <button type="button" onClick={() => exportWorkflowDefinition(false)} disabled={!workflowValidation.valid}>
                Export Workflow
              </button>
              <button type="button" onClick={() => exportWorkflowDefinition(true)} disabled={!workflowValidation.valid}>
                Export Bundled Workflow
              </button>
            </>
          ) : null}
        </div>
      </header>

      {activePage === "settings" ? (
        <SettingsPage logoUrl={settings.logoUrl} onLogoUrlChange={updateLogoUrl} />
      ) : null}

      {activePage === "state-machine" ? (
        <>
          <section className="fixed-control-grid">
            <section className="panel machine-panel">
              <div className="metadata-field">
                <label htmlFor="app-name">Target Project</label>
                <div className="target-project-control">
                  <input
                    id="app-name"
                    value={definition.appName}
                    onChange={(event) => updateAppName(event.target.value)}
                    spellCheck={false}
                  />
                  <TargetProjectPicker onClick={chooseTargetProjectFolder} />
                </div>
              </div>
              <div className="metadata-field">
                <label htmlFor="machine-id">State Machine ID</label>
                <input
                  id="machine-id"
                  value={definition.id}
                  onChange={(event) => updateId(event.target.value)}
                  spellCheck={false}
                />
              </div>
              <div className="metadata-field">
                <label htmlFor="definition-version">State Machine Version</label>
                <input
                  id="definition-version"
                  value={definition.definitionVersion}
                  onChange={(event) => updateDefinitionVersion(event.target.value)}
                  spellCheck={false}
                />
              </div>
            </section>

            <section className="panel status-panel" aria-live="polite">
              <div className="panel-heading">
                <h2>Validation</h2>
                <span className={validation.valid ? "status ok" : "status error"}>
                  {validation.valid
                    ? "Valid"
                    : `${validation.errors.length} issue${validation.errors.length === 1 ? "" : "s"}`}
                </span>
              </div>
              {stateMachineMessage ? <p className="export-message">{stateMachineMessage}</p> : null}
              {validation.valid ? (
                <p className="valid-message">Ready to export state-machine JSON.</p>
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
          </section>

          <section className="workspace-grid" aria-label="State machine editor">
            <section className="panel column-panel">
              <div className="panel-heading">
                <h2>States</h2>
                <button type="button" className="secondary compact" onClick={addState}>
                  Add State
                </button>
              </div>
              <div className="column-scroll">
                <StateList
                  states={definition.states}
                  selectedState={selectedState}
                  terminalStates={definition.terminalStates}
                  onSelect={setSelectedState}
                  onRename={renameState}
                  onRemove={removeState}
                  onToggleTerminal={toggleTerminalState}
                  onReorder={moveState}
                />
              </div>
            </section>

            <section className="panel column-panel">
              <div className="panel-heading">
                <div>
                  <h2>Transitions</h2>
                  <p className="panel-subtitle">{selectedState || "No state selected"}</p>
                </div>
                <button
                  type="button"
                  className="secondary compact"
                  onClick={addTransition}
                  disabled={!selectedState || selectedStateIsTerminal}
                >
                  Add Transition
                </button>
              </div>
              <div className="column-scroll">
                <TransitionList
                  selectedState={selectedState}
                  transitions={selectedStateTransitions}
                  states={stateOptions}
                  onChange={updateTransition}
                  onRemove={removeTransition}
                />
              </div>
            </section>

            <section className="panel column-panel graph-panel">
              <div className="panel-heading">
                <h2>Preview</h2>
                <span className="schema-version">schema v{definition.schemaVersion}</span>
              </div>
              <div className="column-scroll graph-scroll">
                {machine ? (
                  <MermaidGraph machine={machine.definition} theme={settings.theme} />
                ) : (
                  <div className="empty-graph">No preview</div>
                )}
              </div>
            </section>
          </section>
        </>
      ) : null}

      {activePage === "workflow" ? (
        <>
          <section className="fixed-control-grid">
            <section className="panel machine-panel workflow-metadata-panel">
              <div className="metadata-field">
                <label htmlFor="workflow-app-name">Target Project</label>
                <div className="target-project-control">
                  <input
                    id="workflow-app-name"
                    value={linkedWorkflow.appName}
                    onChange={(event) => updateWorkflowAppName(event.target.value)}
                    spellCheck={false}
                  />
                  <TargetProjectPicker onClick={chooseTargetProjectFolder} />
                </div>
              </div>
              <div className="metadata-field">
                <label htmlFor="workflow-id">Workflow ID</label>
                <input
                  id="workflow-id"
                  value={linkedWorkflow.id}
                  onChange={(event) => updateWorkflowId(event.target.value)}
                  spellCheck={false}
                />
              </div>
              <div className="metadata-field">
                <label htmlFor="workflow-version">Workflow Version</label>
                <input
                  id="workflow-version"
                  value={linkedWorkflow.workflowVersion}
                  onChange={(event) => updateWorkflowVersion(event.target.value)}
                  spellCheck={false}
                />
              </div>
              <div className="metadata-field">
                <label htmlFor="linked-state-machine">State Machine</label>
                <input
                  id="linked-state-machine"
                  value={`${definition.id}@${definition.definitionVersion}`}
                  readOnly
                  spellCheck={false}
                />
              </div>
            </section>

            <section className="panel status-panel" aria-live="polite">
              <div className="panel-heading">
                <h2>Workflow Validation</h2>
                <span className={workflowValidation.valid ? "status ok" : "status error"}>
                  {workflowValidation.valid
                    ? "Valid"
                    : `${workflowValidation.errors.length} issue${workflowValidation.errors.length === 1 ? "" : "s"}`}
                </span>
              </div>
              {workflowMessage ? <p className="export-message">{workflowMessage}</p> : null}
              {workflowValidation.valid ? (
                <p className="valid-message">Ready to export linked or bundled workflow JSON.</p>
              ) : (
                <ul className="error-list">
                  {workflowValidation.errors.map((error, index) => (
                    <li key={`${error.code}-${error.path}-${index}`}>
                      <strong>{error.path}</strong> {error.message}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </section>

          <section className="workflow-editor-region">
            <section className="workflow-view-tabs" aria-label="Workflow editor view">
              <button
                type="button"
                className={selectedWorkflowView === "actions" ? "active" : ""}
                onClick={() => setSelectedWorkflowView("actions")}
              >
                Actions
              </button>
              <button
                type="button"
                className={selectedWorkflowView === "buckets" ? "active" : ""}
                onClick={() => setSelectedWorkflowView("buckets")}
              >
                Buckets
              </button>
            </section>

            <section
              className={
                selectedWorkflowView === "actions"
                  ? "workspace-grid workflow-grid workflow-actions-grid"
                  : "workspace-grid workflow-grid workflow-buckets-grid"
              }
              aria-label="Workflow editor"
            >
              {selectedWorkflowView === "actions" ? (
                <section className="panel column-panel workflow-actions-panel">
                  <div className="workflow-action-toolbar">
                    <div className="workflow-action-toolbar-row">
                      <h2>Actions</h2>
                      <button
                        type="button"
                        className="secondary compact"
                        onClick={addWorkflowAction}
                        disabled={!selectedState || selectedStateIsTerminal || !selectedStateHasWorkflowTargets}
                      >
                        Add Action
                      </button>
                    </div>
                    <div className="workflow-state-control">
                      <label htmlFor="workflow-selected-state">Selected State</label>
                      <StateSelect
                        id="workflow-selected-state"
                        label="Selected State"
                        value={selectedState}
                        states={stateOptions}
                        onChange={setSelectedState}
                    />
                  </div>
                  <div className="workflow-action-header" aria-hidden="true">
                      <span />
                      <span>Button Label</span>
                      <span>From State</span>
                      <span>To State</span>
                      <span>Action</span>
                      <span>Order</span>
                    </div>
                  </div>
                  <div className="column-scroll">
                    <WorkflowActionList
                      actions={workflowActions}
                      selectedState={selectedState}
                      states={stateOptions}
                      onChange={updateWorkflowAction}
                      onRemove={removeWorkflowAction}
                      onReorder={moveWorkflowAction}
                    />
                  </div>
                </section>
              ) : (
                <>
                  <section className="panel column-panel workflow-bucket-list-panel">
                  <div className="panel-heading">
                    <h2>Buckets</h2>
                    <button type="button" className="secondary compact" onClick={addWorkflowBucket}>
                        Add Bucket
                      </button>
                    </div>
                  <div className="column-scroll">
                    <WorkflowBucketList
                      buckets={workflowBuckets}
                      selectedBucketId={selectedBucket?.id ?? ""}
                      onSelect={setSelectedBucketId}
                        onRename={updateWorkflowBucketLabel}
                        onRemove={removeWorkflowBucket}
                        onReorder={moveWorkflowBucket}
                      />
                    </div>
                  </section>

                <section className="panel column-panel workflow-bucket-assignment-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>State Mapping</h2>
                      <p className="panel-subtitle">{selectedBucket?.label ?? "No bucket selected"}</p>
                    </div>
                    <button
                      type="button"
                      className="secondary compact"
                      onClick={addStateMappingRow}
                      disabled={!selectedBucket || draftStateBucketId === selectedBucket.id}
                    >
                      Add State
                    </button>
                  </div>
                  <div className="column-scroll">
                    <WorkflowBucketAssignmentList
                      states={stateOptions}
                      selectedBucket={selectedBucket}
                      selectedBucketStates={selectedBucketStates}
                      showDraftRow={draftStateBucketId === selectedBucket?.id}
                      onSelectState={selectStateForBucket}
                      onCancelDraft={cancelStateMappingRow}
                      onRemoveState={removeStateFromSelectedBucket}
                    />
                  </div>
                </section>
                </>
              )}

              <section className="panel column-panel graph-panel workflow-preview-panel">
                <div className="panel-heading">
                  <h2>Workflow Preview</h2>
                  <span className="schema-version">schema v{linkedWorkflow.schemaVersion}</span>
                </div>
                <div className="column-scroll graph-scroll">
                  {definedWorkflow ? (
                    <MermaidGraph
                      machine={definedWorkflow.stateMachine.definition}
                      workflow={definedWorkflow.definition}
                      theme={settings.theme}
                    />
                  ) : (
                    <div className="empty-graph">No preview</div>
                  )}
                </div>
              </section>
            </section>
          </section>
        </>
      ) : null}
    </main>
  );
}

function AppLogo({ logoUrl }: { logoUrl: string }) {
  if (logoUrl.trim()) {
    return <img className="app-logo" src={logoUrl} alt="App logo" />;
  }

  return (
    <div className="app-logo app-logo-fallback" aria-hidden="true">
      SWE
    </div>
  );
}

function TargetProjectPicker({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="secondary compact icon-button"
      onClick={onClick}
      aria-label="Choose project folder"
      title="Choose project folder"
    >
      <span className="folder-icon" aria-hidden="true" />
    </button>
  );
}

function SettingsPage({
  logoUrl,
  onLogoUrlChange,
}: {
  logoUrl: string;
  onLogoUrlChange: (logoUrl: string) => void;
}) {
  return (
    <section className="settings-page">
      <section className="panel settings-panel">
        <div className="panel-heading">
          <h2>Settings</h2>
        </div>
        <div className="settings-form">
          <label htmlFor="logo-url">Logo URL</label>
          <input
            id="logo-url"
            value={logoUrl}
            onChange={(event) => onLogoUrlChange(event.target.value)}
            placeholder="https://example.com/logo.png"
            spellCheck={false}
          />
        </div>
      </section>
    </section>
  );
}

function StateList({
  states,
  selectedState,
  terminalStates,
  onSelect,
  onRename,
  onRemove,
  onToggleTerminal,
  onReorder,
}: {
  states: readonly string[];
  selectedState: string;
  terminalStates: readonly string[];
  onSelect: (state: string) => void;
  onRename: (index: number, state: string) => void;
  onRemove: (index: number) => void;
  onToggleTerminal: (state: string, checked: boolean) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  function beginDrag(event: DragEvent<HTMLButtonElement>, index: number) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
    setDraggedIndex(index);
    setDropTargetIndex(index);
  }

  function showDropTarget(event: DragEvent<HTMLElement>, index: number) {
    if (draggedIndex === null) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetIndex(index);
  }

  function dropState(event: DragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    const sourceIndex = draggedIndex ?? Number.parseInt(event.dataTransfer.getData("text/plain"), 10);

    if (Number.isInteger(sourceIndex)) {
      onReorder(sourceIndex, index);
    }

    setDraggedIndex(null);
    setDropTargetIndex(null);
  }

  function endDrag() {
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }

  return (
    <div className="state-list" role="list" aria-label="State list">
      {states.map((state, index) => {
        const isSelected = selectedState === state;
        const rowLabel = state || `State ${index + 1}`;
        const rowClasses = [
          "state-row",
          isSelected ? "selected" : "",
          draggedIndex === index ? "dragging" : "",
          dropTargetIndex === index && draggedIndex !== index ? "drop-target" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <article
            key={`state-card-${index}`}
            className={rowClasses}
            role="listitem"
            aria-label={`${rowLabel} state row`}
            onDragOver={(event) => showDropTarget(event, index)}
            onDragEnter={(event) => showDropTarget(event, index)}
            onDrop={(event) => dropState(event, index)}
          >
            <button
              type="button"
              className="state-drag-handle"
              draggable
              onDragStart={(event) => beginDrag(event, index)}
              onDragEnd={endDrag}
              aria-label={`Drag ${rowLabel}`}
              title={`Drag ${rowLabel}`}
            >
              <span className="drag-grip" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </span>
            </button>
            <button type="button" className="state-select" onClick={() => onSelect(state)} aria-pressed={isSelected}>
              {rowLabel}
            </button>
            <input
              aria-label={`State ${index + 1} ID`}
              value={state}
              onChange={(event) => onRename(index, event.target.value)}
              spellCheck={false}
            />
            <label className="inline-check">
              <input
                type="checkbox"
                aria-label={`${state || `State ${index + 1}`} terminal`}
                checked={terminalStates.includes(state)}
                onChange={(event) => onToggleTerminal(state, event.target.checked)}
                disabled={!state}
              />
              Terminal
            </label>
            <button type="button" className="ghost compact" onClick={() => onRemove(index)}>
              Remove
            </button>
            <div className="state-reorder-controls" aria-label={`${rowLabel} keyboard reorder controls`}>
              <button
                type="button"
                className="ghost compact"
                onClick={() => onReorder(index, index - 1)}
                disabled={index === 0}
                aria-label={`Move ${rowLabel} up`}
              >
                Up
              </button>
              <button
                type="button"
                className="ghost compact"
                onClick={() => onReorder(index, index + 1)}
                disabled={index === states.length - 1}
                aria-label={`Move ${rowLabel} down`}
              >
                Down
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function TransitionList({
  selectedState,
  transitions,
  states,
  onChange,
  onRemove,
}: {
  selectedState: string;
  transitions: StateTransitionWithIndex[];
  states: string[];
  onChange: (index: number, field: "from" | "to", value: string) => void;
  onRemove: (index: number) => void;
}) {
  if (!selectedState) {
    return <div className="empty-column">Select a state to edit transitions.</div>;
  }

  if (transitions.length === 0) {
    return <div className="empty-column">No outgoing transitions from this state.</div>;
  }

  return (
    <div className="transition-list">
      {transitions.map((transition) => (
        <article key={`transition-card-${transition.index}`} className="transition-row">
          <div className="transition-from">{transition.from}</div>
          <span className="transition-arrow">to</span>
          <StateSelect
            label={`Transition ${transition.index + 1} target`}
            value={transition.to}
            states={states}
            onChange={(value) => onChange(transition.index, "to", value)}
          />
          <button type="button" className="ghost compact" onClick={() => onRemove(transition.index)}>
            Remove
          </button>
        </article>
      ))}
    </div>
  );
}

function WorkflowActionList({
  actions,
  selectedState,
  states,
  onChange,
  onRemove,
  onReorder,
}: {
  actions: WorkflowActionWithIndex[];
  selectedState: string;
  states: string[];
  onChange: (index: number, field: keyof WorkflowAction<string>, value: string) => void;
  onRemove: (index: number) => void;
  onReorder: (fromVisibleIndex: number, toVisibleIndex: number) => void;
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  function beginDrag(event: DragEvent<HTMLButtonElement>, visibleIndex: number) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(visibleIndex));
    setDraggedIndex(visibleIndex);
    setDropTargetIndex(visibleIndex);
  }

  function showDropTarget(event: DragEvent<HTMLElement>, visibleIndex: number) {
    if (draggedIndex === null) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetIndex(visibleIndex);
  }

  function dropAction(event: DragEvent<HTMLElement>, visibleIndex: number) {
    event.preventDefault();
    const sourceIndex = draggedIndex ?? Number.parseInt(event.dataTransfer.getData("text/plain"), 10);

    if (Number.isInteger(sourceIndex)) {
      onReorder(sourceIndex, visibleIndex);
    }

    setDraggedIndex(null);
    setDropTargetIndex(null);
  }

  function endDrag() {
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }

  if (actions.length === 0) {
    return <div className="empty-column">No workflow actions for {selectedState || "this state"}.</div>;
  }

  return (
    <div className="workflow-action-list" role="list" aria-label="Workflow action list">
      {actions.map((action, visibleIndex) => {
        const actionLabel = action.label || action.id || `Action ${action.index + 1}`;
        const rowClasses = [
          "workflow-action-row",
          draggedIndex === visibleIndex ? "dragging" : "",
          dropTargetIndex === visibleIndex && draggedIndex !== visibleIndex ? "drop-target" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <article
            key={`workflow-action-${action.index}`}
            className={rowClasses}
            role="listitem"
            aria-label={`${actionLabel} action row`}
            onDragOver={(event) => showDropTarget(event, visibleIndex)}
            onDragEnter={(event) => showDropTarget(event, visibleIndex)}
            onDrop={(event) => dropAction(event, visibleIndex)}
          >
            <button
              type="button"
              className="state-drag-handle"
              draggable
              onDragStart={(event) => beginDrag(event, visibleIndex)}
              onDragEnd={endDrag}
              aria-label={`Drag ${actionLabel} action`}
              title={`Drag ${actionLabel} action`}
            >
              <span className="drag-grip" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </span>
            </button>
            <input
              aria-label={`Action ${action.index + 1} label`}
              value={action.label}
              onChange={(event) => onChange(action.index, "label", event.target.value)}
              spellCheck={false}
            />
            <StateSelect
              label={`Action ${action.index + 1} source`}
              value={action.from}
              states={states}
              onChange={(value) => onChange(action.index, "from", value)}
            />
            <StateSelect
              label={`Action ${action.index + 1} target`}
              value={action.to}
              states={states}
              onChange={(value) => onChange(action.index, "to", value)}
            />
            <button type="button" className="ghost compact" onClick={() => onRemove(action.index)}>
              Remove
            </button>
            <div className="state-reorder-controls" aria-label={`${actionLabel} action keyboard reorder controls`}>
              <button
                type="button"
                className="ghost compact"
                onClick={() => onReorder(visibleIndex, visibleIndex - 1)}
                disabled={visibleIndex === 0}
                aria-label={`Move ${actionLabel} action up`}
              >
                Up
              </button>
              <button
                type="button"
                className="ghost compact"
                onClick={() => onReorder(visibleIndex, visibleIndex + 1)}
                disabled={visibleIndex === actions.length - 1}
                aria-label={`Move ${actionLabel} action down`}
              >
                Down
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function WorkflowBucketList({
  buckets,
  selectedBucketId,
  onSelect,
  onRename,
  onRemove,
  onReorder,
}: {
  buckets: WorkflowBucketWithIndex[];
  selectedBucketId: string;
  onSelect: (bucketId: string) => void;
  onRename: (index: number, label: string) => void;
  onRemove: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  function beginDrag(event: DragEvent<HTMLButtonElement>, index: number) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
    setDraggedIndex(index);
    setDropTargetIndex(index);
  }

  function showDropTarget(event: DragEvent<HTMLElement>, index: number) {
    if (draggedIndex === null) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetIndex(index);
  }

  function dropBucket(event: DragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    const sourceIndex = draggedIndex ?? Number.parseInt(event.dataTransfer.getData("text/plain"), 10);

    if (Number.isInteger(sourceIndex)) {
      onReorder(sourceIndex, index);
    }

    setDraggedIndex(null);
    setDropTargetIndex(null);
  }

  function endDrag() {
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }

  return (
    <div className="workflow-bucket-list" role="list" aria-label="Workflow bucket list">
      {buckets.map((bucket) => {
        const isSelected = bucket.id === selectedBucketId;
        const removeDisabled = buckets.length <= 1 || bucket.states.length > 0;
        const bucketLabel = bucket.label || bucket.id || `Bucket ${bucket.index + 1}`;
        const rowClasses = [
          "bucket-row",
          isSelected ? "selected" : "",
          draggedIndex === bucket.index ? "dragging" : "",
          dropTargetIndex === bucket.index && draggedIndex !== bucket.index ? "drop-target" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <article
            key={`workflow-bucket-${bucket.index}`}
            className={rowClasses}
            role="listitem"
            aria-label={`${bucketLabel} bucket row`}
            onClick={() => onSelect(bucket.id)}
            onDragOver={(event) => showDropTarget(event, bucket.index)}
            onDragEnter={(event) => showDropTarget(event, bucket.index)}
            onDrop={(event) => dropBucket(event, bucket.index)}
          >
            <button
              type="button"
              className="state-drag-handle"
              draggable
              onClick={(event) => event.stopPropagation()}
              onDragStart={(event) => beginDrag(event, bucket.index)}
              onDragEnd={endDrag}
              aria-label={`Drag ${bucketLabel} bucket`}
              title={`Drag ${bucketLabel} bucket`}
            >
              <span className="drag-grip" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </span>
            </button>
            <input
              aria-label={`Bucket ${bucket.index + 1} label`}
              value={bucket.label}
              onChange={(event) => {
                onSelect(bucket.id);
                onRename(bucket.index, event.target.value);
              }}
              onFocus={() => onSelect(bucket.id)}
              spellCheck={false}
            />
            <span className="bucket-count" aria-label={`${bucket.label || `Bucket ${bucket.index + 1}`} state count`}>
              {bucket.states.length}
            </span>
            <button
              type="button"
              className="ghost compact"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(bucket.index);
              }}
              disabled={removeDisabled}
              title={removeDisabled ? "Move states out before removing this bucket" : "Remove bucket"}
            >
              Remove
            </button>
            <div className="state-reorder-controls" aria-label={`${bucketLabel} bucket keyboard reorder controls`}>
              <button
                type="button"
                className="ghost compact"
                onClick={(event) => {
                  event.stopPropagation();
                  onReorder(bucket.index, bucket.index - 1);
                }}
                disabled={bucket.index === 0}
                aria-label={`Move ${bucketLabel} bucket up`}
              >
                Up
              </button>
              <button
                type="button"
                className="ghost compact"
                onClick={(event) => {
                  event.stopPropagation();
                  onReorder(bucket.index, bucket.index + 1);
                }}
                disabled={bucket.index === buckets.length - 1}
                aria-label={`Move ${bucketLabel} bucket down`}
              >
                Down
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function WorkflowBucketAssignmentList({
  states,
  selectedBucket,
  selectedBucketStates,
  showDraftRow,
  onSelectState,
  onCancelDraft,
  onRemoveState,
}: {
  states: string[];
  selectedBucket?: WorkflowBucketWithIndex;
  selectedBucketStates: readonly string[];
  showDraftRow: boolean;
  onSelectState: (state: string) => void;
  onCancelDraft: () => void;
  onRemoveState: (state: string) => void;
}) {
  if (!selectedBucket) {
    return <div className="empty-column">Add a workflow bucket to map states.</div>;
  }

  if (selectedBucketStates.length === 0 && !showDraftRow) {
    return <div className="empty-column">No states mapped to this bucket.</div>;
  }

  return (
    <div className="bucket-assignment-list">
      {selectedBucketStates.map((state) => (
        <article key={`bucket-assignment-${state}`} className="assignment-row selected">
          <div className="assignment-state">
            <span>{state}</span>
          </div>
          <button type="button" className="ghost compact" onClick={() => onRemoveState(state)}>
            Remove
          </button>
        </article>
      ))}
      {showDraftRow ? (
        <article className="assignment-row draft">
          <div className="assignment-state">
            <span>New state</span>
          </div>
          <StateSelect label="State to add" value="" states={states} onChange={onSelectState} />
          <button type="button" className="ghost compact" onClick={onCancelDraft}>
            Cancel
          </button>
        </article>
      ) : null}
    </div>
  );
}

function StateSelect({
  id,
  label,
  value,
  states,
  onChange,
}: {
  id?: string;
  label: string;
  value: string;
  states: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select id={id} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {!states.includes(value) ? <option value={value}>{value || "Select state"}</option> : null}
      {states.map((state) => (
        <option key={state} value={state}>
          {state}
        </option>
      ))}
    </select>
  );
}

function MermaidGraph({
  machine,
  workflow,
  theme,
}: {
  machine: EditableDefinition;
  workflow?: EditableWorkflowDefinition;
  theme: MermaidPreviewTheme;
}) {
  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderId = useRef<string | null>(null);
  const diagram = useMemo(
    () => (workflow ? buildWorkflowMermaidDiagram(machine, workflow, theme) : buildMermaidDiagram(machine, theme)),
    [machine, workflow, theme],
  );

  if (!renderId.current) {
    renderId.current = `state-machine-mermaid-${mermaidPreviewCounter++}`;
  }

  useEffect(() => {
    let cancelled = false;
    const currentRenderId = renderId.current;

    if (!currentRenderId) {
      return;
    }

    void (async () => {
      try {
        setSvg("");
        setRenderError(null);
        const { default: mermaid } = await import("mermaid");

        if (cancelled) {
          return;
        }

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: getMermaidThemeVariables(theme),
        });

        const result = await mermaid.render(currentRenderId, diagram);

        if (!cancelled) {
          setSvg(result.svg);
        }
      } catch {
        if (!cancelled) {
          setRenderError("Unable to render Mermaid preview.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [diagram, theme]);

  if (renderError) {
    return <div className="empty-graph">{renderError}</div>;
  }

  return (
    <div
      className={`mermaid-preview ${theme}`}
      role="img"
      aria-label={workflow ? "Workflow Mermaid preview" : "State machine Mermaid preview"}
    >
      {svg ? (
        <div className="mermaid-preview-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="empty-graph">Rendering preview...</div>
      )}
    </div>
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

function moveArrayItem<Item>(items: readonly Item[], fromIndex: number, toIndex: number): readonly Item[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const nextItems = [...items];
  const movedItems = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, ...movedItems);

  return nextItems;
}

function moveFilteredArrayItem<Item>(
  items: readonly Item[],
  predicate: (item: Item) => boolean,
  fromFilteredIndex: number,
  toFilteredIndex: number,
): readonly Item[] {
  const filteredPositions = items.reduce<number[]>((positions, item, index) => {
    if (predicate(item)) {
      positions.push(index);
    }

    return positions;
  }, []);

  if (
    fromFilteredIndex === toFilteredIndex ||
    fromFilteredIndex < 0 ||
    toFilteredIndex < 0 ||
    fromFilteredIndex >= filteredPositions.length ||
    toFilteredIndex >= filteredPositions.length
  ) {
    return items;
  }

  const reorderedFilteredItems = moveArrayItem(
    filteredPositions.map((position) => items[position]),
    fromFilteredIndex,
    toFilteredIndex,
  );
  const nextItems = [...items];

  filteredPositions.forEach((position, index) => {
    nextItems[position] = reorderedFilteredItems[index];
  });

  return nextItems;
}

function nextUniqueActionId(actions: readonly WorkflowAction<string>[]) {
  let index = actions.length + 1;
  let candidate = `action_${index}`;
  const actionIds = actions.map((action) => action.id);

  while (actionIds.includes(candidate)) {
    index += 1;
    candidate = `action_${index}`;
  }

  return candidate;
}

function nextUniqueBucketId(buckets: readonly WorkflowBucket<string>[]) {
  let index = buckets.length + 1;
  let candidate = `bucket_${index}`;
  const bucketIds = buckets.map((bucket) => bucket.id);

  while (bucketIds.includes(candidate)) {
    index += 1;
    candidate = `bucket_${index}`;
  }

  return candidate;
}

function uniqueActionIdFromLabel(label: string, actions: readonly WorkflowAction<string>[], currentIndex: number) {
  const baseId = actionIdFromLabel(label);
  const existingIds = actions.map((action, index) => (index === currentIndex ? "" : action.id));

  if (!existingIds.includes(baseId)) {
    return baseId;
  }

  let suffix = 2;
  let nextId = `${baseId}_${suffix}`;

  while (existingIds.includes(nextId)) {
    suffix += 1;
    nextId = `${baseId}_${suffix}`;
  }

  return nextId;
}

function uniqueBucketIdFromLabel(label: string, buckets: readonly WorkflowBucket<string>[], currentIndex: number) {
  const baseId = actionIdFromLabel(label);
  const existingIds = buckets.map((bucket, index) => (index === currentIndex ? "" : bucket.id));

  if (!existingIds.includes(baseId)) {
    return baseId;
  }

  let suffix = 2;
  let nextId = `${baseId}_${suffix}`;

  while (existingIds.includes(nextId)) {
    suffix += 1;
    nextId = `${baseId}_${suffix}`;
  }

  return nextId;
}

function actionIdFromLabel(label: string) {
  const id = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return id || "action";
}

function titleCaseAction(actionId: string) {
  return actionId
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function assignStateToBucket(
  workflow: EditableWorkflowDefinition,
  state: string,
  bucketId: string,
): EditableWorkflowDefinition {
  if (!state || workflow.buckets.length === 0) {
    return workflow;
  }

  const targetBucketId = workflow.buckets.some((bucket) => bucket.id === bucketId) ? bucketId : workflow.buckets[0].id;

  return {
    ...workflow,
    buckets: workflow.buckets.map((bucket) => {
      const statesWithoutMovedState = bucket.states.filter((bucketState) => bucketState !== state);

      return {
        ...bucket,
        states:
          bucket.id === targetBucketId
            ? Array.from(new Set([...statesWithoutMovedState, state]))
            : statesWithoutMovedState,
      };
    }),
  };
}

function removeStateFromBucket(
  workflow: EditableWorkflowDefinition,
  state: string,
  bucketId: string,
): EditableWorkflowDefinition {
  return {
    ...workflow,
    buckets: workflow.buckets.map((bucket) =>
      bucket.id === bucketId
        ? {
            ...bucket,
            states: bucket.states.filter((bucketState) => bucketState !== state),
          }
        : bucket,
    ),
  };
}

function normalizeImportedDefinition(value: Partial<EditableDefinition>): EditableDefinition {
  return {
    schemaVersion: value.schemaVersion ?? STATE_MACHINE_SCHEMA_VERSION,
    appName: value.appName ?? "",
    definitionVersion: value.definitionVersion ?? "",
    id: value.id ?? "",
    states: Array.isArray(value.states) ? value.states : [],
    terminalStates: Array.isArray(value.terminalStates) ? value.terminalStates : [],
    transitions: Array.isArray(value.transitions) ? value.transitions : [],
  };
}

type ImportedWorkflowDefinition = Partial<Omit<EditableWorkflowDefinition, "schemaVersion" | "buckets">> & {
  schemaVersion?: string;
  buckets?: unknown;
};

function normalizeImportedWorkflowDefinition(
  value: ImportedWorkflowDefinition,
  fallbackStateMachine: EditableDefinition,
): EditableWorkflowDefinition {
  const embeddedStateMachineDefinition = value.embeddedStateMachineDefinition
    ? normalizeImportedDefinition(value.embeddedStateMachineDefinition)
    : undefined;
  const effectiveStateMachine = embeddedStateMachineDefinition ?? fallbackStateMachine;

  return {
    schemaVersion: normalizeImportedWorkflowSchemaVersion(value.schemaVersion),
    appName: value.appName ?? "",
    workflowVersion: value.workflowVersion ?? "",
    id: value.id ?? "",
    stateMachine: {
      id: value.stateMachine?.id ?? "",
      definitionVersion: value.stateMachine?.definitionVersion ?? "",
    },
    embeddedStateMachineDefinition,
    actions: Array.isArray(value.actions) ? value.actions : [],
    buckets: normalizeImportedWorkflowBuckets(value.buckets, effectiveStateMachine.states),
  };
}

function normalizeImportedWorkflowSchemaVersion(schemaVersion: string | undefined): typeof WORKFLOW_SCHEMA_VERSION {
  return (schemaVersion === "0.1.0" ? WORKFLOW_SCHEMA_VERSION : schemaVersion ?? WORKFLOW_SCHEMA_VERSION) as typeof WORKFLOW_SCHEMA_VERSION;
}

function normalizeImportedWorkflowBuckets(value: unknown, states: readonly string[]): WorkflowBucket<string>[] {
  if (!Array.isArray(value)) {
    return createDefaultWorkflowBuckets(states);
  }

  return value.map((bucket, index) => {
    const bucketRecord = bucket && typeof bucket === "object" ? (bucket as Record<string, unknown>) : {};

    return {
      id: typeof bucketRecord.id === "string" ? bucketRecord.id : `bucket_${index + 1}`,
      label: typeof bucketRecord.label === "string" ? bucketRecord.label : `Bucket ${index + 1}`,
      states: Array.isArray(bucketRecord.states) ? bucketRecord.states.filter((state): state is string => typeof state === "string") : [],
    };
  });
}

function createDefaultWorkflowBuckets(states: readonly string[]): WorkflowBucket<string>[] {
  return [{ id: "workflow", label: "Workflow", states: [...states] }];
}

function withCurrentStateMachineReference(
  workflow: EditableWorkflowDefinition,
  stateMachine: EditableDefinition,
): EditableWorkflowDefinition {
  return {
    ...workflow,
    stateMachine: {
      id: stateMachine.id,
      definitionVersion: stateMachine.definitionVersion,
    },
  };
}

function removeEmbeddedStateMachine(workflow: EditableWorkflowDefinition): EditableWorkflowDefinition {
  const { embeddedStateMachineDefinition: _embeddedStateMachineDefinition, ...linkedWorkflow } = workflow;

  return linkedWorkflow;
}

export function buildMermaidDiagram(machine: EditableDefinition, theme: MermaidPreviewTheme = "light"): string {
  const palette = getMermaidPreviewPalette(theme);
  const lines = ["flowchart LR"];

  for (const state of machine.states) {
    lines.push(`  ${state}["${state}"]`);
  }

  for (const transition of machine.transitions) {
    lines.push(`  ${transition.from} --> ${transition.to}`);
  }

  if (machine.states.length > 0) {
    lines.push(
      `  classDef state fill:${palette.stateFill},stroke:${palette.stateStroke},stroke-width:2px,color:${palette.text};`,
    );
    lines.push(`  class ${machine.states.join(",")} state;`);
  }

  if (machine.terminalStates.length > 0) {
    lines.push(
      `  classDef terminal fill:${palette.stateFill},stroke:${palette.terminalStroke},stroke-width:3px,color:${palette.text};`,
    );
    lines.push(`  class ${machine.terminalStates.join(",")} terminal;`);
  }

  return lines.join("\n");
}

export function buildWorkflowMermaidDiagram(
  machine: EditableDefinition,
  workflow: EditableWorkflowDefinition,
  theme: MermaidPreviewTheme = "light",
): string {
  const palette = getMermaidPreviewPalette(theme);
  const lines = ["flowchart LR"];

  for (const state of machine.states) {
    lines.push(`  ${state}["${state}"]`);
  }

  for (const action of workflow.actions) {
    lines.push(`  ${action.from} -->|${escapeMermaidLabel(action.id)}| ${action.to}`);
  }

  if (machine.states.length > 0) {
    lines.push(
      `  classDef state fill:${palette.stateFill},stroke:${palette.stateStroke},stroke-width:2px,color:${palette.text};`,
    );
    lines.push(`  class ${machine.states.join(",")} state;`);
  }

  if (machine.terminalStates.length > 0) {
    lines.push(
      `  classDef terminal fill:${palette.stateFill},stroke:${palette.terminalStroke},stroke-width:3px,color:${palette.text};`,
    );
    lines.push(`  class ${machine.terminalStates.join(",")} terminal;`);
  }

  return lines.join("\n");
}

function escapeMermaidLabel(label: string) {
  return label.replace(/\|/g, "/");
}

function getMermaidPreviewPalette(theme: MermaidPreviewTheme) {
  if (theme === "dark") {
    return {
      stateFill: "#182028",
      stateStroke: "#42a9b3",
      terminalStroke: "#f0a46f",
      text: "#eef3f7",
      arrow: "#ffffff",
    };
  }

  return {
    stateFill: "#eef2f5",
    stateStroke: "#0f6b73",
    terminalStroke: "#9a431c",
    text: "#1d242d",
    arrow: "#1d242d",
  };
}

function getMermaidThemeVariables(theme: MermaidPreviewTheme) {
  const palette = getMermaidPreviewPalette(theme);

  return {
    lineColor: palette.arrow,
    arrowheadColor: palette.arrow,
    primaryColor: palette.stateFill,
    primaryBorderColor: palette.stateStroke,
    primaryTextColor: palette.text,
  };
}

function buildDefinitionFilename(definition: EditableDefinition): string {
  const parts = [definition.appName || "target-project", definition.definitionVersion || "0.0.0", "state-specification"];

  return `${parts.map(sanitizeFilenamePart).join("-")}.json`;
}

function buildWorkflowFilename(workflow: EditableWorkflowDefinition): string {
  const parts = [workflow.appName || "target-project", workflow.workflowVersion || "0.0.0", "workflow-definition"];

  return `${parts.map(sanitizeFilenamePart).join("-")}.json`;
}

function buildBundledWorkflowFilename(workflow: EditableWorkflowDefinition): string {
  const parts = [
    workflow.appName || "target-project",
    workflow.workflowVersion || "0.0.0",
    "workflow-definition-bundled",
  ];

  return `${parts.map(sanitizeFilenamePart).join("-")}.json`;
}

async function inferProjectNameFromDirectory(
  directory: ProjectDirectoryHandle,
): Promise<{ name: string; source: string }> {
  const packageJson = await readJsonFile(directory, "package.json");
  const packageName = getPackageNameSlug(readStringProperty(packageJson, "name"));

  if (packageName) {
    return { name: packageName, source: "package.json" };
  }

  if (isSlugLikeProjectName(directory.name)) {
    return { name: directory.name, source: "selected folder" };
  }

  const dashboardManifest = await readJsonFile(directory, ".app-dashboard.json");
  const dashboardName = readStringProperty(dashboardManifest, "name");

  if (dashboardName && isSlugLikeProjectName(dashboardName)) {
    return { name: dashboardName, source: ".app-dashboard.json" };
  }

  return { name: slugifyProjectName(directory.name), source: "selected folder" };
}

async function readJsonFile(directory: ProjectDirectoryHandle, filename: string): Promise<unknown> {
  try {
    const fileHandle = await directory.getFileHandle(filename);
    const file = await fileHandle.getFile();

    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

function readStringProperty(value: unknown, property: string): string | null {
  if (!value || typeof value !== "object" || !(property in value)) {
    return null;
  }

  const propertyValue = (value as Record<string, unknown>)[property];

  return typeof propertyValue === "string" ? propertyValue.trim() : null;
}

function getPackageNameSlug(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const packageName = value.startsWith("@") ? value.split("/").at(-1) ?? "" : value;

  return isSlugLikeProjectName(packageName) ? packageName : null;
}

function isSlugLikeProjectName(value: string): boolean {
  return /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value.trim());
}

function slugifyProjectName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/[._-]{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");

  return slug || "target-project";
}

async function saveJsonFile({
  data,
  filename,
  description,
  onMessage,
}: {
  data: unknown;
  filename: string;
  description: string;
  onMessage: (message: string) => void;
}) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
    type: "application/json",
  });
  const fileSystemWindow = window as WindowWithFileSystemAccess;

  if (fileSystemWindow.showSaveFilePicker) {
    try {
      const fileHandle = await fileSystemWindow.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description,
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const writable = await fileHandle.createWritable();

      await writable.write(blob);
      await writable.close();
      onMessage(`Exported ${filename}.`);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        onMessage("Export cancelled.");
        return;
      }

      onMessage("Save picker failed. Download fallback started.");
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  onMessage(`Downloaded ${filename}.`);
}

function sanitizeFilenamePart(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "state-machine";
}

function loadAppSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(appSettingsStorageKey);

    if (!stored) {
      return defaultSettings;
    }

    return { ...defaultSettings, ...JSON.parse(stored) };
  } catch {
    return defaultSettings;
  }
}
