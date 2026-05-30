import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import packageJson from "../package.json";
import {
  CURRENT_WORKSPACE_DRAFT_KEY,
  STATE_MACHINE_SCHEMA_VERSION,
  WORKFLOW_SCHEMA_VERSION,
  PersistedStateMachineDefinition,
  PersistedWorkflowDefinition,
  StateMachineDefinition,
  WorkflowAction,
  WorkflowActionTrigger,
  WorkflowBucket,
  WorkflowDefinition,
  WorkflowLifecycleHook,
  WorkflowLifecyclePhase,
  WorkflowLifecycleHookRetryPolicy,
  WorkflowLifecycleHookSchedule,
  WorkflowValidationError,
  buildStateMachineDefinitionKey,
  buildWorkflowDefinitionKey,
  buildWorkflowStateMachineKey,
  createDefinitionLibraryStorage,
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
  diagramDirection: DiagramDirection;
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

type WorkflowLifecycleHookWithIndex = WorkflowLifecycleHook<string> & {
  index: number;
};

type WorkflowReconciliationSummary = {
  addedStateEntries: number;
  removedStateEntries: number;
  removedActions: number;
  removedBucketStateAssignments: number;
  removedHooks: number;
};

type ActivePage = "state-machine" | "workflow" | "library" | "settings";
type WorkflowEditorView = "actions" | "buckets" | "lifecycle";

type MermaidPreviewTheme = AppSettings["theme"];
type DiagramDirection = "vertical" | "horizontal";

type ActionMenuItem = {
  label: string;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
};

let mermaidPreviewCounter = 0;

const lifecyclePhases: readonly WorkflowLifecyclePhase[] = [
  "before_transition",
  "on_state_entry",
  "while_in_state",
  "on_terminal_entry",
];

const lifecyclePhaseLabels: Record<WorkflowLifecyclePhase, string> = {
  before_transition: "Before Transition",
  on_state_entry: "On State Entry",
  while_in_state: "While In State",
  on_terminal_entry: "On Terminal Entry",
};

const defaultWhileInStateSchedule: WorkflowLifecycleHookSchedule = {
  trigger: "every_interval",
  intervalMs: 15 * 60 * 1000,
};

const scheduleUnits = [
  { id: "seconds", label: "Seconds", factorMs: 1000 },
  { id: "minutes", label: "Minutes", factorMs: 60 * 1000 },
  { id: "hours", label: "Hours", factorMs: 60 * 60 * 1000 },
] as const;

type ScheduleUnit = (typeof scheduleUnits)[number]["id"];

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
  states: initialDefinition.states.map((state) => ({ id: state, visible: true })),
  actions: [
    { id: "start", label: "Start", from: "queued", to: "running", trigger: "user", visible: true },
    { id: "complete", label: "Complete", from: "running", to: "completed", trigger: "user", visible: true },
    { id: "fail", label: "Fail", from: "running", to: "failed", trigger: "user", visible: true },
    { id: "retry", label: "Retry", from: "failed", to: "queued", trigger: "user", visible: true },
    { id: "cancel_queued", label: "Cancel", from: "queued", to: "cancelled", trigger: "user", visible: true },
    { id: "cancel_running", label: "Cancel", from: "running", to: "cancelled", trigger: "user", visible: true },
  ],
  buckets: [
    { id: "waiting", label: "Waiting", visible: true, states: ["queued"] },
    { id: "active", label: "Active", visible: true, states: ["running", "failed"] },
    { id: "finished", label: "Finished", visible: true, states: ["completed", "cancelled"] },
  ],
  hooks: [],
};

const appSettingsStorageKey = "state-workflow-editor-settings";
const defaultSettings: AppSettings = {
  logoUrl: "",
  theme: "light",
  diagramDirection: "vertical",
};

export function App() {
  const [definition, setDefinition] = useState<EditableDefinition>(initialDefinition);
  const [workflow, setWorkflow] = useState<EditableWorkflowDefinition>(initialWorkflowDefinition);
  const [stateMachineMessage, setStateMachineMessage] = useState<string | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState(initialDefinition.states[0]);
  const [selectedWorkflowView, setSelectedWorkflowView] = useState<WorkflowEditorView>("actions");
  const [selectedBucketId, setSelectedBucketId] = useState(initialWorkflowDefinition.buckets[0].id);
  const [selectedLifecycleHookId, setSelectedLifecycleHookId] = useState<string | null>(null);
  const [draftStateBucketId, setDraftStateBucketId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<ActivePage>("state-machine");
  const [isWorkflowValidationDialogOpen, setWorkflowValidationDialogOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(loadAppSettings);
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [stateMachineRecords, setStateMachineRecords] = useState<PersistedStateMachineDefinition[]>([]);
  const [workflowRecords, setWorkflowRecords] = useState<PersistedWorkflowDefinition[]>([]);
  const [selectedLibraryStateMachineKey, setSelectedLibraryStateMachineKey] = useState<string | null>(null);
  const [isLibraryReady, setLibraryReady] = useState(false);
  const stateMachineFileInputRef = useRef<HTMLInputElement | null>(null);
  const workflowFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastDraftSignatureRef = useRef<string | null>(null);
  const storage = useMemo(() => {
    if (!("indexedDB" in window) || !window.indexedDB) {
      return null;
    }

    return createDefinitionLibraryStorage(window.indexedDB);
  }, []);
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
  const workflowHooks = linkedWorkflow.hooks.map((hook, index) => ({ ...hook, index }));
  const selectedLifecycleHook =
    workflowHooks.find((hook) => hook.id === selectedLifecycleHookId) ?? workflowHooks[0] ?? null;
  const workflowBuckets = linkedWorkflow.buckets.map((bucket, index) => ({ ...bucket, index }));
  const selectedBucket = workflowBuckets.find((bucket) => bucket.id === selectedBucketId) ?? workflowBuckets[0];
  const selectedBucketStates = selectedBucket?.states ?? [];
  const workflowIssueCount = workflowValidation.valid ? 0 : workflowValidation.errors.length;
  const workflowStateVisibility = useMemo(() => {
    const visibility = new Map<string, boolean>();

    for (const state of linkedWorkflow.states) {
      visibility.set(state.id, state.visible);
    }

    return visibility;
  }, [linkedWorkflow.states]);
  const currentStateMachineKey = buildStateMachineDefinitionKey(definition);
  const currentWorkflowKey = buildWorkflowDefinitionKey(linkedWorkflow);
  const selectedLibraryStateMachine =
    stateMachineRecords.find((record) => record.key === selectedLibraryStateMachineKey) ?? stateMachineRecords[0] ?? null;
  const selectedLibraryWorkflows = selectedLibraryStateMachine
    ? workflowRecords.filter((record) => record.stateMachineKey === selectedLibraryStateMachine.key)
    : [];

  const refreshLibrary = useCallback(
    async (nextSelectedStateMachineKey?: string | null) => {
      if (!storage) {
        setLibraryReady(true);
        setLibraryMessage("Local definition library is not available in this browser.");
        return;
      }

      const [nextStateMachineRecords, nextWorkflowRecords] = await Promise.all([
        storage.listStateMachineDefinitions(),
        storage.listWorkflowDefinitions(),
      ]);

      setStateMachineRecords(nextStateMachineRecords);
      setWorkflowRecords(nextWorkflowRecords);
      setSelectedLibraryStateMachineKey((current) => {
        if (nextSelectedStateMachineKey !== undefined) {
          return nextSelectedStateMachineKey;
        }

        if (current && nextStateMachineRecords.some((record) => record.key === current)) {
          return current;
        }

        return nextStateMachineRecords[0]?.key ?? null;
      });
      setLibraryReady(true);
    },
    [storage],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialLibraryState() {
      if (!storage) {
        setLibraryReady(true);
        setLibraryMessage("Local definition library is not available in this browser.");
        return;
      }

      try {
        const draft = await storage.loadCurrentWorkspaceDraft();

        if (cancelled) {
          return;
        }

        if (draft?.key === CURRENT_WORKSPACE_DRAFT_KEY) {
          const draftWorkflow = normalizeImportedWorkflowDefinition(
            draft.workflow as ImportedWorkflowDefinition,
            draft.definition,
          );
          setDefinition(draft.definition);
          setWorkflow(removeEmbeddedStateMachine(draftWorkflow));
          setSelectedState(draft.definition.states[0] ?? "");
          setSelectedBucketId(draftWorkflow.buckets[0]?.id ?? "");
          setSelectedLifecycleHookId(draftWorkflow.hooks[0]?.id ?? null);

          if (draft.activePage === "state-machine" || draft.activePage === "workflow" || draft.activePage === "library" || draft.activePage === "settings") {
            setActivePage(draft.activePage);
          }

          if (draft.selectedWorkflowView === "actions" || draft.selectedWorkflowView === "buckets" || draft.selectedWorkflowView === "lifecycle") {
            setSelectedWorkflowView(draft.selectedWorkflowView);
          }

          lastDraftSignatureRef.current = buildDraftSignature(
            draft.definition,
            removeEmbeddedStateMachine(draftWorkflow),
            draft.activePage,
            draft.selectedWorkflowView,
          );
        }

        await refreshLibrary();
      } catch (error) {
        if (!cancelled) {
          setLibraryReady(true);
          setLibraryMessage(error instanceof Error ? error.message : "Unable to open local definition library.");
        }
      }
    }

    void loadInitialLibraryState();

    return () => {
      cancelled = true;
    };
  }, [refreshLibrary, storage]);

  useEffect(() => {
    if (!storage || !isLibraryReady) {
      return;
    }

    const draftWorkflow = removeEmbeddedStateMachine(linkedWorkflow);
    const signature = buildDraftSignature(definition, draftWorkflow, activePage, selectedWorkflowView);

    if (signature === lastDraftSignatureRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      storage
        .saveCurrentWorkspaceDraft({
          definition,
          workflow: draftWorkflow,
          activePage,
          selectedWorkflowView,
        })
        .then(() => {
          lastDraftSignatureRef.current = signature;
        })
        .catch((error) => {
          setLibraryMessage(error instanceof Error ? error.message : "Unable to autosave the current workspace.");
        });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [activePage, definition, isLibraryReady, linkedWorkflow, selectedWorkflowView, storage]);

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

  useEffect(() => {
    if (workflow.hooks.length > 0 && selectedLifecycleHookId && !workflow.hooks.some((hook) => hook.id === selectedLifecycleHookId)) {
      setSelectedLifecycleHookId(workflow.hooks[0].id);
    }

    if (workflow.hooks.length === 0 && selectedLifecycleHookId) {
      setSelectedLifecycleHookId(null);
    }
  }, [selectedLifecycleHookId, workflow.hooks]);

  useEffect(() => {
    if (workflowValidation.valid) {
      setWorkflowValidationDialogOpen(false);
    }
  }, [workflowValidation.valid]);

  useEffect(() => {
    setWorkflow((current) => {
      const reconciliation = reconcileWorkflowToStateMachine(current, definition);
      const message = formatWorkflowSyncMessage(reconciliation.summary);

      if (!reconciliation.changed) {
        return current;
      }

      if (message) {
        setWorkflowMessage(message);
      }

      return reconciliation.workflow;
    });
  }, [definition]);

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
      setWorkflow((currentWorkflow) => ({
        ...assignStateToBucket(currentWorkflow, nextState, selectedBucketId),
        states: [...currentWorkflow.states, { id: nextState, visible: true }],
      }));

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
      states: current.states.map((state) => ({
        ...state,
        id: state.id === previousState ? nextState : state.id,
      })),
      buckets: current.buckets.map((bucket) => ({
        ...bucket,
        states: bucket.states.map((state) => (state === previousState ? nextState : state)),
      })),
      hooks: current.hooks.map((hook) =>
        hook.targetType === "state" && hook.targetId === previousState ? { ...hook, targetId: nextState } : hook,
      ),
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
      states: current.states.filter((state) => state.id !== removedState),
      buckets: current.buckets.map((bucket) => ({
        ...bucket,
        states: bucket.states.filter((state) => state !== removedState),
      })),
      hooks: current.hooks.filter((hook) => hook.targetType !== "state" || hook.targetId !== removedState),
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
        actions: [...current.actions, { id, label: titleCaseAction(id), from, to, trigger: "user", visible: true }],
      };
    });
  }

  function addAllWorkflowActions() {
    const isOverwrite = workflow.actions.length > 0;

    if (
      isOverwrite &&
      !window.confirm("Workflow actions already exist. Add all actions will overwrite existing actions. Continue?")
    ) {
      return;
    }

    const actions = createWorkflowActionsFromTransitions(definition.transitions);
    const selectedHook = workflow.hooks.find((hook) => hook.id === selectedLifecycleHookId);

    setWorkflow((current) => ({
      ...current,
      actions,
      hooks: isOverwrite ? current.hooks.filter((hook) => hook.targetType !== "action") : current.hooks,
    }));

    if (isOverwrite && selectedHook?.targetType === "action") {
      setSelectedLifecycleHookId(null);
    }

    setWorkflowMessage(
      isOverwrite
        ? `Replaced existing workflow actions with ${actions.length} actions from state-machine transitions.`
        : `Added ${actions.length} workflow actions from state-machine transitions.`,
    );
  }

  function updateWorkflowAction(index: number, field: "id" | "label" | "from" | "to", value: string) {
    setWorkflow((current) => ({
      ...current,
      actions: current.actions.map((action, actionIndex) => {
        if (actionIndex !== index) {
          return action;
        }

        return { ...action, [field]: value };
      }),
      hooks:
        field === "id"
          ? current.hooks.map((hook) => {
              const action = current.actions[index];

              return action && hook.targetType === "action" && hook.targetId === action.id
                ? { ...hook, targetId: value }
                : hook;
            })
          : current.hooks,
    }));
  }

  function updateWorkflowActionTrigger(index: number, trigger: WorkflowActionTrigger) {
    setWorkflow((current) => ({
      ...current,
      actions: current.actions.map((action, actionIndex) => {
        if (actionIndex !== index) {
          return action;
        }

        return {
          ...action,
          trigger,
          visible: trigger === "user",
        };
      }),
    }));
  }

  function updateWorkflowActionVisible(index: number, visible: boolean) {
    setWorkflow((current) => ({
      ...current,
      actions: current.actions.map((action, actionIndex) =>
        actionIndex === index ? { ...action, visible } : action,
      ),
    }));
  }

  function selectLifecycleHookForAction(actionId: string) {
    const hook = workflow.hooks.find(
      (candidate) =>
        candidate.phase === "before_transition" &&
        candidate.targetType === "action" &&
        candidate.targetId === actionId,
    );

    if (!hook) {
      return;
    }

    setSelectedLifecycleHookId(hook.id);
    setSelectedWorkflowView("lifecycle");
  }

  function addLifecycleHook(phase: WorkflowLifecyclePhase, targetId: string) {
    if (!targetId) {
      return;
    }

    const nextHookId = nextUniqueLifecycleHookId(phase, targetId, workflow.hooks);

    setWorkflow((current) => ({
      ...current,
      hooks: [
        ...current.hooks,
        {
          id: nextHookId,
          phase,
          targetType: phase === "before_transition" ? "action" : "state",
          targetId,
          schedule: phase === "while_in_state" ? { ...defaultWhileInStateSchedule } : undefined,
        },
      ],
    }));
    setSelectedLifecycleHookId(nextHookId);
  }

  function updateLifecycleHookTarget(index: number, targetId: string) {
    setWorkflow((current) => {
      const currentHook = current.hooks[index];

      if (!currentHook) {
        return current;
      }

      const nextHookId = nextUniqueLifecycleHookId(
        currentHook.phase,
        targetId,
        current.hooks.filter((_, candidateIndex) => candidateIndex !== index),
      );

      if (currentHook.id === selectedLifecycleHookId) {
        setSelectedLifecycleHookId(nextHookId);
      }

      return {
        ...current,
        hooks: current.hooks.map((hook, hookIndex) =>
          hookIndex === index
            ? {
                ...hook,
                id: nextHookId,
                targetId,
              }
            : hook,
        ),
      };
    });
  }

  function updateLifecycleHookHandler(
    index: number,
    field: "handlerKey" | "onSuccess" | "onFailure",
    handlerKey: string,
  ) {
    setWorkflow((current) => ({
      ...current,
      hooks: current.hooks.map((hook, hookIndex) => {
        if (hookIndex !== index) {
          return hook;
        }

        const trimmedHandlerKey = handlerKey.trim();

        if (field === "handlerKey") {
          return {
            ...hook,
            handlerKey: trimmedHandlerKey || undefined,
          };
        }

        return {
          ...hook,
          [field]: trimmedHandlerKey ? { handlerKey: trimmedHandlerKey } : undefined,
        };
      }),
    }));
  }

  function updateLifecycleHookScheduleTrigger(index: number, trigger: WorkflowLifecycleHookSchedule["trigger"]) {
    setWorkflow((current) => ({
      ...current,
      hooks: current.hooks.map((hook, hookIndex) => {
        if (hookIndex !== index || hook.phase !== "while_in_state") {
          return hook;
        }

        const durationMs = getLifecycleScheduleDurationMs(hook.schedule) ?? getLifecycleScheduleDurationMs(defaultWhileInStateSchedule) ?? 900000;

        return {
          ...hook,
          schedule:
            trigger === "after_duration"
              ? { trigger, delayMs: durationMs }
              : { trigger, intervalMs: durationMs },
        };
      }),
    }));
  }

  function updateLifecycleHookScheduleDuration(index: number, amount: string, unit: ScheduleUnit) {
    setWorkflow((current) => ({
      ...current,
      hooks: current.hooks.map((hook, hookIndex) => {
        if (hookIndex !== index || hook.phase !== "while_in_state") {
          return hook;
        }

        const unitFactor = getScheduleUnitFactorMs(unit);
        const nextDurationMs = Number(amount) * unitFactor;
        const trigger = getLifecycleScheduleTrigger(hook.schedule) ?? "every_interval";

        return {
          ...hook,
          schedule:
            trigger === "after_duration"
              ? { trigger, delayMs: nextDurationMs }
              : { trigger, intervalMs: nextDurationMs },
        };
      }),
    }));
  }

  function updateLifecycleHookRetryPolicy(
    index: number,
    field: keyof WorkflowLifecycleHookRetryPolicy,
    value: string,
  ) {
    setWorkflow((current) => ({
      ...current,
      hooks: current.hooks.map((hook, hookIndex) => {
        if (hookIndex !== index) {
          return hook;
        }

        const currentRetryPolicy = hook.retryPolicy as Partial<WorkflowLifecycleHookRetryPolicy> | undefined;
        const nextRetryPolicy: Partial<WorkflowLifecycleHookRetryPolicy> = {
          ...(currentRetryPolicy ?? {}),
          [field]: value.trim() === "" ? undefined : Number(value),
        };

        if (nextRetryPolicy.maxAttempts === undefined && nextRetryPolicy.delayMs === undefined) {
          return {
            ...hook,
            retryPolicy: undefined,
          };
        }

        return {
          ...hook,
          retryPolicy: nextRetryPolicy as WorkflowLifecycleHookRetryPolicy,
        };
      }),
    }));
  }

  function removeLifecycleHook(index: number) {
    setWorkflow((current) => {
      const removedHook = current.hooks[index];
      const nextHooks = current.hooks.filter((_, hookIndex) => hookIndex !== index);

      if (removedHook?.id === selectedLifecycleHookId) {
        setSelectedLifecycleHookId(nextHooks[Math.max(0, index - 1)]?.id ?? nextHooks[0]?.id ?? null);
      }

      return {
        ...current,
        hooks: nextHooks,
      };
    });
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
    const removedAction = workflow.actions[index];

    setWorkflow((current) => ({
      ...current,
      actions: current.actions.filter((_, actionIndex) => actionIndex !== index),
      hooks: removedAction
        ? current.hooks.filter((hook) => hook.targetType !== "action" || hook.targetId !== removedAction.id)
        : current.hooks,
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
      const nextBucket = { id, label: titleCaseAction(id), visible: true, states: [] };

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

  function toggleWorkflowBucketVisible(index: number, visible: boolean) {
    setWorkflow((current) => ({
      ...current,
      buckets: current.buckets.map((bucket, bucketIndex) =>
        bucketIndex === index ? { ...bucket, visible } : bucket,
      ),
    }));
  }

  function toggleWorkflowStateVisible(state: string, visible: boolean) {
    setWorkflow((current) => ({
      ...current,
      states: current.states.map((workflowState) =>
        workflowState.id === state ? { ...workflowState, visible } : workflowState,
      ),
    }));
  }

  function removeWorkflowBucket(index: number) {
    const bucket = workflow.buckets[index];

    if (!bucket) {
      return;
    }

    if (
      bucket.states.length > 0 &&
      !window.confirm(
        "Remove this bucket? Its state assignments will be removed, but workflow actions and the state machine will not change.",
      )
    ) {
      return;
    }

    setWorkflow((current) => {
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

  function resetWorkflow() {
    const confirmed = window.confirm(
      "Reset workflow actions and bucket structure? This removes workflow actions and buckets, but keeps the state machine definition.",
    );

    if (!confirmed) {
      return;
    }

    const nextWorkflow = resetWorkflowFromStateMachine(workflow, definition);

    setWorkflow(nextWorkflow);
    setSelectedBucketId(nextWorkflow.buckets[0]?.id ?? "");
    setSelectedLifecycleHookId(null);
    setDraftStateBucketId(null);
    setWorkflowMessage("Workflow reset from current state machine.");
  }

  async function saveCurrentStateMachineToLibrary() {
    if (!storage) {
      setLibraryMessage("Local definition library is not available in this browser.");
      return;
    }

    if (!validation.valid) {
      setLibraryMessage("Fix state-machine validation issues before saving to the Library.");
      return;
    }

    try {
      const existing = await storage.getStateMachineDefinition(currentStateMachineKey);

      if (existing && !window.confirm(`Replace saved state machine ${currentStateMachineKey}?`)) {
        setLibraryMessage("State-machine save cancelled.");
        return;
      }

      const saved = await storage.saveStateMachineDefinition(definition);
      await refreshLibrary(saved.key);
      setLibraryMessage(`Saved state machine ${saved.key}.`);
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "Unable to save state machine to the Library.");
    }
  }

  async function saveCurrentWorkflowToLibrary() {
    if (!storage) {
      setLibraryMessage("Local definition library is not available in this browser.");
      return;
    }

    if (!workflowValidation.valid) {
      setLibraryMessage("Fix workflow validation issues before saving to the Library.");
      return;
    }

    try {
      const stateMachineKey = buildWorkflowStateMachineKey(linkedWorkflow.stateMachine);
      const linkedStateMachine = await storage.getStateMachineDefinition(stateMachineKey);

      if (!linkedStateMachine) {
        setLibraryMessage(`Save linked state machine ${stateMachineKey} before saving this workflow.`);
        return;
      }

      const existing = await storage.getWorkflowDefinition(currentWorkflowKey);

      if (existing && !window.confirm(`Replace saved workflow ${currentWorkflowKey}?`)) {
        setLibraryMessage("Workflow save cancelled.");
        return;
      }

      const saved = await storage.saveWorkflowDefinition(removeEmbeddedStateMachine(linkedWorkflow));
      await refreshLibrary(saved.stateMachineKey);
      setLibraryMessage(`Saved workflow ${saved.key}.`);
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "Unable to save workflow to the Library.");
    }
  }

  async function saveCurrentStateMachineAndWorkflowToLibrary() {
    if (!storage) {
      setLibraryMessage("Local definition library is not available in this browser.");
      return;
    }

    if (!validation.valid || !workflowValidation.valid) {
      setLibraryMessage("Fix validation issues before saving the state machine and workflow to the Library.");
      return;
    }

    try {
      const existingStateMachine = await storage.getStateMachineDefinition(currentStateMachineKey);
      const existingWorkflow = await storage.getWorkflowDefinition(currentWorkflowKey);

      if (
        (existingStateMachine || existingWorkflow) &&
        !window.confirm(
          `Replace existing saved state-machine or workflow records for ${currentStateMachineKey} and ${currentWorkflowKey}?`,
        )
      ) {
        setLibraryMessage("State-machine and workflow save cancelled.");
        return;
      }

      const savedStateMachine = await storage.saveStateMachineDefinition(definition);
      const savedWorkflow = await storage.saveWorkflowDefinition(removeEmbeddedStateMachine(linkedWorkflow));

      await refreshLibrary(savedStateMachine.key);
      setLibraryMessage(`Saved state machine ${savedStateMachine.key} and workflow ${savedWorkflow.key}.`);
    } catch (error) {
      setLibraryMessage(
        error instanceof Error ? error.message : "Unable to save state machine and workflow to the Library.",
      );
    }
  }

  async function loadStateMachineFromLibrary(key: string) {
    if (!storage) {
      setLibraryMessage("Local definition library is not available in this browser.");
      return;
    }

    try {
      const record = await storage.getStateMachineDefinition(key);

      if (!record) {
        setLibraryMessage(`State machine ${key} is no longer saved.`);
        await refreshLibrary();
        return;
      }

      const result = validateStateMachineDefinition(record.definition);

      if (!result.valid) {
        setLibraryMessage(`Saved state machine is invalid: ${result.errors.map((error) => error.message).join(" ")}`);
        return;
      }

      const nextWorkflow = resetWorkflowFromStateMachine(workflow, record.definition);

      setDefinition(record.definition);
      setSelectedState(record.definition.states[0] ?? "");
      setWorkflow(nextWorkflow);
      setSelectedBucketId(nextWorkflow.buckets[0]?.id ?? "");
      setSelectedLifecycleHookId(null);
      setActivePage("state-machine");
      setLibraryMessage(`Loaded state machine ${record.key}.`);
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "Unable to load state machine from the Library.");
    }
  }

  async function loadWorkflowFromLibrary(key: string) {
    if (!storage) {
      setLibraryMessage("Local definition library is not available in this browser.");
      return;
    }

    try {
      const record = await storage.getWorkflowDefinition(key);

      if (!record) {
        setLibraryMessage(`Workflow ${key} is no longer saved.`);
        await refreshLibrary();
        return;
      }

      const linkedStateMachine = await storage.getStateMachineDefinition(record.stateMachineKey);

      if (!linkedStateMachine) {
        setLibraryMessage(`Linked state machine ${record.stateMachineKey} must be saved before this workflow can load.`);
        return;
      }

      const normalizedWorkflow = normalizeImportedWorkflowDefinition(
        record.definition as ImportedWorkflowDefinition,
        linkedStateMachine.definition,
      );
      const reconciliation = reconcileWorkflowToStateMachine(normalizedWorkflow, linkedStateMachine.definition);
      const result = validateWorkflowDefinition(reconciliation.workflow, linkedStateMachine.definition);

      if (!result.valid) {
        setLibraryMessage(`Saved workflow is invalid: ${result.errors.map((error) => error.message).join(" ")}`);
        return;
      }

      setDefinition(linkedStateMachine.definition);
      setSelectedState(linkedStateMachine.definition.states[0] ?? "");
      setWorkflow(removeEmbeddedStateMachine(reconciliation.workflow));
      setSelectedBucketId(reconciliation.workflow.buckets[0]?.id ?? "");
      setSelectedLifecycleHookId(reconciliation.workflow.hooks[0]?.id ?? null);
      setActivePage("workflow");
      setLibraryMessage(formatWorkflowSyncMessage(reconciliation.summary) ?? `Loaded workflow ${record.key}.`);
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "Unable to load workflow from the Library.");
    }
  }

  async function duplicateStateMachineVersionFromLibrary(key: string) {
    if (!storage) {
      setLibraryMessage("Local definition library is not available in this browser.");
      return;
    }

    try {
      const record = await storage.getStateMachineDefinition(key);

      if (!record) {
        setLibraryMessage(`State machine ${key} is no longer saved.`);
        await refreshLibrary();
        return;
      }

      const nextVersion = window.prompt("New state-machine version", record.definition.definitionVersion);

      if (!nextVersion) {
        setLibraryMessage("State-machine duplicate cancelled.");
        return;
      }

      const nextDefinition = { ...record.definition, definitionVersion: nextVersion.trim() };
      const result = validateStateMachineDefinition(nextDefinition);

      if (!result.valid) {
        setLibraryMessage(`New version is invalid: ${result.errors.map((error) => error.message).join(" ")}`);
        return;
      }

      const nextKey = buildStateMachineDefinitionKey(nextDefinition);
      const existing = await storage.getStateMachineDefinition(nextKey);

      if (existing && !window.confirm(`Replace saved state machine ${nextKey}?`)) {
        setLibraryMessage("State-machine duplicate cancelled.");
        return;
      }

      const saved = await storage.saveStateMachineDefinition(nextDefinition);
      await refreshLibrary(saved.key);
      setLibraryMessage(`Duplicated state machine as ${saved.key}.`);
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "Unable to duplicate state-machine version.");
    }
  }

  async function duplicateWorkflowVersionFromLibrary(key: string) {
    if (!storage) {
      setLibraryMessage("Local definition library is not available in this browser.");
      return;
    }

    try {
      const record = await storage.getWorkflowDefinition(key);

      if (!record) {
        setLibraryMessage(`Workflow ${key} is no longer saved.`);
        await refreshLibrary();
        return;
      }

      const nextVersion = window.prompt("New workflow version", record.definition.workflowVersion);

      if (!nextVersion) {
        setLibraryMessage("Workflow duplicate cancelled.");
        return;
      }

      const linkedStateMachine = await storage.getStateMachineDefinition(record.stateMachineKey);
      if (!linkedStateMachine) {
        setLibraryMessage(`Linked state machine ${record.stateMachineKey} must be saved before this workflow can be duplicated.`);
        return;
      }

      const normalizedWorkflow = normalizeImportedWorkflowDefinition(
        record.definition as ImportedWorkflowDefinition,
        linkedStateMachine.definition,
      );
      const nextWorkflow = { ...normalizedWorkflow, workflowVersion: nextVersion.trim() };
      const result = validateWorkflowDefinition(nextWorkflow, linkedStateMachine.definition);

      if (!result.valid) {
        setLibraryMessage(`New workflow version is invalid: ${result.errors.map((error) => error.message).join(" ")}`);
        return;
      }

      const nextKey = buildWorkflowDefinitionKey(nextWorkflow);
      const existing = await storage.getWorkflowDefinition(nextKey);

      if (existing && !window.confirm(`Replace saved workflow ${nextKey}?`)) {
        setLibraryMessage("Workflow duplicate cancelled.");
        return;
      }

      const saved = await storage.saveWorkflowDefinition(nextWorkflow);
      await refreshLibrary(saved.stateMachineKey);
      setLibraryMessage(`Duplicated workflow as ${saved.key}.`);
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "Unable to duplicate workflow version.");
    }
  }

  async function deleteStateMachineFromLibrary(key: string) {
    if (!storage) {
      setLibraryMessage("Local definition library is not available in this browser.");
      return;
    }

    try {
      const linkedWorkflows = await storage.listWorkflowDefinitionsForStateMachine(key);

      if (linkedWorkflows.length > 0) {
        setLibraryMessage(`Delete linked workflows before deleting ${key}.`);
        return;
      }

      if (!window.confirm(`Delete saved state machine ${key}?`)) {
        setLibraryMessage("State-machine delete cancelled.");
        return;
      }

      await storage.deleteStateMachineDefinition(key);
      await refreshLibrary(null);
      setLibraryMessage(`Deleted state machine ${key}.`);
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "Unable to delete state machine from the Library.");
    }
  }

  async function deleteWorkflowFromLibrary(key: string) {
    if (!storage) {
      setLibraryMessage("Local definition library is not available in this browser.");
      return;
    }

    try {
      const record = await storage.getWorkflowDefinition(key);

      if (!record) {
        setLibraryMessage(`Workflow ${key} is no longer saved.`);
        await refreshLibrary();
        return;
      }

      if (!window.confirm(`Delete saved workflow ${key}?`)) {
        setLibraryMessage("Workflow delete cancelled.");
        return;
      }

      await storage.deleteWorkflowDefinition(key);
      await refreshLibrary(record.stateMachineKey);
      setLibraryMessage(`Deleted workflow ${key}.`);
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "Unable to delete workflow from the Library.");
    }
  }

  function updateLogoUrl(logoUrl: string) {
    updateSettings({ ...settings, logoUrl });
  }

  function toggleTheme() {
    updateSettings({ ...settings, theme: settings.theme === "light" ? "dark" : "light" });
  }

  function updateDiagramDirection(diagramDirection: DiagramDirection) {
    updateSettings({ ...settings, diagramDirection });
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
      setActiveMessage("Folder picker is not supported in this browser. Type the target app name manually.");
      return;
    }

    try {
      const directory = await fileSystemWindow.showDirectoryPicker();
      const project = await inferProjectNameFromDirectory(directory);

      updateTargetProject(project.name);
      setActiveMessage(`Selected app "${project.name}" from ${project.source}.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setActiveMessage("App selection cancelled.");
        return;
      }

      setActiveMessage(error instanceof Error ? error.message : "Unable to select app folder.");
    }
  }

  async function importStateMachineDefinition(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      await importStateMachineFile(file);
    } finally {
      event.target.value = "";
    }
  }

  async function importStateMachineFile(file: File) {
    if (!isJsonFile(file)) {
      setStateMachineMessage("Unsupported file type. Choose a .json state-machine definition file.");
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as EditableDefinition;
      applyImportedStateMachineDefinition(parsed, setStateMachineMessage);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to parse the selected file.";
      setStateMachineMessage(`Invalid JSON. Choose a valid state-machine .json file. ${detail}`);
    }
  }

  function applyImportedStateMachineDefinition(
    value: Partial<EditableDefinition>,
    onMessage: (message: string | null) => void,
    successMessage: string | null = null,
  ) {
    const nextDefinition = normalizeImportedDefinition(value);
    const result = validateStateMachineDefinition(nextDefinition);

    if (!result.valid) {
      onMessage(`Invalid state-machine definition: ${result.errors.map((error) => error.message).join(" ")}`);
      return false;
    }

    setDefinition(nextDefinition);
    setSelectedState(nextDefinition.states[0] ?? "");
    setWorkflow((current) => ({ ...current, appName: nextDefinition.appName }));
    onMessage(successMessage);
    return true;
  }

  async function importWorkflowDefinition(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      await importWorkflowFile(file);
    } finally {
      event.target.value = "";
    }
  }

  async function importWorkflowFile(file: File) {
    if (!isJsonFile(file)) {
      setWorkflowMessage("Unsupported file type. Choose a .json workflow or state-machine definition file.");
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;

      if (isImportedStateMachineDefinition(parsed)) {
        applyImportedStateMachineDefinition(parsed, setWorkflowMessage, "Imported state-machine definition.");
        return;
      }

      const nextWorkflow = normalizeImportedWorkflowDefinition(parsed as ImportedWorkflowDefinition, definition);
      const effectiveStateMachine = nextWorkflow.embeddedStateMachineDefinition ?? definition;
      const reconciliation = reconcileWorkflowToStateMachine(nextWorkflow, effectiveStateMachine);
      const reconciledWorkflow = reconciliation.workflow;
      const result = validateWorkflowDefinition(reconciledWorkflow, effectiveStateMachine);

      if (!result.valid) {
        if (canLoadWorkflowWithValidationIssues(result.errors)) {
          if (nextWorkflow.embeddedStateMachineDefinition) {
            setDefinition(nextWorkflow.embeddedStateMachineDefinition);
            setSelectedState(nextWorkflow.embeddedStateMachineDefinition.states[0] ?? "");
          }

          setWorkflow(removeEmbeddedStateMachine(reconciledWorkflow));
          setSelectedBucketId(reconciledWorkflow.buckets[0]?.id ?? "");
          setSelectedLifecycleHookId(reconciledWorkflow.hooks[0]?.id ?? null);
          setWorkflowMessage(result.errors.map((error) => error.message).join(" "));
          return;
        }

        setWorkflowMessage(result.errors.map((error) => error.message).join(" "));
        return;
      }

      if (nextWorkflow.embeddedStateMachineDefinition) {
        setDefinition(nextWorkflow.embeddedStateMachineDefinition);
        setSelectedState(nextWorkflow.embeddedStateMachineDefinition.states[0] ?? "");
      }

      setWorkflow(removeEmbeddedStateMachine(reconciledWorkflow));
      setSelectedBucketId(reconciledWorkflow.buckets[0]?.id ?? "");
      setWorkflowMessage(formatWorkflowSyncMessage(reconciliation.summary));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to parse the selected file.";
      setWorkflowMessage(`Invalid JSON. Choose a valid workflow or state-machine .json file. ${detail}`);
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
        <div className="header-controls">
          <nav className="page-tabs" aria-label="Editor pages">
            <button
              type="button"
              className={activePage === "state-machine" ? "page-tab active" : "page-tab"}
              aria-current={activePage === "state-machine" ? "page" : undefined}
              onClick={() => setActivePage("state-machine")}
            >
              State Machine
            </button>
            <button
              type="button"
              className={activePage === "workflow" ? "page-tab active" : "page-tab"}
              aria-current={activePage === "workflow" ? "page" : undefined}
              onClick={() => setActivePage("workflow")}
            >
              Workflow
            </button>
            <button
              type="button"
              className={activePage === "library" ? "page-tab active" : "page-tab"}
              aria-current={activePage === "library" ? "page" : undefined}
              onClick={() => setActivePage("library")}
            >
              Library
            </button>
            <button
              type="button"
              className={activePage === "settings" ? "page-tab active" : "page-tab"}
              aria-current={activePage === "settings" ? "page" : undefined}
              onClick={() => setActivePage("settings")}
            >
              Settings
            </button>
          </nav>
          <div className="page-actions">
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
            <ActionMenu
              label="Actions"
              items={[
                { label: "Import State Machine", onSelect: () => stateMachineFileInputRef.current?.click() },
                { label: "Import Workflow", onSelect: () => workflowFileInputRef.current?.click() },
                { label: "Save State Machine", onSelect: saveCurrentStateMachineToLibrary, disabled: !validation.valid },
                { label: "Save Workflow", onSelect: saveCurrentWorkflowToLibrary, disabled: !workflowValidation.valid },
                {
                  label: "Save State Machine and Workflow",
                  onSelect: saveCurrentStateMachineAndWorkflowToLibrary,
                  disabled: !validation.valid || !workflowValidation.valid,
                },
                { label: "Reset Workflow", onSelect: resetWorkflow, danger: true },
                { label: "Export State Machine", onSelect: exportStateMachineDefinition, disabled: !validation.valid },
                { label: "Export Workflow", onSelect: () => exportWorkflowDefinition(false), disabled: !workflowValidation.valid },
                {
                  label: "Export Bundled Workflow",
                  onSelect: () => exportWorkflowDefinition(true),
                  disabled: !workflowValidation.valid,
                },
              ]}
            />
          </div>
        </div>
      </header>

      {activePage === "settings" ? (
        <SettingsPage logoUrl={settings.logoUrl} onLogoUrlChange={updateLogoUrl} />
      ) : null}

      {activePage === "library" ? (
        <LibraryPage
          currentStateMachineKey={currentStateMachineKey}
          currentWorkflowKey={currentWorkflowKey}
          isReady={isLibraryReady}
          message={libraryMessage}
          stateMachineRecords={stateMachineRecords}
          workflowRecords={workflowRecords}
          selectedStateMachine={selectedLibraryStateMachine}
          selectedWorkflows={selectedLibraryWorkflows}
          onSelectStateMachine={setSelectedLibraryStateMachineKey}
          onSaveStateMachine={saveCurrentStateMachineToLibrary}
          onSaveWorkflow={saveCurrentWorkflowToLibrary}
          onLoadStateMachine={loadStateMachineFromLibrary}
          onLoadWorkflow={loadWorkflowFromLibrary}
          onDuplicateStateMachine={duplicateStateMachineVersionFromLibrary}
          onDuplicateWorkflow={duplicateWorkflowVersionFromLibrary}
          onDeleteStateMachine={deleteStateMachineFromLibrary}
          onDeleteWorkflow={deleteWorkflowFromLibrary}
        />
      ) : null}

      {activePage === "state-machine" ? (
        <>
          <section className="fixed-control-grid state-machine-control-grid">
            <section className="panel machine-panel">
              <div className="metadata-field">
                <label htmlFor="app-name">Target App</label>
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

            <JsonImportDropZone
              title="State Machine JSON"
              detail="Drop or choose a .json file"
              titleId="state-machine-import-title"
              detailId="state-machine-import-detail"
              onChooseFile={() => stateMachineFileInputRef.current?.click()}
              onImportFile={importStateMachineFile}
            />

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
              <div className="panel-heading preview-heading">
                <h2>Preview</h2>
                <div className="preview-heading-actions">
                  <DiagramDirectionToggle
                    diagramDirection={settings.diagramDirection}
                    onDiagramDirectionChange={updateDiagramDirection}
                  />
                  <span className="schema-version">schema v{definition.schemaVersion}</span>
                </div>
              </div>
              <div className="column-scroll graph-scroll">
                {machine ? (
                  <MermaidGraph
                    machine={machine.definition}
                    theme={settings.theme}
                    diagramDirection={settings.diagramDirection}
                  />
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
          <section className="fixed-control-grid workflow-control-grid">
            <section className="panel machine-panel workflow-metadata-panel">
              <div className="metadata-field">
                <label htmlFor="workflow-app-name">Target App</label>
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

            <JsonImportDropZone
              title="Workflow JSON"
              detail="Drop linked, bundled, or state-machine .json"
              titleId="workflow-import-title"
              detailId="workflow-import-detail"
              onChooseFile={() => workflowFileInputRef.current?.click()}
              onImportFile={importWorkflowFile}
            />

            <section className="panel status-panel compact-status-panel" aria-live="polite">
              <div className="panel-heading">
                <h2>Workflow Validation</h2>
                <span className={workflowValidation.valid ? "status ok" : "status error"}>
                  {workflowValidation.valid
                    ? "Valid"
                    : `${workflowIssueCount} issue${workflowIssueCount === 1 ? "" : "s"}`}
                </span>
              </div>
              {workflowMessage ? <p className="export-message">{workflowMessage}</p> : null}
              <div className="validation-summary">
                <p className={workflowValidation.valid ? "valid-message" : "error-message"}>
                  {workflowValidation.valid
                    ? "Ready to export linked or bundled workflow JSON."
                    : "Workflow export is blocked until the validation issues are fixed."}
                </p>
                {!workflowValidation.valid ? (
                  <button
                    type="button"
                    className="secondary compact"
                    onClick={() => setWorkflowValidationDialogOpen(true)}
                    aria-haspopup="dialog"
                  >
                    View Issues
                  </button>
                ) : null}
              </div>
            </section>
          </section>

          {!workflowValidation.valid && isWorkflowValidationDialogOpen ? (
            <WorkflowValidationDialog
              issueCount={workflowIssueCount}
              errors={workflowValidation.errors}
              onClose={() => setWorkflowValidationDialogOpen(false)}
            />
          ) : null}

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
              <button
                type="button"
                className={selectedWorkflowView === "lifecycle" ? "active" : ""}
                onClick={() => setSelectedWorkflowView("lifecycle")}
              >
                Lifecycle
              </button>
            </section>

            <section
              className={
                selectedWorkflowView === "actions"
                  ? "workspace-grid workflow-grid workflow-actions-grid"
                  : selectedWorkflowView === "buckets"
                    ? "workspace-grid workflow-grid workflow-buckets-grid"
                    : "workspace-grid workflow-grid workflow-lifecycle-grid"
              }
              aria-label="Workflow editor"
            >
              {selectedWorkflowView === "actions" ? (
                <section className="panel column-panel workflow-actions-panel">
                  <div className="workflow-action-toolbar">
                    <div className="workflow-action-toolbar-row">
                      <h2>Actions</h2>
                      <div className="workflow-action-button-group">
                        <button
                          type="button"
                          className="secondary compact"
                          onClick={addAllWorkflowActions}
                          disabled={!validation.valid || definition.transitions.length === 0}
                        >
                          Add All Actions
                        </button>
                        <button
                          type="button"
                          className="secondary compact"
                          onClick={addWorkflowAction}
                          disabled={!selectedState || selectedStateIsTerminal || !selectedStateHasWorkflowTargets}
                        >
                          Add Action
                        </button>
                      </div>
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
                      <span className="workflow-action-header-spacer" />
                      <span className="workflow-action-header-id">Action ID</span>
                      <span className="workflow-action-header-label">Button Label</span>
                      <span className="workflow-action-header-from">From State</span>
                      <span className="workflow-action-header-to">To State</span>
                      <span className="workflow-action-header-trigger">Trigger</span>
                      <span className="workflow-action-header-visible">Visible</span>
                      <span className="workflow-action-header-lifecycle">Lifecycle</span>
                      <span className="workflow-action-header-action">Action</span>
                    </div>
                  </div>
                  <div className="column-scroll">
                    <WorkflowActionList
                      actions={workflowActions}
                      hooks={workflowHooks}
                      selectedState={selectedState}
                      states={stateOptions}
                      onChange={updateWorkflowAction}
                      onTriggerChange={updateWorkflowActionTrigger}
                      onVisibleChange={updateWorkflowActionVisible}
                      onSelectLifecycleHook={selectLifecycleHookForAction}
                      onRemove={removeWorkflowAction}
                      onReorder={moveWorkflowAction}
                    />
                  </div>
                </section>
              ) : selectedWorkflowView === "buckets" ? (
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
                        onToggleVisible={toggleWorkflowBucketVisible}
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
                        stateVisibility={workflowStateVisibility}
                        showDraftRow={draftStateBucketId === selectedBucket?.id}
                        onToggleStateVisible={toggleWorkflowStateVisible}
                        onSelectState={selectStateForBucket}
                        onCancelDraft={cancelStateMappingRow}
                        onRemoveState={removeStateFromSelectedBucket}
                      />
                    </div>
                  </section>
                </>
              ) : (
                <>
                  <section className="panel column-panel workflow-lifecycle-list-panel">
                    <WorkflowLifecycleList
                      hooks={workflowHooks}
                      actions={linkedWorkflow.actions}
                      states={stateOptions}
                      terminalStates={definition.terminalStates}
                      selectedHookId={selectedLifecycleHook?.id ?? ""}
                      onAdd={addLifecycleHook}
                      onSelect={setSelectedLifecycleHookId}
                    />
                  </section>

                  <section className="panel column-panel workflow-lifecycle-editor-panel">
                    <WorkflowLifecycleEditor
                      hook={selectedLifecycleHook}
                      hooks={workflowHooks}
                      actions={linkedWorkflow.actions}
                      states={stateOptions}
                      terminalStates={definition.terminalStates}
                      onTargetChange={updateLifecycleHookTarget}
                      onHandlerChange={updateLifecycleHookHandler}
                      onScheduleTriggerChange={updateLifecycleHookScheduleTrigger}
                      onScheduleDurationChange={updateLifecycleHookScheduleDuration}
                      onRetryPolicyChange={updateLifecycleHookRetryPolicy}
                      onRemove={removeLifecycleHook}
                    />
                  </section>
                </>
              )}

              <section className="panel column-panel graph-panel workflow-preview-panel">
                <div className="panel-heading preview-heading">
                  <h2>Workflow Preview</h2>
                  <div className="preview-heading-actions">
                    <DiagramDirectionToggle
                      diagramDirection={settings.diagramDirection}
                      onDiagramDirectionChange={updateDiagramDirection}
                    />
                    <span className="schema-version">schema v{linkedWorkflow.schemaVersion}</span>
                  </div>
                </div>
                <div className="column-scroll graph-scroll">
                  {definedWorkflow ? (
                    <MermaidGraph
                      machine={definedWorkflow.stateMachine.definition}
                      workflow={definedWorkflow.definition}
                      workflowFocusStateIds={
                        selectedWorkflowView === "buckets" && selectedBucket ? selectedBucketStates : undefined
                      }
                      theme={settings.theme}
                      diagramDirection={settings.diagramDirection}
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

function LibraryPage({
  currentStateMachineKey,
  currentWorkflowKey,
  isReady,
  message,
  stateMachineRecords,
  workflowRecords,
  selectedStateMachine,
  selectedWorkflows,
  onSelectStateMachine,
  onSaveStateMachine,
  onSaveWorkflow,
  onLoadStateMachine,
  onLoadWorkflow,
  onDuplicateStateMachine,
  onDuplicateWorkflow,
  onDeleteStateMachine,
  onDeleteWorkflow,
}: {
  currentStateMachineKey: string;
  currentWorkflowKey: string;
  isReady: boolean;
  message: string | null;
  stateMachineRecords: PersistedStateMachineDefinition[];
  workflowRecords: PersistedWorkflowDefinition[];
  selectedStateMachine: PersistedStateMachineDefinition | null;
  selectedWorkflows: PersistedWorkflowDefinition[];
  onSelectStateMachine: (key: string) => void;
  onSaveStateMachine: () => void;
  onSaveWorkflow: () => void;
  onLoadStateMachine: (key: string) => void;
  onLoadWorkflow: (key: string) => void;
  onDuplicateStateMachine: (key: string) => void;
  onDuplicateWorkflow: (key: string) => void;
  onDeleteStateMachine: (key: string) => void;
  onDeleteWorkflow: (key: string) => void;
}) {
  const selectedWorkflowCount = selectedWorkflows.length;

  return (
    <section className="library-region" aria-label="Definition library">
      <section className="panel library-summary-panel">
        <div className="panel-heading">
          <div>
            <h2>Library</h2>
            <p className="panel-subtitle">
              {stateMachineRecords.length} state machine{stateMachineRecords.length === 1 ? "" : "s"} ·{" "}
              {workflowRecords.length} workflow{workflowRecords.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="library-actions">
            <button type="button" className="secondary" onClick={onSaveStateMachine}>
              Save State Machine
            </button>
            <button type="button" className="secondary" onClick={onSaveWorkflow}>
              Save Workflow
            </button>
          </div>
        </div>
        <dl className="library-current-keys">
          <div>
            <dt>Current state machine</dt>
            <dd>{currentStateMachineKey}</dd>
          </div>
          <div>
            <dt>Current workflow</dt>
            <dd>{currentWorkflowKey}</dd>
          </div>
        </dl>
        {message ? <p className="export-message">{message}</p> : null}
        {!isReady ? <p className="valid-message">Opening local definition library.</p> : null}
      </section>

      <section className="workspace-grid library-grid">
        <section className="panel column-panel">
          <div className="panel-heading">
            <h2>State Machines</h2>
            <span className="schema-version">{stateMachineRecords.length}</span>
          </div>
          <div className="column-scroll">
            {stateMachineRecords.length === 0 ? (
              <div className="empty-column">No saved state machines.</div>
            ) : (
              <div className="library-record-list" role="list" aria-label="Saved state machines">
                {stateMachineRecords.map((record) => {
                  const workflowCount = workflowRecords.filter((workflowRecord) => workflowRecord.stateMachineKey === record.key).length;
                  const selected = selectedStateMachine?.key === record.key;

                  return (
                    <div
                      key={record.key}
                      className={selected ? "library-record-row selected" : "library-record-row"}
                      role="listitem"
                    >
                      <button
                        type="button"
                        className="library-record-main"
                        onClick={() => onSelectStateMachine(record.key)}
                        aria-pressed={selected}
                      >
                        <span className="library-record-title">{record.definition.id}</span>
                        <span className="library-record-version">{record.definition.definitionVersion}</span>
                        <span className="library-record-summary">
                          {workflowCount} workflow{workflowCount === 1 ? "" : "s"}
                        </span>
                        <span className="library-record-saved-at" title={record.savedAt}>
                          Saved {formatLibrarySavedAt(record.savedAt)}
                        </span>
                      </button>
                      <div className="library-row-actions">
                        <button type="button" className="secondary compact" onClick={() => onLoadStateMachine(record.key)}>
                          Load
                        </button>
                        <button type="button" className="secondary compact" onClick={() => onDuplicateStateMachine(record.key)}>
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className="secondary compact danger"
                          onClick={() => onDeleteStateMachine(record.key)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="panel column-panel">
          <div className="panel-heading">
            <div>
              <h2>Workflows</h2>
              <p className="panel-subtitle">{selectedStateMachine?.key ?? "No state machine selected"}</p>
            </div>
            <span className="schema-version">{selectedWorkflowCount}</span>
          </div>
          <div className="column-scroll">
            {!selectedStateMachine ? (
              <div className="empty-column">No state machine selected.</div>
            ) : selectedWorkflows.length === 0 ? (
              <div className="empty-column">No saved workflows.</div>
            ) : (
              <div className="library-record-list" role="list" aria-label="Saved workflows">
                {selectedWorkflows.map((record) => (
                  <div key={record.key} className="library-record-row" role="listitem">
                    <div className="library-record-main static">
                      <span className="library-record-title">{record.definition.id}</span>
                      <span className="library-record-version">{record.definition.workflowVersion}</span>
                      <span className="library-record-summary">
                        {record.definition.actions.length} action{record.definition.actions.length === 1 ? "" : "s"} ·{" "}
                        {record.definition.buckets.length} bucket{record.definition.buckets.length === 1 ? "" : "s"} ·{" "}
                        {record.definition.hooks.length} hook{record.definition.hooks.length === 1 ? "" : "s"}
                      </span>
                      <span className="library-record-saved-at" title={record.savedAt}>
                        Saved {formatLibrarySavedAt(record.savedAt)}
                      </span>
                    </div>
                    <div className="library-row-actions">
                      <button type="button" className="secondary compact" onClick={() => onLoadWorkflow(record.key)}>
                        Load
                      </button>
                      <button type="button" className="secondary compact" onClick={() => onDuplicateWorkflow(record.key)}>
                        Duplicate
                      </button>
                      <button type="button" className="secondary compact danger" onClick={() => onDeleteWorkflow(record.key)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
    </section>
  );
}

function formatLibrarySavedAt(savedAt: string) {
  const savedDate = new Date(savedAt);

  if (Number.isNaN(savedDate.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(savedDate);
}

function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnPointerDown(event: globalThis.MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnPointerDown);

    return () => document.removeEventListener("mousedown", closeOnPointerDown);
  }, [isOpen]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  }

  function selectItem(item: ActionMenuItem) {
    if (item.disabled) {
      return;
    }

    setIsOpen(false);
    void item.onSelect();
  }

  return (
    <div className="action-menu" ref={menuRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="action-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {label}
        <span aria-hidden="true">▾</span>
      </button>
      {isOpen ? (
        <div className="action-menu-list" role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.danger ? "danger" : undefined}
              disabled={item.disabled}
              onClick={() => selectItem(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
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
      aria-label="Choose app folder"
      title="Choose app folder"
    >
      <span className="folder-icon" aria-hidden="true" />
    </button>
  );
}

function WorkflowValidationDialog({
  issueCount,
  errors,
  onClose,
}: {
  issueCount: number;
  errors: WorkflowValidationError[];
  onClose: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", closeOnEscape);

    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="panel validation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-validation-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-heading dialog-heading">
          <div>
            <h2 id="workflow-validation-dialog-title">Workflow Validation Issues</h2>
            <p className="panel-subtitle">
              {issueCount} issue{issueCount === 1 ? "" : "s"} blocking workflow export
            </p>
          </div>
          <button
            type="button"
            className="ghost compact"
            onClick={onClose}
            aria-label="Close workflow validation issues"
          >
            Close
          </button>
        </div>
        <div className="dialog-scroll">
          <ul className="error-list">
            {errors.map((error, index) => (
              <li key={`${error.code}-${error.path}-${index}`}>
                <strong>{error.path}</strong> {error.message}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
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

function DiagramDirectionToggle({
  diagramDirection,
  onDiagramDirectionChange,
}: {
  diagramDirection: DiagramDirection;
  onDiagramDirectionChange: (diagramDirection: DiagramDirection) => void;
}) {
  return (
    <div className="diagram-direction-toggle" role="group" aria-label="Diagram direction">
      <button
        type="button"
        className={diagramDirection === "vertical" ? "active" : ""}
        aria-pressed={diagramDirection === "vertical"}
        onClick={() => onDiagramDirectionChange("vertical")}
      >
        Vertical
      </button>
      <button
        type="button"
        className={diagramDirection === "horizontal" ? "active" : ""}
        aria-pressed={diagramDirection === "horizontal"}
        onClick={() => onDiagramDirectionChange("horizontal")}
      >
        Horizontal
      </button>
    </div>
  );
}

function JsonImportDropZone({
  title,
  detail,
  titleId,
  detailId,
  onChooseFile,
  onImportFile,
}: {
  title: string;
  detail: string;
  titleId: string;
  detailId: string;
  onChooseFile: () => void;
  onImportFile: (file: File) => Promise<void>;
}) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  function showFileDrop(event: DragEvent<HTMLButtonElement>) {
    if (!hasExternalFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFile(true);
  }

  function hideFileDrop() {
    setIsDraggingFile(false);
  }

  async function dropFile(event: DragEvent<HTMLButtonElement>) {
    if (!hasExternalFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    setIsDraggingFile(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      await onImportFile(file);
    }
  }

  return (
    <section className="panel import-panel" aria-labelledby={titleId}>
      <button
        type="button"
        className={isDraggingFile ? "import-drop-zone dragging-file" : "import-drop-zone"}
        onClick={onChooseFile}
        onDragEnter={showFileDrop}
        onDragOver={showFileDrop}
        onDragLeave={hideFileDrop}
        onDrop={dropFile}
        aria-describedby={detailId}
      >
        <span id={titleId} className="import-drop-zone-title">
          {title}
        </span>
        <span id={detailId} className="import-drop-zone-detail">
          {detail}
        </span>
      </button>
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

  function selectFromRowBackground(event: MouseEvent<HTMLElement>, state: string) {
    if (event.target === event.currentTarget) {
      onSelect(state);
    }
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
            onClick={(event) => selectFromRowBackground(event, state)}
            onDragOver={(event) => showDropTarget(event, index)}
            onDragEnter={(event) => showDropTarget(event, index)}
            onDrop={(event) => dropState(event, index)}
          >
            <button
              type="button"
              className="state-drag-handle"
              draggable
              onClick={() => onSelect(state)}
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
            <input
              aria-label={`State ${index + 1} ID`}
              value={state}
              onClick={() => onSelect(state)}
              onFocus={() => onSelect(state)}
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

function WorkflowLifecycleList({
  hooks,
  actions,
  states,
  terminalStates,
  selectedHookId,
  onAdd,
  onSelect,
}: {
  hooks: WorkflowLifecycleHookWithIndex[];
  actions: readonly WorkflowAction<string>[];
  states: readonly string[];
  terminalStates: readonly string[];
  selectedHookId: string;
  onAdd: (phase: WorkflowLifecyclePhase, targetId: string) => void;
  onSelect: (hookId: string) => void;
}) {
  const [draftTargets, setDraftTargets] = useState<Partial<Record<WorkflowLifecyclePhase, string>>>({});

  return (
    <>
      <div className="panel-heading">
        <h2>Lifecycle Hooks</h2>
        <span className="schema-version">{hooks.length}</span>
      </div>
      <div className="column-scroll lifecycle-scroll">
        {lifecyclePhases.map((phase) => {
          const phaseHooks = hooks.filter((hook) => hook.phase === phase);
          const availableTargets = getAvailableLifecycleTargetOptions(phase, hooks, actions, states, terminalStates);
          const draftTarget = draftTargets[phase] ?? availableTargets[0]?.id ?? "";

          return (
            <section key={phase} className="lifecycle-phase-section">
              <div className="lifecycle-phase-heading">
                <div>
                  <h3>
                    {lifecyclePhaseLabels[phase]}
                    <span>{phaseHooks.length}</span>
                  </h3>
                </div>
                <div className="lifecycle-add-control">
                  <select
                    aria-label={`${lifecyclePhaseLabels[phase]} target`}
                    value={draftTarget}
                    onChange={(event) =>
                      setDraftTargets((current) => ({ ...current, [phase]: event.target.value }))
                    }
                    disabled={availableTargets.length === 0}
                  >
                    {availableTargets.length === 0 ? (
                      <option value="">No targets</option>
                    ) : (
                      availableTargets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.label}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    className="secondary compact"
                    onClick={() => onAdd(phase, draftTarget)}
                    disabled={!draftTarget}
                  >
                    Add Hook
                  </button>
                </div>
              </div>
              {phaseHooks.length > 0 ? (
                <div className="lifecycle-hook-list" role="list" aria-label={`${lifecyclePhaseLabels[phase]} hooks`}>
                  {phaseHooks.map((hook) => {
                    const hasIssue = isLifecycleHookInvalid(hook, hooks, actions, states, terminalStates);
                    const targetLabel = formatLifecycleTargetLabel(hook, actions);
                    const handlerLabel = hook.handlerKey || "No main handler";

                    return (
                      <button
                        key={hook.id}
                        type="button"
                        className={hook.id === selectedHookId ? "lifecycle-hook-row selected" : "lifecycle-hook-row"}
                        onClick={() => onSelect(hook.id)}
                        title={`${targetLabel}: ${handlerLabel}`}
                      >
                        <span className="lifecycle-hook-target">{targetLabel}</span>
                        <span className="lifecycle-hook-handler">{handlerLabel}</span>
                        <span className={hasIssue ? "status error" : "status ok"}>{hasIssue ? "Issue" : "Valid"}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
}

function WorkflowLifecycleEditor({
  hook,
  hooks,
  actions,
  states,
  terminalStates,
  onTargetChange,
  onHandlerChange,
  onScheduleTriggerChange,
  onScheduleDurationChange,
  onRetryPolicyChange,
  onRemove,
}: {
  hook: WorkflowLifecycleHookWithIndex | null;
  hooks: WorkflowLifecycleHookWithIndex[];
  actions: readonly WorkflowAction<string>[];
  states: readonly string[];
  terminalStates: readonly string[];
  onTargetChange: (index: number, targetId: string) => void;
  onHandlerChange: (
    index: number,
    field: "handlerKey" | "onSuccess" | "onFailure",
    handlerKey: string,
  ) => void;
  onScheduleTriggerChange: (index: number, trigger: WorkflowLifecycleHookSchedule["trigger"]) => void;
  onScheduleDurationChange: (index: number, amount: string, unit: ScheduleUnit) => void;
  onRetryPolicyChange: (index: number, field: keyof WorkflowLifecycleHookRetryPolicy, value: string) => void;
  onRemove: (index: number) => void;
}) {
  if (!hook) {
    return (
      <>
        <div className="panel-heading">
          <h2>Hook Details</h2>
        </div>
        <div className="column-scroll">
          <div className="empty-column">Select or add a lifecycle hook.</div>
        </div>
      </>
    );
  }

  const targetOptions = getAvailableLifecycleTargetOptions(
    hook.phase,
    hooks,
    actions,
    states,
    terminalStates,
    hook,
  );
  const scheduleTrigger = getLifecycleScheduleTrigger(hook.schedule);
  const scheduleDurationMs = getLifecycleScheduleDurationMs(hook.schedule);
  const scheduleUnit = getPreferredScheduleUnit(scheduleDurationMs);
  const scheduleDurationAmount =
    scheduleDurationMs === undefined ? "" : String(scheduleDurationMs / getScheduleUnitFactorMs(scheduleUnit));
  const showRetryControls = hook.phase === "while_in_state" || Boolean(hook.retryPolicy);

  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Hook Details</h2>
          <p className="panel-subtitle">{hook.id}</p>
        </div>
        <button type="button" className="ghost compact danger" onClick={() => onRemove(hook.index)}>
          Remove
        </button>
      </div>
      <div className="column-scroll">
        <div className="lifecycle-editor-form">
          <label htmlFor="lifecycle-phase">Phase</label>
          <input id="lifecycle-phase" value={lifecyclePhaseLabels[hook.phase]} readOnly />

          <label htmlFor="lifecycle-target">Target</label>
          <select
            id="lifecycle-target"
            value={hook.targetId}
            onChange={(event) => onTargetChange(hook.index, event.target.value)}
          >
            {targetOptions.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>

          <label htmlFor="lifecycle-main-handler">Main Handler Key</label>
          <input
            id="lifecycle-main-handler"
            value={hook.handlerKey ?? ""}
            onChange={(event) => onHandlerChange(hook.index, "handlerKey", event.target.value)}
            placeholder="optional_handler"
            spellCheck={false}
          />

          {hook.phase === "while_in_state" ? (
            <>
              <label htmlFor="lifecycle-schedule-trigger">Schedule Trigger</label>
              <select
                id="lifecycle-schedule-trigger"
                value={scheduleTrigger ?? ""}
                onChange={(event) =>
                  onScheduleTriggerChange(
                    hook.index,
                    event.target.value as WorkflowLifecycleHookSchedule["trigger"],
                  )
                }
              >
                {scheduleTrigger ? null : (
                  <option value="" disabled>
                    Unsupported trigger
                  </option>
                )}
                <option value="every_interval">Every Interval</option>
                <option value="after_duration">After Duration</option>
              </select>

              <label htmlFor="lifecycle-schedule-duration">Schedule Duration</label>
              <div className="duration-control">
                <input
                  id="lifecycle-schedule-duration"
                  type="number"
                  min="0"
                  step="any"
                  value={scheduleDurationAmount}
                  onChange={(event) => onScheduleDurationChange(hook.index, event.target.value, scheduleUnit)}
                />
                <select
                  aria-label="Schedule Duration Unit"
                  value={scheduleUnit}
                  onChange={(event) =>
                    onScheduleDurationChange(hook.index, scheduleDurationAmount, event.target.value as ScheduleUnit)
                  }
                >
                  {scheduleUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          <label htmlFor="lifecycle-success-handler">Success Handler Key</label>
          <input
            id="lifecycle-success-handler"
            value={hook.onSuccess?.handlerKey ?? ""}
            onChange={(event) => onHandlerChange(hook.index, "onSuccess", event.target.value)}
            placeholder="success_handler"
            spellCheck={false}
          />

          <label htmlFor="lifecycle-failure-handler">Failure Handler Key</label>
          <input
            id="lifecycle-failure-handler"
            value={hook.onFailure?.handlerKey ?? ""}
            onChange={(event) => onHandlerChange(hook.index, "onFailure", event.target.value)}
            placeholder="failure_handler"
            spellCheck={false}
          />

          {showRetryControls ? (
            <>
              <label htmlFor="lifecycle-retry-attempts">Retry Max Attempts</label>
              <input
                id="lifecycle-retry-attempts"
                type="number"
                min="1"
                step="1"
                value={hook.retryPolicy?.maxAttempts ?? ""}
                onChange={(event) => onRetryPolicyChange(hook.index, "maxAttempts", event.target.value)}
                placeholder="empty"
              />

              <label htmlFor="lifecycle-retry-delay">Retry Delay Ms</label>
              <input
                id="lifecycle-retry-delay"
                type="number"
                min="0"
                step="1"
                value={hook.retryPolicy?.delayMs ?? ""}
                onChange={(event) => onRetryPolicyChange(hook.index, "delayMs", event.target.value)}
                placeholder="empty"
              />
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

function WorkflowActionList({
  actions,
  hooks,
  selectedState,
  states,
  onChange,
  onTriggerChange,
  onVisibleChange,
  onSelectLifecycleHook,
  onRemove,
  onReorder,
}: {
  actions: WorkflowActionWithIndex[];
  hooks: WorkflowLifecycleHookWithIndex[];
  selectedState: string;
  states: string[];
  onChange: (index: number, field: "id" | "label" | "from" | "to", value: string) => void;
  onTriggerChange: (index: number, trigger: WorkflowActionTrigger) => void;
  onVisibleChange: (index: number, visible: boolean) => void;
  onSelectLifecycleHook: (actionId: string) => void;
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
        const lifecycleHook = hooks.find(
          (hook) =>
            hook.phase === "before_transition" &&
            hook.targetType === "action" &&
            hook.targetId === action.id,
        );
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
              className="workflow-action-id-input"
              aria-label={`Action ${action.index + 1} ID`}
              value={action.id}
              onChange={(event) => onChange(action.index, "id", event.target.value)}
              spellCheck={false}
            />
            <input
              className="workflow-action-label-input"
              aria-label={`Action ${action.index + 1} label`}
              value={action.label}
              onChange={(event) => onChange(action.index, "label", event.target.value)}
              spellCheck={false}
            />
            <StateSelect
              className="workflow-action-source-select"
              label={`Action ${action.index + 1} source`}
              value={action.from}
              states={states}
              onChange={(value) => onChange(action.index, "from", value)}
            />
            <StateSelect
              className="workflow-action-target-select"
              label={`Action ${action.index + 1} target`}
              value={action.to}
              states={states}
              onChange={(value) => onChange(action.index, "to", value)}
            />
            <select
              className="workflow-action-trigger-select"
              aria-label={`Action ${action.index + 1} trigger`}
              value={action.trigger}
              onChange={(event) => onTriggerChange(action.index, event.target.value as WorkflowActionTrigger)}
            >
              <option value="user">User</option>
              <option value="automatic">Automatic</option>
            </select>
            <label className="inline-check action-visible-check">
              <input
                type="checkbox"
                aria-label={`Action ${action.index + 1} visible`}
                checked={action.visible}
                onChange={(event) => onVisibleChange(action.index, event.target.checked)}
              />
              Visible
            </label>
            <div className="workflow-action-lifecycle-indicator">
              {lifecycleHook ? (
                <>
                  <span className="lifecycle-badge">Before transition</span>
                  <button
                    type="button"
                    className="ghost compact"
                    onClick={() => onSelectLifecycleHook(action.id)}
                  >
                    Edit
                  </button>
                </>
              ) : (
                <span className="lifecycle-empty">None</span>
              )}
            </div>
            <button type="button" className="ghost compact workflow-action-remove" onClick={() => onRemove(action.index)}>
              Remove
            </button>
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
  onToggleVisible,
  onRemove,
  onReorder,
}: {
  buckets: WorkflowBucketWithIndex[];
  selectedBucketId: string;
  onSelect: (bucketId: string) => void;
  onRename: (index: number, label: string) => void;
  onToggleVisible: (index: number, visible: boolean) => void;
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
            <label className="inline-check">
              <input
                type="checkbox"
                aria-label={`Bucket ${bucket.index + 1} visible`}
                checked={bucket.visible}
                onChange={(event) => onToggleVisible(bucket.index, event.target.checked)}
                onClick={(event) => event.stopPropagation()}
              />
              Visible
            </label>
            <button
              type="button"
              className="ghost compact"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(bucket.index);
              }}
              title="Remove bucket"
            >
              Remove
            </button>
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
  stateVisibility,
  showDraftRow,
  onToggleStateVisible,
  onSelectState,
  onCancelDraft,
  onRemoveState,
}: {
  states: string[];
  selectedBucket?: WorkflowBucketWithIndex;
  selectedBucketStates: readonly string[];
  stateVisibility: Map<string, boolean>;
  showDraftRow: boolean;
  onToggleStateVisible: (state: string, visible: boolean) => void;
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
          <label className="inline-check">
            <input
              type="checkbox"
              aria-label={`${state} visible`}
              checked={stateVisibility.get(state) ?? true}
              onChange={(event) => onToggleStateVisible(state, event.target.checked)}
            />
            Visible
          </label>
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
  className,
  label,
  value,
  states,
  onChange,
}: {
  id?: string;
  className?: string;
  label: string;
  value: string;
  states: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select id={id} className={className} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
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
  workflowFocusStateIds,
  theme,
  diagramDirection,
}: {
  machine: EditableDefinition;
  workflow?: EditableWorkflowDefinition;
  workflowFocusStateIds?: readonly string[];
  theme: MermaidPreviewTheme;
  diagramDirection: DiagramDirection;
}) {
  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderId = useRef<string | null>(null);
  const diagram = useMemo(
    () =>
      workflow
        ? buildWorkflowMermaidDiagram(machine, workflow, theme, workflowFocusStateIds, diagramDirection)
        : buildMermaidDiagram(machine, theme, diagramDirection),
    [machine, workflow, theme, workflowFocusStateIds, diagramDirection],
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

function nextUniqueLifecycleHookId(
  phase: WorkflowLifecyclePhase,
  targetId: string,
  hooks: readonly WorkflowLifecycleHook<string>[],
) {
  const baseId = actionIdFromLabel(`${phase}_${targetId}`);
  const hookIds = hooks.map((hook) => hook.id);

  if (!hookIds.includes(baseId)) {
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}_${suffix}`;

  while (hookIds.includes(candidate)) {
    suffix += 1;
    candidate = `${baseId}_${suffix}`;
  }

  return candidate;
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

function createWorkflowActionsFromTransitions(
  transitions: EditableDefinition["transitions"],
): WorkflowAction<string>[] {
  return transitions.map((transition) => {
    return {
      id: transitionActionId(transition.from, transition.to),
      label: formatTransitionActionLabel(transition.from, transition.to),
      from: transition.from,
      to: transition.to,
      trigger: "user",
      visible: true,
    };
  });
}

function transitionActionId(from: string, to: string) {
  return `${actionIdFromLabel(from)}.to_${actionIdFromLabel(to)}`;
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

function formatTransitionActionLabel(from: string, to: string) {
  return `${titleCaseAction(actionIdFromLabel(from))} to ${titleCaseAction(actionIdFromLabel(to))}`;
}

function getLifecycleTargetType(phase: WorkflowLifecyclePhase) {
  return phase === "before_transition" ? "action" : "state";
}

function getLifecycleTargetOptions(
  phase: WorkflowLifecyclePhase,
  actions: readonly WorkflowAction<string>[],
  states: readonly string[],
  terminalStates: readonly string[],
) {
  if (phase === "before_transition") {
    return actions.map((action) => ({ id: action.id, label: formatActionDisplayLabel(action) }));
  }

  const targetStates = phase === "on_terminal_entry" ? terminalStates : states;

  return targetStates.map((state) => ({ id: state, label: state }));
}

function getAvailableLifecycleTargetOptions(
  phase: WorkflowLifecyclePhase,
  hooks: readonly WorkflowLifecycleHook<string>[],
  actions: readonly WorkflowAction<string>[],
  states: readonly string[],
  terminalStates: readonly string[],
  currentHook?: WorkflowLifecycleHook<string>,
) {
  const targetType = getLifecycleTargetType(phase);
  const occupiedTargets = new Set(
    hooks
      .filter((hook) => hook.phase === phase && hook.targetType === targetType && hook.id !== currentHook?.id)
      .map((hook) => hook.targetId),
  );

  return getLifecycleTargetOptions(phase, actions, states, terminalStates).filter(
    (target) => !occupiedTargets.has(target.id) || target.id === currentHook?.targetId,
  );
}

function formatLifecycleTargetLabel(hook: WorkflowLifecycleHook<string>, actions: readonly WorkflowAction<string>[]) {
  if (hook.targetType === "action") {
    const action = actions.find((candidate) => candidate.id === hook.targetId);

    return action ? formatActionDisplayLabel(action) : hook.targetId;
  }

  return hook.targetId;
}

function formatActionDisplayLabel(action: WorkflowAction<string>) {
  const label = action.label.trim() || action.id;

  return label === action.id ? action.id : `${label} (${action.id})`;
}

function isWorkflowIdentifier(value: string) {
  return /^[a-z][a-z0-9_]*$/.test(value);
}

function getLifecycleScheduleTrigger(
  schedule: WorkflowLifecycleHook<string>["schedule"],
): WorkflowLifecycleHookSchedule["trigger"] | undefined {
  const trigger = (schedule as Record<string, unknown> | undefined)?.trigger;

  return trigger === "after_duration" || trigger === "every_interval" ? trigger : undefined;
}

function getLifecycleScheduleDurationMs(schedule: WorkflowLifecycleHook<string>["schedule"]): number | undefined {
  const scheduleRecord = schedule as Record<string, unknown> | undefined;

  if (!scheduleRecord) {
    return undefined;
  }

  const duration =
    scheduleRecord.trigger === "after_duration" ? scheduleRecord.delayMs : scheduleRecord.intervalMs;

  return typeof duration === "number" ? duration : undefined;
}

function getPreferredScheduleUnit(durationMs: number | undefined): ScheduleUnit {
  if (durationMs === undefined) {
    return "minutes";
  }

  if (durationMs % (60 * 60 * 1000) === 0) {
    return "hours";
  }

  if (durationMs % (60 * 1000) === 0) {
    return "minutes";
  }

  return "seconds";
}

function getScheduleUnitFactorMs(unit: ScheduleUnit) {
  return scheduleUnits.find((candidate) => candidate.id === unit)?.factorMs ?? 60 * 1000;
}

function isLifecycleHookInvalid(
  hook: WorkflowLifecycleHook<string>,
  hooks: readonly WorkflowLifecycleHook<string>[],
  actions: readonly WorkflowAction<string>[],
  states: readonly string[],
  terminalStates: readonly string[],
) {
  const targetType = getLifecycleTargetType(hook.phase);
  const duplicateCount = hooks.filter(
    (candidate) =>
      candidate.phase === hook.phase &&
      candidate.targetType === hook.targetType &&
      candidate.targetId === hook.targetId,
  ).length;
  const validTarget =
    hook.phase === "before_transition"
      ? hook.targetType === "action" && actions.some((action) => action.id === hook.targetId)
      : hook.targetType === "state" &&
        states.includes(hook.targetId) &&
        (hook.phase !== "on_terminal_entry" || terminalStates.includes(hook.targetId));
  const scheduleTrigger = getLifecycleScheduleTrigger(hook.schedule);
  const scheduleDurationMs = getLifecycleScheduleDurationMs(hook.schedule);
  const hasValidSchedule =
    hook.phase === "while_in_state"
      ? Boolean(
          hook.schedule &&
            hook.handlerKey &&
            scheduleTrigger &&
            Number.isInteger(scheduleDurationMs) &&
            Number(scheduleDurationMs) > 0,
        )
      : !hook.schedule;
  const retryPolicy = hook.retryPolicy as Partial<WorkflowLifecycleHookRetryPolicy> | undefined;
  const hasValidRetryPolicy =
    hook.phase === "while_in_state"
      ? !retryPolicy ||
        (Number.isInteger(retryPolicy.maxAttempts) &&
          Number(retryPolicy.maxAttempts) > 0 &&
          Number.isInteger(retryPolicy.delayMs) &&
          Number(retryPolicy.delayMs) >= 0)
      : !retryPolicy;

  return (
    !isWorkflowIdentifier(hook.id) ||
    hook.targetType !== targetType ||
    !validTarget ||
    duplicateCount > 1 ||
    !hasValidSchedule ||
    !hasValidRetryPolicy ||
    Boolean(hook.handlerKey && !isWorkflowIdentifier(hook.handlerKey)) ||
    Boolean(hook.onSuccess?.handlerKey && !isWorkflowIdentifier(hook.onSuccess.handlerKey)) ||
    Boolean(hook.onFailure?.handlerKey && !isWorkflowIdentifier(hook.onFailure.handlerKey))
  );
}

function transitionKey(from: string, to: string) {
  return `${from}->${to}`;
}

function pluralize(label: string, count: number) {
  if (count !== 1 && label.endsWith("entry")) {
    return `${label.slice(0, -"entry".length)}entries`;
  }

  return count === 1 ? label : `${label}s`;
}

function toSentence(parts: readonly string[]) {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
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

function reconcileWorkflowToStateMachine(
  workflow: EditableWorkflowDefinition,
  stateMachine: EditableDefinition,
): { workflow: EditableWorkflowDefinition; summary: WorkflowReconciliationSummary; changed: boolean } {
  const stateSet = new Set(stateMachine.states);
  const transitionSet = new Set(stateMachine.transitions.map((transition) => transitionKey(transition.from, transition.to)));
  const currentStatesById = new Map(workflow.states.map((state) => [state.id, state]));
  const summary: WorkflowReconciliationSummary = {
    addedStateEntries: 0,
    removedStateEntries: 0,
    removedActions: 0,
    removedBucketStateAssignments: 0,
    removedHooks: 0,
  };

  const states = stateMachine.states.map((state) => {
    const existingState = currentStatesById.get(state);

    if (!existingState) {
      summary.addedStateEntries += 1;
    }

    return {
      id: state,
      visible: existingState?.visible ?? true,
    };
  });

  summary.removedStateEntries = workflow.states.filter((state) => !stateSet.has(state.id)).length;

  const actions = workflow.actions.filter((action) => {
    const isCurrentAction =
      stateSet.has(action.from) && stateSet.has(action.to) && transitionSet.has(transitionKey(action.from, action.to));

    if (!isCurrentAction) {
      summary.removedActions += 1;
    }

    return isCurrentAction;
  });
  const actionIds = new Set(actions.map((action) => action.id));

  const reconciledBuckets = workflow.buckets.map((bucket) => {
    const bucketStates: string[] = [];

    for (const state of bucket.states) {
      if (!stateSet.has(state)) {
        summary.removedBucketStateAssignments += 1;
        continue;
      }

      bucketStates.push(state);
    }

    return {
      ...bucket,
      states: bucketStates,
    };
  });

  const hooks = workflow.hooks.filter((hook) => {
    const isCurrentHook =
      hook.targetType === "action" ? actionIds.has(hook.targetId) : stateSet.has(hook.targetId);

    if (!isCurrentHook) {
      summary.removedHooks += 1;
    }

    return isCurrentHook;
  });

  const reconciledWorkflow = {
    ...workflow,
    stateMachine: {
      id: stateMachine.id,
      definitionVersion: stateMachine.definitionVersion,
    },
    states,
    actions,
    buckets: reconciledBuckets,
    hooks,
  };

  return {
    workflow: reconciledWorkflow,
    summary,
    changed: JSON.stringify(reconciledWorkflow) !== JSON.stringify(workflow),
  };
}

function resetWorkflowFromStateMachine(
  workflow: EditableWorkflowDefinition,
  stateMachine: EditableDefinition,
): EditableWorkflowDefinition {
  return {
    ...workflow,
    stateMachine: {
      id: stateMachine.id,
      definitionVersion: stateMachine.definitionVersion,
    },
    states: stateMachine.states.map((state) => ({ id: state, visible: true })),
    actions: [],
    buckets: createDefaultWorkflowBuckets(stateMachine.states),
    hooks: [],
  };
}

function formatWorkflowSyncMessage(summary: WorkflowReconciliationSummary) {
  const updates: string[] = [];

  if (summary.removedActions > 0) {
    updates.push(`removed ${summary.removedActions} stale ${pluralize("action", summary.removedActions)}`);
  }

  if (summary.removedStateEntries > 0) {
    updates.push(`removed ${summary.removedStateEntries} stale ${pluralize("state entry", summary.removedStateEntries)}`);
  }

  if (summary.addedStateEntries > 0) {
    updates.push(`added ${summary.addedStateEntries} ${pluralize("state entry", summary.addedStateEntries)}`);
  }

  if (summary.removedBucketStateAssignments > 0) {
    updates.push("updated bucket assignments");
  }

  if (summary.removedHooks > 0) {
    updates.push(`removed ${summary.removedHooks} stale ${pluralize("lifecycle hook", summary.removedHooks)}`);
  }

  if (updates.length === 0) {
    return null;
  }

  const updateSummary = toSentence(updates);

  return `Workflow synced to current state machine. ${updateSummary.charAt(0).toUpperCase()}${updateSummary.slice(1)}.`;
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

function isJsonFile(file: File) {
  return file.type.toLowerCase() === "application/json" || file.name.toLowerCase().endsWith(".json");
}

function hasExternalFiles(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes("Files") || dataTransfer.files.length > 0;
}

function isImportedStateMachineDefinition(value: unknown): value is Partial<EditableDefinition> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    !("workflowVersion" in record) &&
    !("actions" in record) &&
    !("buckets" in record) &&
    Array.isArray(record.states) &&
    Array.isArray(record.transitions)
  );
}

type ImportedWorkflowDefinition = Partial<Omit<EditableWorkflowDefinition, "schemaVersion" | "states" | "actions" | "buckets" | "hooks">> & {
  schemaVersion?: string;
  states?: unknown;
  actions?: unknown;
  buckets?: unknown;
  hooks?: unknown;
};

function normalizeImportedWorkflowDefinition(
  value: ImportedWorkflowDefinition,
  fallbackStateMachine: EditableDefinition,
): EditableWorkflowDefinition {
  const embeddedStateMachineDefinition = value.embeddedStateMachineDefinition
    ? normalizeImportedDefinition(value.embeddedStateMachineDefinition)
    : undefined;
  const effectiveStateMachine = embeddedStateMachineDefinition ?? fallbackStateMachine;
  const actions = normalizeImportedWorkflowActions(value.actions);
  const hooks = normalizeImportedWorkflowHooks(value.hooks, value.actions, actions);

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
    states: normalizeImportedWorkflowStates(value.states, effectiveStateMachine.states),
    actions,
    buckets: normalizeImportedWorkflowBuckets(value.buckets),
    hooks,
  };
}

function normalizeImportedWorkflowSchemaVersion(schemaVersion: string | undefined): typeof WORKFLOW_SCHEMA_VERSION {
  return (schemaVersion === "0.1.0" ||
    schemaVersion === "0.2.0" ||
    schemaVersion === "0.3.0" ||
    schemaVersion === "0.4.0" ||
    schemaVersion === "0.5.0" ||
    schemaVersion === "0.6.0"
    ? WORKFLOW_SCHEMA_VERSION
    : schemaVersion ?? WORKFLOW_SCHEMA_VERSION) as typeof WORKFLOW_SCHEMA_VERSION;
}

function canLoadWorkflowWithValidationIssues(errors: readonly WorkflowValidationError[]) {
  const loadableCodes = new Set<WorkflowValidationError["code"]>([
    "missing_lifecycle_schedule",
    "invalid_lifecycle_schedule_trigger",
    "invalid_lifecycle_schedule_duration",
    "lifecycle_schedule_on_unsupported_phase",
    "missing_scheduled_handler",
    "lifecycle_retry_on_unsupported_phase",
    "invalid_lifecycle_retry_policy",
  ]);

  return errors.length > 0 && errors.every((error) => loadableCodes.has(error.code));
}

function normalizeImportedWorkflowStates(value: unknown, states: readonly string[]) {
  if (!Array.isArray(value)) {
    return states.map((state) => ({ id: state, visible: true }));
  }

  return value.map((state, index) => {
    if (typeof state === "string") {
      return { id: state, visible: true };
    }

    const stateRecord = state && typeof state === "object" ? (state as Record<string, unknown>) : {};

    return {
      id: typeof stateRecord.id === "string" ? stateRecord.id : states[index] ?? "",
      visible: typeof stateRecord.visible === "boolean" ? stateRecord.visible : true,
    };
  });
}

function normalizeImportedWorkflowActions(value: unknown): WorkflowAction<string>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((action) => {
    const actionRecord = action && typeof action === "object" ? (action as Record<string, unknown>) : {};
    const trigger = actionRecord.trigger === "automatic" ? "automatic" : "user";

    return {
      id: typeof actionRecord.id === "string" ? actionRecord.id : "",
      label: typeof actionRecord.label === "string" ? actionRecord.label : "",
      from: typeof actionRecord.from === "string" ? actionRecord.from : "",
      to: typeof actionRecord.to === "string" ? actionRecord.to : "",
      trigger,
      visible: typeof actionRecord.visible === "boolean" ? actionRecord.visible : trigger === "user",
    };
  });
}

function normalizeImportedWorkflowHooks(
  hooksValue: unknown,
  actionsValue: unknown,
  actions: readonly WorkflowAction<string>[],
): WorkflowLifecycleHook<string>[] {
  const explicitHooks: WorkflowLifecycleHook<string>[] = Array.isArray(hooksValue)
    ? hooksValue.map((hook, index) => {
        const hookRecord = hook && typeof hook === "object" ? (hook as Record<string, unknown>) : {};
        const phase = normalizeLifecyclePhase(hookRecord.phase);
        const targetType: WorkflowLifecycleHook<string>["targetType"] =
          hookRecord.targetType === "state" || hookRecord.targetType === "action"
            ? hookRecord.targetType
            : getLifecycleTargetType(phase);
        const handlerKey = typeof hookRecord.handlerKey === "string" ? hookRecord.handlerKey.trim() : "";
        const onSuccess = normalizeLifecycleHandler(hookRecord.onSuccess);
        const onFailure = normalizeLifecycleHandler(hookRecord.onFailure);
        const schedule = normalizeLifecycleSchedule(hookRecord.schedule);
        const retryPolicy = normalizeLifecycleRetryPolicy(hookRecord.retryPolicy);

        return {
          id: typeof hookRecord.id === "string" ? hookRecord.id : `hook_${index + 1}`,
          phase,
          targetType,
          targetId: typeof hookRecord.targetId === "string" ? hookRecord.targetId : "",
          handlerKey: handlerKey || undefined,
          schedule,
          retryPolicy,
          onSuccess,
          onFailure,
        } as WorkflowLifecycleHook<string>;
      })
    : [];
  const hookTargetKeys = new Set(
    explicitHooks.map((hook) => `${hook.phase}:${hook.targetType}:${hook.targetId}`),
  );
  const legacyHooks: WorkflowLifecycleHook<string>[] = [];

  if (Array.isArray(actionsValue)) {
    actionsValue.forEach((actionValue) => {
      const actionRecord = actionValue && typeof actionValue === "object" ? (actionValue as Record<string, unknown>) : {};
      const actionId = typeof actionRecord.id === "string" ? actionRecord.id : "";
      const processingRecord =
        actionRecord.processing && typeof actionRecord.processing === "object"
          ? (actionRecord.processing as Record<string, unknown>)
          : undefined;
      const handlerKey =
        processingRecord && typeof processingRecord.handlerKey === "string"
          ? processingRecord.handlerKey.trim()
          : "";
      const targetKey = `before_transition:action:${actionId}`;

      if (actionId && handlerKey && actions.some((action) => action.id === actionId) && !hookTargetKeys.has(targetKey)) {
        const hook = {
          id: nextUniqueLifecycleHookId("before_transition", actionId, [...explicitHooks, ...legacyHooks]),
          phase: "before_transition" as const,
          targetType: "action" as const,
          targetId: actionId,
          handlerKey,
        };

        legacyHooks.push(hook);
        hookTargetKeys.add(targetKey);
      }
    });
  }

  return [...explicitHooks, ...legacyHooks];
}

function normalizeLifecyclePhase(phase: unknown): WorkflowLifecyclePhase {
  return lifecyclePhases.includes(phase as WorkflowLifecyclePhase)
    ? (phase as WorkflowLifecyclePhase)
    : "before_transition";
}

function normalizeLifecycleHandler(value: unknown): { handlerKey?: string } | undefined {
  const handlerRecord = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const handlerKey = typeof handlerRecord.handlerKey === "string" ? handlerRecord.handlerKey.trim() : "";

  return handlerKey ? { handlerKey } : undefined;
}

function normalizeLifecycleSchedule(value: unknown): WorkflowLifecycleHookSchedule | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return { ...(value as Record<string, unknown>) } as WorkflowLifecycleHookSchedule;
}

function normalizeLifecycleRetryPolicy(value: unknown): WorkflowLifecycleHookRetryPolicy | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return { ...(value as Record<string, unknown>) } as WorkflowLifecycleHookRetryPolicy;
}

function normalizeImportedWorkflowBuckets(value: unknown): WorkflowBucket<string>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((bucket, index) => {
    const bucketRecord = bucket && typeof bucket === "object" ? (bucket as Record<string, unknown>) : {};

    return {
      id: typeof bucketRecord.id === "string" ? bucketRecord.id : `bucket_${index + 1}`,
      label: typeof bucketRecord.label === "string" ? bucketRecord.label : `Bucket ${index + 1}`,
      visible: typeof bucketRecord.visible === "boolean" ? bucketRecord.visible : true,
      states: Array.isArray(bucketRecord.states) ? bucketRecord.states.filter((state): state is string => typeof state === "string") : [],
    };
  });
}

function createDefaultWorkflowBuckets(states: readonly string[]): WorkflowBucket<string>[] {
  return [{ id: "workflow", label: "Workflow", visible: true, states: [...states] }];
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

export function buildMermaidDiagram(
  machine: EditableDefinition,
  theme: MermaidPreviewTheme = "light",
  diagramDirection: DiagramDirection = "vertical",
): string {
  const palette = getMermaidPreviewPalette(theme);
  const lines = [getMermaidFlowchartDeclaration(diagramDirection)];

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
  focusStateIds?: readonly string[],
  diagramDirection: DiagramDirection = "vertical",
): string {
  const palette = getMermaidPreviewPalette(theme);
  const lines = [getMermaidFlowchartDeclaration(diagramDirection)];
  const isFocusedPreview = focusStateIds !== undefined;
  const focusStateSet = new Set(focusStateIds ?? []);
  const terminalStateSet = new Set(machine.terminalStates);

  for (const state of machine.states) {
    lines.push(`  ${state}["${state}"]`);
  }

  for (const action of workflow.actions) {
    lines.push(`  ${action.from} -->|${escapeMermaidLabel(action.label || action.id)}| ${action.to}`);
  }

  if (machine.states.length > 0 && !isFocusedPreview) {
    lines.push(
      `  classDef state fill:${palette.stateFill},stroke:${palette.stateStroke},stroke-width:2px,color:${palette.text};`,
    );
    lines.push(`  class ${machine.states.join(",")} state;`);
  }

  if (machine.terminalStates.length > 0 && !isFocusedPreview) {
    lines.push(
      `  classDef terminal fill:${palette.stateFill},stroke:${palette.terminalStroke},stroke-width:3px,color:${palette.text};`,
    );
    lines.push(`  class ${machine.terminalStates.join(",")} terminal;`);
  }

  if (isFocusedPreview && machine.states.length > 0) {
    const focusedStates = machine.states.filter((state) => focusStateSet.has(state) && !terminalStateSet.has(state));
    const focusedTerminalStates = machine.states.filter((state) => focusStateSet.has(state) && terminalStateSet.has(state));
    const unfocusedStates = machine.states.filter((state) => !focusStateSet.has(state) && !terminalStateSet.has(state));
    const unfocusedTerminalStates = machine.states.filter((state) => !focusStateSet.has(state) && terminalStateSet.has(state));

    lines.push(
      `  classDef state fill:${palette.stateFill},stroke:${palette.stateStroke},stroke-width:2px,color:${palette.text};`,
    );
    lines.push(
      `  classDef terminal fill:${palette.stateFill},stroke:${palette.terminalStroke},stroke-width:3px,color:${palette.text};`,
    );
    lines.push(
      `  classDef unfocusedState fill:${palette.stateFill},stroke:${palette.stateStroke},stroke-width:2px,stroke-dasharray:2 3,color:${palette.text};`,
    );
    lines.push(
      `  classDef unfocusedTerminal fill:${palette.stateFill},stroke:${palette.terminalStroke},stroke-width:3px,stroke-dasharray:2 3,color:${palette.text};`,
    );

    if (focusedStates.length > 0) {
      lines.push(`  class ${focusedStates.join(",")} state;`);
    }

    if (focusedTerminalStates.length > 0) {
      lines.push(`  class ${focusedTerminalStates.join(",")} terminal;`);
    }

    if (unfocusedStates.length > 0) {
      lines.push(`  class ${unfocusedStates.join(",")} unfocusedState;`);
    }

    if (unfocusedTerminalStates.length > 0) {
      lines.push(`  class ${unfocusedTerminalStates.join(",")} unfocusedTerminal;`);
    }
  }

  return lines.join("\n");
}

function escapeMermaidLabel(label: string) {
  return label.replace(/\|/g, "/");
}

function getMermaidFlowchartDeclaration(diagramDirection: DiagramDirection) {
  return diagramDirection === "horizontal" ? "flowchart LR" : "flowchart TD";
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

function buildDraftSignature(
  definition: EditableDefinition,
  workflow: EditableWorkflowDefinition,
  activePage?: string,
  selectedWorkflowView?: string,
) {
  return JSON.stringify({
    definition,
    workflow,
    activePage,
    selectedWorkflowView,
  });
}
