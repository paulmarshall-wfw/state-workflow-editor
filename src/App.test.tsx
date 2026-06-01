import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import mermaid from "mermaid";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, buildMermaidDiagram, buildWorkflowMermaidDiagram } from "./App";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg data-testid="mock-mermaid-svg"></svg>' })),
  },
}));

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
const originalShowSaveFilePicker = (
  window as Window & {
    showSaveFilePicker?: unknown;
  }
).showSaveFilePicker;
const originalShowDirectoryPicker = (
  window as Window & {
    showDirectoryPicker?: unknown;
  }
).showDirectoryPicker;
const originalIndexedDb = (
  window as Window & {
    indexedDB?: unknown;
  }
).indexedDB;

function createProjectDirectoryHandle(name: string, files: Record<string, string> = {}) {
  return {
    name,
    getFileHandle: vi.fn(async (filename: string) => {
      const contents = files[filename];

      if (contents === undefined) {
        throw new DOMException("File not found", "NotFoundError");
      }

      return {
        getFile: async () => ({
          text: async () => contents,
        }),
      };
    }),
  };
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(blob);
  });
}

function createDragDataTransfer() {
  const dragData = new Map<string, string>();

  return {
    dropEffect: "move",
    effectAllowed: "move",
    setData: vi.fn((format: string, data: string) => dragData.set(format, data)),
    getData: vi.fn((format: string) => dragData.get(format) ?? ""),
  } as unknown as DataTransfer;
}

function createFileDataTransfer(file: File) {
  return {
    dropEffect: "copy",
    effectAllowed: "copy",
    files: [file],
    types: ["Files"],
    setData: vi.fn(),
    getData: vi.fn(),
  } as unknown as DataTransfer;
}

function createTextFile(contents: string, name: string, type = "application/json") {
  const file = new File([contents], name, { type });

  Object.defineProperty(file, "text", {
    value: async () => contents,
  });

  return file;
}

type FakeIndexedDbFactory = IDBFactory & {
  database: FakeDatabase;
};

function createFakeIndexedDb(): FakeIndexedDbFactory {
  const database = new FakeDatabase();

  return {
    database,
    open: () => {
      const request = new FakeOpenRequest(database);

      queueMicrotask(() => {
        request.result = database as unknown as IDBDatabase;
        request.transaction = new FakeTransaction(database) as unknown as IDBTransaction;
        request.onupgradeneeded?.({} as IDBVersionChangeEvent);
        request.onsuccess?.({} as Event);
      });

      return request as unknown as IDBOpenDBRequest;
    },
  } as unknown as FakeIndexedDbFactory;
}

class FakeOpenRequest {
  result!: IDBDatabase;
  transaction: IDBTransaction | null = null;
  onsuccess: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onblocked: ((event: Event) => void) | null = null;
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null = null;
  error: DOMException | null = null;

  constructor(readonly database: FakeDatabase) {}
}

class FakeRequest<Result> {
  result!: Result;
  onsuccess: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  error: DOMException | null = null;

  succeed(result: Result) {
    queueMicrotask(() => {
      this.result = result;
      this.onsuccess?.({} as Event);
    });
  }
}

class FakeDatabase {
  readonly stores = new Map<string, FakeObjectStore>();
  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  createObjectStore(name: string) {
    const store = new FakeObjectStore();
    this.stores.set(name, store);
    return store as unknown as IDBObjectStore;
  }

  transaction(storeName: string) {
    return new FakeTransaction(this, storeName) as unknown as IDBTransaction;
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: DOMException | null = null;

  constructor(
    private readonly database: FakeDatabase,
    private readonly storeName?: string,
  ) {
    queueMicrotask(() => this.oncomplete?.());
  }

  objectStore(name = this.storeName ?? "") {
    const store = this.database.stores.get(name);

    if (!store) {
      throw new Error(`Missing fake object store: ${name}`);
    }

    return store as unknown as IDBObjectStore;
  }
}

class FakeObjectStore {
  readonly records = new Map<string, unknown>();
  readonly indexNames = {
    contains: (name: string) => name === "stateMachineKey",
  };

  createIndex() {
    return {} as IDBIndex;
  }

  get(key: IDBValidKey) {
    const request = new FakeRequest<unknown>();
    request.succeed(cloneJson(this.records.get(String(key))));
    return request as unknown as IDBRequest;
  }

  getAll() {
    const request = new FakeRequest<unknown[]>();
    request.succeed(Array.from(this.records.values()).map(cloneJson));
    return request as unknown as IDBRequest;
  }

  put(record: { key: string }) {
    const request = new FakeRequest<IDBValidKey>();
    this.records.set(record.key, cloneJson(record));
    request.succeed(record.key);
    return request as unknown as IDBRequest;
  }

  delete(key: IDBValidKey) {
    const request = new FakeRequest<undefined>();
    this.records.delete(String(key));
    request.succeed(undefined);
    return request as unknown as IDBRequest;
  }

  index() {
    return {
      getAll: (stateMachineKey: IDBValidKey) => {
        const request = new FakeRequest<unknown[]>();
        const records = Array.from(this.records.values()).filter(
          (record) => (record as { stateMachineKey?: string }).stateMachineKey === String(stateMachineKey),
        );
        request.succeed(records.map(cloneJson));
        return request as unknown as IDBRequest;
      },
    } as IDBIndex;
  }
}

function cloneJson<Value>(value: Value): Value {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as Value;
}

function getStateInputValues() {
  return screen
    .getAllByRole("textbox", { name: /^State \d+ ID$/ })
    .map((input) => (input as HTMLInputElement).value);
}

function getWorkflowActionLabelValues() {
  return screen
    .getAllByRole("textbox", { name: /^Action \d+ label$/ })
    .map((input) => (input as HTMLInputElement).value);
}

function getWorkflowActionIdValues() {
  return screen
    .getAllByRole("textbox", { name: /^Action \d+ ID$/ })
    .map((input) => (input as HTMLInputElement).value);
}

function getWorkflowBucketLabelValues() {
  return screen
    .getAllByRole("textbox", { name: /^Bucket \d+ label$/ })
    .map((input) => (input as HTMLInputElement).value);
}

function queryWorkflowBucketLabelValues() {
  return screen
    .queryAllByRole("textbox", { name: /^Bucket \d+ label$/ })
    .map((input) => (input as HTMLInputElement).value);
}

async function getLastRenderedMermaidSource() {
  const { default: mermaid } = await import("mermaid");
  const renderMock = vi.mocked(mermaid.render);

  return String(renderMock.mock.calls.at(-1)?.[1] ?? "");
}

type TestUser = ReturnType<typeof userEvent.setup>;

function getActionMenuTrigger() {
  const trigger = screen
    .getAllByRole("button", { name: "Actions" })
    .find((button) => button.classList.contains("action-menu-trigger"));

  if (!trigger) {
    throw new Error("Actions menu trigger not found.");
  }

  return trigger;
}

function getWorkflowActionsTab() {
  const tab = screen
    .getAllByRole("button", { name: "Actions" })
    .find((button) => button.classList.contains("active") || button.closest(".workflow-view-tabs"));

  if (!tab) {
    throw new Error("Workflow Actions tab not found.");
  }

  return tab;
}

async function openWorkflowValidationIssues(user: TestUser) {
  await user.click(screen.getByRole("button", { name: "View Issues" }));

  return screen.getByRole("dialog", { name: "Workflow Validation Issues" });
}

async function openActions(user: TestUser) {
  await user.click(getActionMenuTrigger());

  return screen.getByRole("menu", { name: "Actions" });
}

async function clickAction(user: TestUser, name: string) {
  const menu = await openActions(user);

  await user.click(within(menu).getByRole("menuitem", { name }));
}

const clickStateMachineAction = clickAction;
const clickWorkflowAction = clickAction;

async function expectAction(user: TestUser, name: string, enabled: boolean) {
  const menu = await openActions(user);
  const item = within(menu).getByRole("menuitem", { name });

  if (enabled) {
    expect(item).toBeEnabled();
  } else {
    expect(item).toBeDisabled();
  }

  await user.click(getActionMenuTrigger());
}

const expectStateMachineAction = expectAction;
const expectWorkflowAction = expectAction;

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    if (originalShowSaveFilePicker) {
      (
        window as Window & {
          showSaveFilePicker?: unknown;
        }
      ).showSaveFilePicker = originalShowSaveFilePicker;
    } else {
      delete (
        window as Window & {
          showSaveFilePicker?: unknown;
        }
      ).showSaveFilePicker;
    }
    if (originalShowDirectoryPicker) {
      (
        window as Window & {
          showDirectoryPicker?: unknown;
        }
      ).showDirectoryPicker = originalShowDirectoryPicker;
    } else {
      delete (
        window as Window & {
          showDirectoryPicker?: unknown;
        }
      ).showDirectoryPicker;
    }
    if (originalIndexedDb) {
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        value: originalIndexedDb,
      });
    } else {
      delete (
        window as unknown as {
          indexedDB?: unknown;
        }
      ).indexedDB;
    }
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("renders the initial valid definition and Mermaid preview", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "State Workflow Editor" })).toBeInTheDocument();
    expect(screen.queryByText("State Machine Core")).not.toBeInTheDocument();
    expect(screen.getByText("v1.0.7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "State Machine" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workflow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "State Machine" })).toHaveClass("active");
    expect(getActionMenuTrigger()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "State Machine Actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workflow Actions" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Target App")).toHaveValue("Example Project");
    expect(screen.getByLabelText("State Machine Version")).toHaveValue("0.1.0");
    expect(screen.getByText("Valid")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "State machine Mermaid preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vertical" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Horizontal" })).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByTestId("mock-mermaid-svg")).toBeInTheDocument();
    await expectStateMachineAction(userEvent.setup(), "Export State Machine", true);
  });

  it("keeps one global actions menu visible across editor pages", async () => {
    const user = userEvent.setup();
    render(<App />);

    for (const page of ["State Machine", "Workflow", "Library", "Settings"]) {
      await user.click(screen.getByRole("button", { name: page }));

      expect(getActionMenuTrigger()).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "State Machine Actions" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Workflow Actions" })).not.toBeInTheDocument();
    }
  });

  it("shows the full global actions menu with expected enabled states", async () => {
    const user = userEvent.setup();
    render(<App />);

    const menu = await openActions(user);

    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Import State Machine",
      "Import Workflow",
      "Save State Machine",
      "Save Workflow",
      "Save State Machine and Workflow",
      "Reset Workflow",
      "Export State Machine",
      "Export Workflow",
      "Export Bundled Workflow",
    ]);
    expect(within(menu).getByRole("menuitem", { name: "Save State Machine" })).toBeEnabled();
    expect(within(menu).getByRole("menuitem", { name: "Save Workflow" })).toBeEnabled();
    expect(within(menu).getByRole("menuitem", { name: "Save State Machine and Workflow" })).toBeEnabled();
    expect(within(menu).getByRole("menuitem", { name: "Export State Machine" })).toBeEnabled();
    expect(within(menu).getByRole("menuitem", { name: "Export Workflow" })).toBeEnabled();
    expect(within(menu).getByRole("menuitem", { name: "Export Bundled Workflow" })).toBeEnabled();
  });

  it("saves state-machine and workflow definitions through the Library page", async () => {
    const fakeIndexedDb = createFakeIndexedDb();

    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: fakeIndexedDb,
    });
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(screen.getByText("stateMachine:scan_job_state@0.1.0")).toBeInTheDocument();
    expect(screen.getByText("workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save State Machine" }));
    expect(await screen.findByText("Saved state machine stateMachine:scan_job_state@0.1.0.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save Workflow" }));
    expect(
      await screen.findByText("Saved workflow workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0."),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Saved state machines" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Saved workflows" })).toBeInTheDocument();
    expect(screen.getByText("scan_job_workflow")).toBeInTheDocument();

    const stateMachineRecord = fakeIndexedDb.database.stores
      .get("stateMachineDefinitions")
      ?.records.get("stateMachine:scan_job_state@0.1.0") as { savedAt: string };
    const workflowRecord = fakeIndexedDb.database.stores
      .get("workflowDefinitions")
      ?.records.get("workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0") as { savedAt: string };
    const formattedStateMachineSavedAt = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(stateMachineRecord.savedAt));
    const formattedWorkflowSavedAt = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(workflowRecord.savedAt));

    expect(screen.getByTitle(stateMachineRecord.savedAt)).toHaveTextContent(`Saved ${formattedStateMachineSavedAt}`);
    expect(screen.getByTitle(workflowRecord.savedAt)).toHaveTextContent(`Saved ${formattedWorkflowSavedAt}`);
  });

  it("upgrades saved current draft and Library workflows from schema 0.6.0 when loading", async () => {
    const fakeIndexedDb = createFakeIndexedDb();
    const savedAt = "2026-05-28T00:00:00.000Z";
    const definition = {
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
      ],
    };
    const draftWorkflow = {
      schemaVersion: "0.6.0",
      appName: "Example Project",
      workflowVersion: "0.1.0",
      id: "draft_workflow",
      stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
      states: definition.states.map((state) => ({ id: state, visible: true })),
      actions: [{ id: "scan.start", label: "Start", from: "queued", to: "running", trigger: "user", visible: true }],
      buckets: [],
      hooks: [
        {
          id: "while_failed",
          phase: "while_in_state",
          targetType: "state",
          targetId: "failed",
          handlerKey: "check_failed",
          schedule: { trigger: "every_interval", intervalMs: 900000 },
        },
      ],
    };
    const libraryWorkflow = {
      ...draftWorkflow,
      id: "library_workflow",
      workflowVersion: "0.2.0",
    };
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });

    fakeIndexedDb.database.createObjectStore("drafts");
    fakeIndexedDb.database.createObjectStore("stateMachineDefinitions");
    fakeIndexedDb.database.createObjectStore("workflowDefinitions");
    fakeIndexedDb.database.stores.get("drafts")?.records.set("current_workspace", {
      key: "current_workspace",
      storageSchemaVersion: 1,
      definition,
      workflow: draftWorkflow,
      activePage: "workflow",
      selectedWorkflowView: "lifecycle",
      savedAt,
    });
    fakeIndexedDb.database.stores.get("stateMachineDefinitions")?.records.set("stateMachine:scan_job_state@0.1.0", {
      key: "stateMachine:scan_job_state@0.1.0",
      storageSchemaVersion: 1,
      definition,
      savedAt,
    });
    fakeIndexedDb.database.stores
      .get("workflowDefinitions")
      ?.records.set("workflow:scan_job_state@0.1.0/library_workflow@0.2.0", {
        key: "workflow:scan_job_state@0.1.0/library_workflow@0.2.0",
        stateMachineKey: "stateMachine:scan_job_state@0.1.0",
        storageSchemaVersion: 1,
        definition: libraryWorkflow,
        savedAt,
      });
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: fakeIndexedDb,
    });
    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("Workflow ID")).toHaveValue("draft_workflow");
    });
    await clickWorkflowAction(user, "Export Workflow");
    let workflowExport = JSON.parse(await readBlobText(write.mock.calls[0][0] as Blob));

    expect(workflowExport.schemaVersion).toBe("0.7.0");
    expect(workflowExport.id).toBe("draft_workflow");

    await user.click(screen.getByRole("button", { name: "Library" }));
    const libraryWorkflowRow = screen.getByText("library_workflow").closest(".library-record-row") as HTMLElement;

    await user.click(within(libraryWorkflowRow).getByRole("button", { name: "Load" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Workflow ID")).toHaveValue("library_workflow");
    });
    await clickWorkflowAction(user, "Export Workflow");
    workflowExport = JSON.parse(await readBlobText(write.mock.calls[1][0] as Blob));

    expect(workflowExport.schemaVersion).toBe("0.7.0");
    expect(workflowExport.id).toBe("library_workflow");
  });

  it("saves state-machine and workflow definitions together from the global menu", async () => {
    const fakeIndexedDb = createFakeIndexedDb();
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: fakeIndexedDb,
    });
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);

    await clickAction(user, "Save State Machine and Workflow");

    expect(confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(
      await screen.findByText(
        "Saved state machine stateMachine:scan_job_state@0.1.0 and workflow workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0.",
      ),
    ).toBeInTheDocument();

    const stateMachineStore = fakeIndexedDb.database.stores.get("stateMachineDefinitions");
    const workflowStore = fakeIndexedDb.database.stores.get("workflowDefinitions");
    const savedStateMachine = stateMachineStore?.records.get("stateMachine:scan_job_state@0.1.0") as {
      definition: { id: string };
    };
    const savedWorkflow = workflowStore?.records.get("workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0") as {
      definition: { id: string; embeddedStateMachineDefinition?: unknown };
    };

    expect(savedStateMachine.definition.id).toBe("scan_job_state");
    expect(savedWorkflow.definition.id).toBe("scan_job_workflow");
    expect(savedWorkflow.definition).not.toHaveProperty("embeddedStateMachineDefinition");
  });

  it("cancels the combined save before replacing existing library records", async () => {
    const fakeIndexedDb = createFakeIndexedDb();
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: fakeIndexedDb,
    });
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Library" }));
    await clickAction(user, "Save State Machine and Workflow");
    await screen.findByText(
      "Saved state machine stateMachine:scan_job_state@0.1.0 and workflow workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0.",
    );

    const stateMachineStore = fakeIndexedDb.database.stores.get("stateMachineDefinitions");
    const workflowStore = fakeIndexedDb.database.stores.get("workflowDefinitions");
    const stateMachineBefore = JSON.stringify(stateMachineStore?.records.get("stateMachine:scan_job_state@0.1.0"));
    const workflowBefore = JSON.stringify(
      workflowStore?.records.get("workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0"),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    await clickAction(user, "Save State Machine and Workflow");

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      "Replace existing saved state-machine or workflow records for stateMachine:scan_job_state@0.1.0 and workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0?",
    );
    expect(await screen.findByText("State-machine and workflow save cancelled.")).toBeInTheDocument();
    expect(JSON.stringify(stateMachineStore?.records.get("stateMachine:scan_job_state@0.1.0"))).toBe(stateMachineBefore);
    expect(JSON.stringify(workflowStore?.records.get("workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0"))).toBe(
      workflowBefore,
    );
  });

  it("replaces both records with one confirmation when combined save finds existing records", async () => {
    const fakeIndexedDb = createFakeIndexedDb();
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: fakeIndexedDb,
    });
    const user = userEvent.setup();

    render(<App />);

    await clickAction(user, "Save State Machine and Workflow");
    await waitFor(() =>
      expect(
        fakeIndexedDb.database.stores
          .get("workflowDefinitions")
          ?.records.get("workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0"),
      ).toBeDefined(),
    );
    await user.click(screen.getByRole("button", { name: "State Machine" }));
    await user.clear(screen.getByLabelText("Target App"));
    await user.type(screen.getByLabelText("Target App"), "Updated Project");
    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.clear(screen.getByLabelText("Target App"));
    await user.type(screen.getByLabelText("Target App"), "Updated Project");

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    await clickAction(user, "Save State Machine and Workflow");

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      "Replace existing saved state-machine or workflow records for stateMachine:scan_job_state@0.1.0 and workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0?",
    );
    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(
      await screen.findByText(
        "Saved state machine stateMachine:scan_job_state@0.1.0 and workflow workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0.",
      ),
    ).toBeInTheDocument();

    const stateMachineStore = fakeIndexedDb.database.stores.get("stateMachineDefinitions");
    const workflowStore = fakeIndexedDb.database.stores.get("workflowDefinitions");
    const savedStateMachine = stateMachineStore?.records.get("stateMachine:scan_job_state@0.1.0") as {
      definition: { appName: string };
    };
    const savedWorkflow = workflowStore?.records.get("workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0") as {
      definition: { appName: string };
    };

    expect(savedStateMachine.definition.appName).toBe("Updated Project");
    expect(savedWorkflow.definition.appName).toBe("Updated Project");
  });

  it("generates Mermaid source with directed transitions and terminal-state styling", () => {
    const definition = {
      schemaVersion: "0.3.0",
      appName: "Example Project",
      definitionVersion: "0.1.0",
      id: "scan_job_state",
      states: ["queued", "running", "completed"],
      entryStates: ["queued"],
      terminalStates: ["completed"],
      transitions: [
        { from: "queued", to: "running" },
        { from: "running", to: "completed" },
      ],
    } as const;
    const source = buildMermaidDiagram(definition);
    const darkSource = buildMermaidDiagram(definition, "dark");
    const horizontalSource = buildMermaidDiagram(definition, "light", "horizontal");

    expect(source).toContain("flowchart TD");
    expect(horizontalSource).toContain("flowchart LR");
    expect(source).toContain("queued --> running");
    expect(source).toContain("running --> completed");
    expect(source).toContain("classDef state fill:#eef2f5");
    expect(source).toContain("class queued entry;");
    expect(source).toContain("class completed terminal;");
    expect(darkSource).toContain("classDef state fill:#182028");
    expect(darkSource).toContain("color:#eef3f7");
  });

  it("generates Mermaid source with combined entry and terminal styling", () => {
    const definition = {
      schemaVersion: "0.3.0",
      appName: "Example Project",
      definitionVersion: "0.1.0",
      id: "single_state_machine",
      states: ["done"],
      entryStates: ["done"],
      terminalStates: ["done"],
      transitions: [],
    } as const;
    const source = buildMermaidDiagram(definition);

    expect(source).toContain("classDef entryTerminal");
    expect(source).toContain("class done entryTerminal;");
  });

  it("generates workflow Mermaid source with action-labelled transitions", () => {
    const definition = {
      schemaVersion: "0.3.0",
      appName: "Example Project",
      definitionVersion: "0.1.0",
      id: "scan_job_state",
      states: ["queued", "running"],
      entryStates: [],
      terminalStates: [],
      transitions: [{ from: "queued", to: "running" }],
    } as const;
    const workflow = {
      schemaVersion: "0.7.0",
      appName: "Example Project",
      workflowVersion: "0.1.0",
      id: "scan_job_workflow",
      stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
      states: [
        { id: "queued", visible: true },
        { id: "running", visible: true },
      ],
      actions: [{ id: "start", label: "Start", from: "queued", to: "running", trigger: "user", visible: true }],
      buckets: [{ id: "workflow", label: "Workflow", visible: true, states: ["queued", "running"] }],
      hooks: [],
    } as const;
    const source = buildWorkflowMermaidDiagram(definition, workflow);
    const horizontalSource = buildWorkflowMermaidDiagram(definition, workflow, "light", undefined, "horizontal");

    expect(source).toContain("flowchart TD");
    expect(source).toContain('queued -->|"Start"| running');
    expect(horizontalSource).toContain("flowchart LR");
    expect(horizontalSource).toContain('queued -->|"Start"| running');
  });

  it("generates focused workflow Mermaid source with dotted non-bucket states", () => {
    const definition = {
      schemaVersion: "0.3.0",
      appName: "Example Project",
      definitionVersion: "0.1.0",
      id: "scan_job_state",
      states: ["queued", "running", "completed"],
      entryStates: [],
      terminalStates: ["completed"],
      transitions: [
        { from: "queued", to: "running" },
        { from: "running", to: "completed" },
      ],
    } as const;
    const workflow = {
      schemaVersion: "0.7.0",
      appName: "Example Project",
      workflowVersion: "0.1.0",
      id: "scan_job_workflow",
      stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
      states: [
        { id: "queued", visible: true },
        { id: "running", visible: true },
        { id: "completed", visible: true },
      ],
      actions: [
        { id: "scan.start", label: "Start", from: "queued", to: "running", trigger: "user", visible: true },
        { id: "scan.complete", label: "Complete", from: "running", to: "completed", trigger: "user", visible: true },
      ],
      buckets: [{ id: "waiting", label: "Waiting", visible: true, states: ["queued"] }],
      hooks: [],
    } as const;
    const defaultSource = buildWorkflowMermaidDiagram(definition, workflow);
    const focusedSource = buildWorkflowMermaidDiagram(definition, workflow, "light", ["queued"]);
    const focusedTerminalSource = buildWorkflowMermaidDiagram(definition, workflow, "light", ["completed"]);

    expect(defaultSource).toContain('queued -->|"Start"| running');
    expect(defaultSource).toContain("class queued,running state;");
    expect(defaultSource).toContain("class completed terminal;");
    expect(defaultSource).not.toContain("unfocusedState");
    expect(focusedSource).toContain('queued -->|"Start"| running');
    expect(focusedSource).toContain("class queued state;");
    expect(focusedSource).toContain("class running unfocusedState;");
    expect(focusedSource).toContain("class completed unfocusedTerminal;");
    expect(focusedSource).toContain("stroke-dasharray:2 3");
    expect(focusedTerminalSource).toContain("class completed terminal;");
    expect(focusedTerminalSource).toContain("class queued,running unfocusedState;");
  });

  it("includes action IDs in workflow Mermaid labels when labels collide", () => {
    const definition = {
      schemaVersion: "0.3.0",
      appName: "Example Project",
      definitionVersion: "0.1.0",
      id: "scan_job_state",
      states: ["queued", "running", "cancelled"],
      entryStates: ["queued"],
      terminalStates: ["cancelled"],
      transitions: [
        { from: "queued", to: "cancelled" },
        { from: "running", to: "cancelled" },
      ],
    } as const;
    const workflow = {
      schemaVersion: "0.7.0",
      appName: "Example Project",
      workflowVersion: "0.1.0",
      id: "scan_job_workflow",
      stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
      states: [
        { id: "queued", visible: true },
        { id: "running", visible: true },
        { id: "cancelled", visible: true },
      ],
      actions: [
        { id: "cancel_queued", label: "Cancel", from: "queued", to: "cancelled", trigger: "user", visible: true },
        { id: "cancel_running", label: "Cancel", from: "running", to: "cancelled", trigger: "user", visible: true },
      ],
      buckets: [],
      hooks: [],
    } as const;

    const source = buildWorkflowMermaidDiagram(definition, workflow, "light");

    expect(source).toContain('queued -->|"Cancel (cancel_queued)"| cancelled');
    expect(source).toContain('running -->|"Cancel (cancel_running)"| cancelled');
  });

  it("HTML-encodes double quotes inside workflow Mermaid labels", () => {
    const definition = {
      schemaVersion: "0.3.0",
      appName: "Example Project",
      definitionVersion: "0.1.0",
      id: "scan_job_state",
      states: ["queued", "running"],
      entryStates: ["queued"],
      terminalStates: [],
      transitions: [{ from: "queued", to: "running" }],
    } as const;
    const workflow = {
      schemaVersion: "0.7.0",
      appName: "Example Project",
      workflowVersion: "0.1.0",
      id: "scan_job_workflow",
      stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
      states: [
        { id: "queued", visible: true },
        { id: "running", visible: true },
      ],
      actions: [
        { id: "start", label: 'Say "Go"', from: "queued", to: "running", trigger: "user", visible: true },
      ],
      buckets: [],
      hooks: [],
    } as const;

    const source = buildWorkflowMermaidDiagram(definition, workflow, "light");

    expect(source).toContain('queued -->|"Say &quot;Go&quot;"| running');
  });

  it("toggles and persists light and dark mode from the icon beside the app name", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });

    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
    expect(localStorage.getItem("state-workflow-editor-settings")).toContain('"theme":"dark"');
  });

  it("toggles and persists the Mermaid preview direction", async () => {
    const user = userEvent.setup();
    const renderMock = vi.mocked(mermaid.render);

    render(<App />);

    await waitFor(() => {
      expect(renderMock.mock.calls.some(([, source]) => source.includes("flowchart TD"))).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "Horizontal" }));

    await waitFor(() => {
      expect(renderMock.mock.calls.some(([, source]) => source.includes("flowchart LR"))).toBe(true);
    });
    expect(screen.getByRole("button", { name: "Vertical" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Horizontal" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("state-workflow-editor-settings")).toContain('"diagramDirection":"horizontal"');

    await user.click(screen.getByRole("button", { name: "Workflow" }));

    await waitFor(() => {
      expect(renderMock.mock.calls.filter(([, source]) => source.includes("flowchart LR")).length).toBeGreaterThan(1);
    });
    expect(screen.getByRole("button", { name: "Horizontal" })).toHaveAttribute("aria-pressed", "true");
  });

  it("validates app name and state definition version", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByLabelText("Target App"));
    await user.clear(screen.getByLabelText("State Machine Version"));
    await user.type(screen.getByLabelText("State Machine Version"), "draft");

    expect(screen.getByText("App name is required.")).toBeInTheDocument();
    expect(screen.getByText("State definition version must use a numbered SemVer value such as 0.1.0.")).toBeInTheDocument();
    await expectStateMachineAction(user, "Export State Machine", false);
    await expectStateMachineAction(user, "Save State Machine and Workflow", false);
  });

  it("adds states and entry and terminal states through the editor", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("checkbox", { name: "queued entry" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "queued entry" }));
    expect(screen.getByRole("checkbox", { name: "queued entry" })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Add State" }));
    const stateInput = screen.getByRole("textbox", { name: "State 6 ID" });

    await user.clear(stateInput);
    await user.type(stateInput, "archived");
    await user.click(screen.getByRole("checkbox", { name: "archived entry" }));
    await user.click(screen.getByRole("checkbox", { name: "archived terminal" }));

    expect(stateInput).toHaveValue("archived");
    expect(screen.getByRole("checkbox", { name: "archived entry" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "archived terminal" })).toBeChecked();
  });

  it("retargets and removes entry states when state IDs change", async () => {
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });

    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    render(<App />);

    const queuedInput = screen.getByRole("textbox", { name: "State 1 ID" });
    await user.clear(queuedInput);
    await user.type(queuedInput, "inbox");

    await clickStateMachineAction(user, "Export State Machine");
    await waitFor(() => {
      expect(write).toHaveBeenCalledTimes(1);
    });
    expect(JSON.parse(await readBlobText(write.mock.calls[0][0] as Blob)).entryStates).toEqual(["inbox"]);

    const inboxRow = screen.getByRole("listitem", { name: "inbox state row" });
    await user.click(within(inboxRow).getByRole("button", { name: "Remove" }));
    await clickStateMachineAction(user, "Export State Machine");
    await waitFor(() => {
      expect(write).toHaveBeenCalledTimes(2);
    });
    expect(JSON.parse(await readBlobText(write.mock.calls[1][0] as Blob)).entryStates).toEqual([]);
  });

  it("reorders states by dragging from one row to another", () => {
    render(<App />);

    const dataTransfer = createDragDataTransfer();
    const failedHandle = screen.getByRole("button", { name: "Drag failed" });
    const runningRow = screen.getByRole("listitem", { name: "running state row" });

    fireEvent.dragStart(failedHandle, { dataTransfer });
    fireEvent.dragEnter(runningRow, { dataTransfer });
    fireEvent.dragOver(runningRow, { dataTransfer });
    fireEvent.drop(runningRow, { dataTransfer });

    expect(getStateInputValues()).toEqual(["queued", "failed", "running", "completed", "cancelled"]);
    expect(screen.getByRole("listitem", { name: "queued state row" })).toHaveClass("selected");
    expect(screen.getByRole("checkbox", { name: "completed terminal" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "cancelled terminal" })).toBeChecked();
    expect(screen.getByLabelText("Transition 1 target")).toHaveValue("running");
  });

  it("selects a state from the state ID field", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("textbox", { name: "State 2 ID" }));

    expect(screen.getByRole("listitem", { name: "running state row" })).toHaveClass("selected");
    expect(screen.getByLabelText("Transition 2 target")).toHaveValue("completed");
    expect(screen.queryByLabelText("Transition 1 target")).not.toBeInTheDocument();
  });

  it("selects a state from the drag grip or row background", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Drag running" }));

    expect(screen.getByRole("listitem", { name: "running state row" })).toHaveClass("selected");

    await user.click(screen.getByRole("listitem", { name: "completed state row" }));

    expect(screen.getByRole("listitem", { name: "completed state row" })).toHaveClass("selected");
    expect(screen.getByRole("listitem", { name: "running state row" })).not.toHaveClass("selected");
  });

  it("shows validation errors and disables export for terminal outgoing transitions", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("checkbox", { name: "queued terminal" }));

    expect(screen.getAllByText(/Terminal state "queued" cannot have outgoing transitions/)).toHaveLength(2);
    await expectStateMachineAction(user, "Export State Machine", false);
    expect(screen.queryByRole("img", { name: "State machine Mermaid preview" })).not.toBeInTheDocument();
  });

  it("imports a valid JSON definition", async () => {
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });

    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    render(<App />);

    const json = JSON.stringify({
      schemaVersion: "0.2.0",
      appName: "Article Manager",
      definitionVersion: "1.2.3",
      id: "article_state",
      states: ["draft", "published"],
      terminalStates: ["published"],
      transitions: [{ from: "draft", to: "published" }],
    });
    const file = new File([json], "article-state.json", { type: "application/json" });

    Object.defineProperty(file, "text", {
      value: async () => json,
    });

    fireEvent.change(screen.getByLabelText("Import state machine JSON definition"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("State Machine ID")).toHaveValue("article_state");
    });
    expect(screen.getByLabelText("Target App")).toHaveValue("Article Manager");
    expect(screen.getByLabelText("State Machine Version")).toHaveValue("1.2.3");
    expect(screen.getByRole("textbox", { name: "State 1 ID" })).toHaveValue("draft");
    expect(screen.getByRole("checkbox", { name: "draft entry" })).not.toBeChecked();
    expect(screen.getByText("Valid")).toBeInTheDocument();

    await clickStateMachineAction(user, "Export State Machine");
    await waitFor(() => {
      expect(write).toHaveBeenCalledTimes(1);
    });
    const stateMachineExport = JSON.parse(await readBlobText(write.mock.calls[0][0]));

    expect(stateMachineExport.schemaVersion).toBe("0.3.0");
    expect(stateMachineExport.entryStates).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Workflow" }));

    expect(screen.getByLabelText("Target App")).toHaveValue("Article Manager");
    expect(screen.getByLabelText("State Machine")).toHaveValue("article_state@1.2.3");
    expect(screen.getByText(/Workflow synced to current state machine/)).toBeInTheDocument();
    await expectWorkflowAction(user, "Export Workflow", true);

    await clickWorkflowAction(user, "Export Workflow");
    await waitFor(() => {
      expect(write).toHaveBeenCalledTimes(2);
    });

    const workflowExport = JSON.parse(await readBlobText(write.mock.calls[1][0]));

    expect(workflowExport.states.map((state: { id: string }) => state.id)).toEqual(["draft", "published"]);
    expect(workflowExport.actions).toEqual([]);
    expect(workflowExport.buckets).toEqual([
      { id: "waiting", label: "Waiting", visible: true, states: [] },
      { id: "active", label: "Active", visible: true, states: [] },
      { id: "finished", label: "Finished", visible: true, states: [] },
    ]);
  });

  it("shows the state-machine import drop zone only on the State Machine page", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("button", { name: /State Machine JSON/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Workflow" }));

    expect(screen.queryByRole("button", { name: /State Machine JSON/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Workflow JSON/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.queryByRole("button", { name: /State Machine JSON/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Workflow JSON/ })).not.toBeInTheDocument();
  });

  it("imports a valid state-machine JSON file from the drop zone", async () => {
    render(<App />);

    const json = JSON.stringify({
      schemaVersion: "0.2.0",
      appName: "Article Manager",
      definitionVersion: "1.2.3",
      id: "article_state",
      states: ["draft", "review", "published"],
      terminalStates: ["published"],
      transitions: [
        { from: "draft", to: "review" },
        { from: "review", to: "published" },
      ],
    });
    const file = createTextFile(json, "article-state.json", "");
    const dataTransfer = createFileDataTransfer(file);
    const dropZone = screen.getByRole("button", { name: /State Machine JSON/ });

    fireEvent.dragEnter(dropZone, { dataTransfer });
    fireEvent.dragOver(dropZone, { dataTransfer });
    fireEvent.drop(dropZone, { dataTransfer });

    await waitFor(() => {
      expect(screen.getByLabelText("State Machine ID")).toHaveValue("article_state");
    });
    expect(screen.getByLabelText("Target App")).toHaveValue("Article Manager");
    expect(screen.getByLabelText("State Machine Version")).toHaveValue("1.2.3");
    expect(getStateInputValues()).toEqual(["draft", "review", "published"]);
    expect(screen.getByRole("listitem", { name: "draft state row" })).toHaveClass("selected");
    expect(screen.getByText("Valid")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "State machine Mermaid preview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Workflow" }));

    expect(screen.getByLabelText("Target App")).toHaveValue("Article Manager");
    expect(screen.getByLabelText("State Machine")).toHaveValue("article_state@1.2.3");
  });

  it("opens the existing state-machine file input from the drop zone and imports through it", async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText("Import state machine JSON definition") as HTMLInputElement;
    const inputClick = vi.spyOn(input, "click").mockImplementation(() => undefined);
    const json = JSON.stringify({
      schemaVersion: "0.2.0",
      appName: "Review Desk",
      definitionVersion: "2.0.0",
      id: "review_state",
      states: ["new", "done"],
      terminalStates: ["done"],
      transitions: [{ from: "new", to: "done" }],
    });

    await user.click(screen.getByRole("button", { name: /State Machine JSON/ }));

    expect(inputClick).toHaveBeenCalled();

    inputClick.mockClear();
    screen.getByRole("button", { name: /State Machine JSON/ }).focus();
    await user.keyboard("{Enter}");

    expect(inputClick).toHaveBeenCalled();

    fireEvent.change(input, {
      target: { files: [createTextFile(json, "review-state.json", "application/json")] },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("State Machine ID")).toHaveValue("review_state");
    });
    expect(screen.getByLabelText("Target App")).toHaveValue("Review Desk");
    expect(screen.getByRole("listitem", { name: "new state row" })).toHaveClass("selected");
  });

  it("rejects invalid JSON from the drop zone without replacing the current definition", async () => {
    render(<App />);

    await screen.findByTestId("mock-mermaid-svg");

    const dataTransfer = createFileDataTransfer(createTextFile("{", "broken-state.json", "application/json"));
    const dropZone = screen.getByRole("button", { name: /State Machine JSON/ });

    fireEvent.drop(dropZone, { dataTransfer });

    await waitFor(() => {
      expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Target App")).toHaveValue("Example Project");
    expect(screen.getByLabelText("State Machine ID")).toHaveValue("scan_job_state");
    expect(getStateInputValues()).toEqual(["queued", "running", "completed", "failed", "cancelled"]);
  });

  it("rejects invalid state-machine definitions from the drop zone without replacing the current definition", async () => {
    render(<App />);

    await screen.findByTestId("mock-mermaid-svg");

    const json = JSON.stringify({
      schemaVersion: "0.2.0",
      appName: "Broken Manager",
      definitionVersion: "1.0.0",
      id: "broken_state",
      states: ["draft", "draft"],
      terminalStates: [],
      transitions: [],
    });
    const dataTransfer = createFileDataTransfer(createTextFile(json, "broken-state.json", "application/json"));
    const dropZone = screen.getByRole("button", { name: /State Machine JSON/ });

    fireEvent.drop(dropZone, { dataTransfer });

    await waitFor(() => {
      expect(screen.getByText(/Invalid state-machine definition/)).toBeInTheDocument();
    });
    expect(screen.getByText(/State "draft" is defined more than once/)).toBeInTheDocument();
    expect(screen.getByLabelText("Target App")).toHaveValue("Example Project");
    expect(screen.getByLabelText("State Machine ID")).toHaveValue("scan_job_state");
    expect(getStateInputValues()).toEqual(["queued", "running", "completed", "failed", "cancelled"]);
  });

  it("rejects non-JSON dropped files without replacing the current definition", async () => {
    render(<App />);

    await screen.findByTestId("mock-mermaid-svg");

    const dataTransfer = createFileDataTransfer(createTextFile("not json", "state-machine.txt", "text/plain"));
    const dropZone = screen.getByRole("button", { name: /State Machine JSON/ });

    fireEvent.drop(dropZone, { dataTransfer });

    expect(screen.getByText("Unsupported file type. Choose a .json state-machine definition file.")).toBeInTheDocument();
    expect(screen.getByLabelText("Target App")).toHaveValue("Example Project");
    expect(screen.getByLabelText("State Machine ID")).toHaveValue("scan_job_state");
    expect(getStateInputValues()).toEqual(["queued", "running", "completed", "failed", "cancelled"]);
  });

  it("persists the configurable app logo URL from settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.type(screen.getByLabelText("Logo URL"), "https://example.com/logo.png");
    await user.click(screen.getByRole("button", { name: "State Machine" }));

    expect(screen.getByRole("img", { name: "App logo" })).toHaveAttribute("src", "https://example.com/logo.png");
    expect(localStorage.getItem("state-workflow-editor-settings")).toContain("https://example.com/logo.png");
  });

  it("uses the File System Access API for exports when available", async () => {
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });

    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    render(<App />);

    await clickStateMachineAction(user, "Export State Machine");

    await waitFor(() => {
      expect(showSaveFilePicker).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedName: "example-project-0.1.0-state-specification.json",
        }),
      );
    });
    expect(write).toHaveBeenCalledWith(expect.any(Blob));
    expect(close).toHaveBeenCalled();
    expect(screen.getByText("Exported example-project-0.1.0-state-specification.json.")).toBeInTheDocument();
  });

  it("exports state-machine JSON with the visible reordered state order", async () => {
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });

    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    render(<App />);

    const dataTransfer = createDragDataTransfer();
    const failedHandle = screen.getByRole("button", { name: "Drag failed" });
    const runningRow = screen.getByRole("listitem", { name: "running state row" });

    fireEvent.dragStart(failedHandle, { dataTransfer });
    fireEvent.dragEnter(runningRow, { dataTransfer });
    fireEvent.dragOver(runningRow, { dataTransfer });
    fireEvent.drop(runningRow, { dataTransfer });

    await clickStateMachineAction(user, "Export State Machine");

    await waitFor(() => {
      expect(write).toHaveBeenCalledWith(expect.any(Blob));
    });

    const exported = JSON.parse(await readBlobText(write.mock.calls[0][0] as Blob));

    expect(exported.schemaVersion).toBe("0.3.0");
    expect(exported.states).toEqual(["queued", "failed", "running", "completed", "cancelled"]);
    expect(exported.entryStates).toEqual(["queued"]);
    expect(exported.terminalStates).toEqual(["completed", "cancelled"]);
    expect(exported.transitions).toContainEqual({ from: "queued", to: "running" });
    expect(exported.transitions).toContainEqual({ from: "running", to: "failed" });
    expect(close).toHaveBeenCalled();
  });

  it("uses package.json name from the folder picker for both target app fields", async () => {
    const user = userEvent.setup();
    const showDirectoryPicker = vi.fn().mockResolvedValue(
      createProjectDirectoryHandle("Display Folder", {
        "package.json": JSON.stringify({ name: "state-workflow-engine" }),
      }),
    );

    (
      window as Window & {
        showDirectoryPicker?: typeof showDirectoryPicker;
      }
    ).showDirectoryPicker = showDirectoryPicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Choose app folder" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Target App")).toHaveValue("state-workflow-engine");
    });
    expect(screen.getByText('Selected app "state-workflow-engine" from package.json.')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Workflow" }));

    expect(screen.getByLabelText("Target App")).toHaveValue("state-workflow-engine");
  });

  it("strips package scope when choosing a scoped package project folder", async () => {
    const user = userEvent.setup();
    const showDirectoryPicker = vi.fn().mockResolvedValue(
      createProjectDirectoryHandle("Display Folder", {
        "package.json": JSON.stringify({ name: "@example/state-workflow-engine" }),
      }),
    );

    (
      window as Window & {
        showDirectoryPicker?: typeof showDirectoryPicker;
      }
    ).showDirectoryPicker = showDirectoryPicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Choose app folder" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Target App")).toHaveValue("state-workflow-engine");
    });
  });

  it("falls back to the selected folder name when package metadata is unavailable", async () => {
    const user = userEvent.setup();
    const showDirectoryPicker = vi.fn().mockResolvedValue(createProjectDirectoryHandle("selected-project"));

    (
      window as Window & {
        showDirectoryPicker?: typeof showDirectoryPicker;
      }
    ).showDirectoryPicker = showDirectoryPicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Choose app folder" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Target App")).toHaveValue("selected-project");
    });
    expect(screen.getByText('Selected app "selected-project" from selected folder.')).toBeInTheDocument();
  });

  it("uses .app-dashboard.json only when its name is slug-like", async () => {
    const user = userEvent.setup();
    const showDirectoryPicker = vi
      .fn()
      .mockResolvedValueOnce(
        createProjectDirectoryHandle("Display Folder", {
          ".app-dashboard.json": JSON.stringify({ name: "dashboard-project" }),
        }),
      )
      .mockResolvedValueOnce(
        createProjectDirectoryHandle("Another Folder", {
          ".app-dashboard.json": JSON.stringify({ name: "Dashboard Project" }),
        }),
      );

    (
      window as Window & {
        showDirectoryPicker?: typeof showDirectoryPicker;
      }
    ).showDirectoryPicker = showDirectoryPicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Choose app folder" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Target App")).toHaveValue("dashboard-project");
    });
    expect(screen.getByText('Selected app "dashboard-project" from .app-dashboard.json.')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Choose app folder" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Target App")).toHaveValue("another-folder");
    });
    expect(screen.getByText('Selected app "another-folder" from selected folder.')).toBeInTheDocument();
  });

  it("keeps existing target app values when folder picking is unsupported or cancelled", async () => {
    const user = userEvent.setup();

    delete (
      window as Window & {
        showDirectoryPicker?: unknown;
      }
    ).showDirectoryPicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Choose app folder" }));

    expect(screen.getByLabelText("Target App")).toHaveValue("Example Project");
    expect(
      screen.getByText("Folder picker is not supported in this browser. Type the target app name manually."),
    ).toBeInTheDocument();

    const showDirectoryPicker = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));

    (
      window as Window & {
        showDirectoryPicker?: typeof showDirectoryPicker;
      }
    ).showDirectoryPicker = showDirectoryPicker;

    await user.click(screen.getByRole("button", { name: "Choose app folder" }));

    expect(screen.getByLabelText("Target App")).toHaveValue("Example Project");
    expect(screen.getByText("App selection cancelled.")).toBeInTheDocument();
  });

  it("falls back to browser download when save picker is unavailable", async () => {
    const user = userEvent.setup();
    const click = vi.fn();
    const anchor = document.createElement("a");

    URL.createObjectURL = vi.fn().mockReturnValue("blob:test");
    URL.revokeObjectURL = vi.fn();
    delete (
      window as Window & {
        showSaveFilePicker?: unknown;
      }
    ).showSaveFilePicker;

    render(<App />);

    const menu = await openActions(user);

    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    vi.spyOn(anchor, "click").mockImplementation(click);

    await user.click(within(menu).getByRole("menuitem", { name: "Export State Machine" }));

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor.download).toBe("example-project-0.1.0-state-specification.json");
    expect(click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
    expect(screen.getByText("Downloaded example-project-0.1.0-state-specification.json.")).toBeInTheDocument();
  });

  it("creates transition rows with selectable states", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add Transition" }));

    expect(screen.getByLabelText("Transition 7 target")).toHaveValue("running");
  });

  it("navigates to the workflow page and edits workflow actions", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));

    expect(screen.getByLabelText("Workflow ID")).toHaveValue("scan_job_workflow");
    expect(screen.getByLabelText("State Machine")).toHaveValue("scan_job_state@0.1.0");
    expect(screen.getByLabelText("Selected State")).toHaveValue("queued");
    expect(screen.getByText("Action ID")).toBeInTheDocument();
    expect(screen.getByText("Button Label")).toBeInTheDocument();
    expect(screen.getByText("From State")).toBeInTheDocument();
    expect(screen.getByText("To State")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Action 1 ID" })).toHaveValue("start");
    expect(screen.getByRole("img", { name: "Workflow Mermaid preview" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Action" }));
    const actionIdInput = screen.getByRole("textbox", { name: "Action 7 ID" });
    const actionInput = screen.getByRole("textbox", { name: "Action 7 label" });

    expect(actionIdInput).toHaveValue("action_7");

    await user.clear(actionInput);
    await user.type(actionInput, "Pause");

    expect(actionInput).toHaveValue("Pause");
    expect(actionIdInput).toHaveValue("action_7");

    await user.clear(actionIdInput);
    await user.type(actionIdInput, "queued.pause");

    expect(actionIdInput).toHaveValue("queued.pause");
    expect(actionInput).toHaveValue("Pause");
  });

  it("shows Add All Actions beside Add Action in the workflow actions toolbar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));

    const buttonGroup = screen.getByRole("button", { name: "Add All Actions" }).closest(".workflow-action-button-group");

    expect(buttonGroup).toContainElement(screen.getByRole("button", { name: "Add Action" }));
    expect(Array.from(buttonGroup?.querySelectorAll("button") ?? []).map((button) => button.textContent)).toEqual([
      "Add All Actions",
      "Add Action",
    ]);
  });

  it("adds workflow actions for every valid transition when no actions exist", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });

    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await clickWorkflowAction(user, "Reset Workflow");
    await user.click(screen.getByRole("button", { name: "Add All Actions" }));

    expect(confirm).not.toHaveBeenCalledWith(
      "Workflow actions already exist. Add all actions will overwrite existing actions. Continue?",
    );
    expect(screen.getByText("Added 6 workflow actions from state-machine transitions.")).toBeInTheDocument();
    expect(getWorkflowActionIdValues()).toEqual(["queued.to_running", "queued.to_cancelled"]);
    expect(getWorkflowActionLabelValues()).toEqual(["Queued to Running", "Queued to Cancelled"]);

    await user.selectOptions(screen.getByLabelText("Selected State"), "running");

    expect(getWorkflowActionLabelValues()).toEqual([
      "Running to Completed",
      "Running to Failed",
      "Running to Cancelled",
    ]);
    expect(getWorkflowActionIdValues()).toEqual([
      "running.to_completed",
      "running.to_failed",
      "running.to_cancelled",
    ]);

    await user.selectOptions(screen.getByLabelText("Selected State"), "failed");

    expect(getWorkflowActionLabelValues()).toEqual(["Failed to Queued"]);

    await expectWorkflowAction(user, "Export Workflow", true);
    await clickWorkflowAction(user, "Export Workflow");

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const workflowExport = JSON.parse(await readBlobText(write.mock.calls[0][0] as Blob));

    expect(workflowExport.actions).toEqual([
      {
        id: "queued.to_running",
        label: "Queued to Running",
        from: "queued",
        to: "running",
        trigger: "user",
        visible: true,
      },
      {
        id: "running.to_completed",
        label: "Running to Completed",
        from: "running",
        to: "completed",
        trigger: "user",
        visible: true,
      },
      {
        id: "running.to_failed",
        label: "Running to Failed",
        from: "running",
        to: "failed",
        trigger: "user",
        visible: true,
      },
      {
        id: "failed.to_queued",
        label: "Failed to Queued",
        from: "failed",
        to: "queued",
        trigger: "user",
        visible: true,
      },
      {
        id: "queued.to_cancelled",
        label: "Queued to Cancelled",
        from: "queued",
        to: "cancelled",
        trigger: "user",
        visible: true,
      },
      {
        id: "running.to_cancelled",
        label: "Running to Cancelled",
        from: "running",
        to: "cancelled",
        trigger: "user",
        visible: true,
      },
    ]);
  });

  it("leaves existing workflow actions unchanged when Add All Actions overwrite is cancelled", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Add All Actions" }));

    expect(confirm).toHaveBeenCalledWith(
      "Workflow actions already exist. Add all actions will overwrite existing actions. Continue?",
    );
    expect(getWorkflowActionLabelValues()).toEqual(["Start", "Cancel"]);
    expect(
      screen.queryByText("Replaced existing workflow actions with 6 actions from state-machine transitions."),
    ).not.toBeInTheDocument();
  });

  it("overwrites workflow actions and removes only action lifecycle hooks", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });

    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Lifecycle" }));

    const beforeTransitionSection = screen.getByLabelText("Before Transition target").closest("section") as HTMLElement;
    const onStateEntrySection = screen.getByLabelText("On State Entry target").closest("section") as HTMLElement;

    await user.selectOptions(screen.getByLabelText("Before Transition target"), "start");
    await user.click(within(beforeTransitionSection).getByRole("button", { name: "Add Hook" }));
    await user.type(screen.getByLabelText("Main Handler Key"), "run_start");
    await user.selectOptions(screen.getByLabelText("On State Entry target"), "queued");
    await user.click(within(onStateEntrySection).getByRole("button", { name: "Add Hook" }));
    await user.type(screen.getByLabelText("Main Handler Key"), "enter_queued");

    await user.click(getWorkflowActionsTab());
    await user.click(screen.getByRole("button", { name: "Add All Actions" }));

    expect(confirm).toHaveBeenCalledWith(
      "Workflow actions already exist. Add all actions will overwrite existing actions. Continue?",
    );
    expect(screen.getByText("Replaced existing workflow actions with 6 actions from state-machine transitions.")).toBeInTheDocument();
    expect(getWorkflowActionLabelValues()).toEqual(["Queued to Running", "Queued to Cancelled"]);

    await clickWorkflowAction(user, "Export Workflow");

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const workflowExport = JSON.parse(await readBlobText(write.mock.calls[0][0] as Blob));

    expect(workflowExport.actions.map((action: { id: string }) => action.id)).toEqual([
      "queued.to_running",
      "running.to_completed",
      "running.to_failed",
      "failed.to_queued",
      "queued.to_cancelled",
      "running.to_cancelled",
    ]);
    expect(workflowExport.hooks).toEqual([
      {
        id: "on_state_entry_queued",
        phase: "on_state_entry",
        targetType: "state",
        targetId: "queued",
        handlerKey: "enter_queued",
      },
    ]);
  });

  it("uses the fixed workflow state selector to choose the visible action rows", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));

    const selectedState = screen.getByLabelText("Selected State");

    expect(selectedState.closest(".column-scroll")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Action 1 label" })).toHaveValue("Start");
    expect(screen.queryByRole("textbox", { name: "Action 2 label" })).not.toBeInTheDocument();

    await user.selectOptions(selectedState, "running");

    expect(screen.getByRole("textbox", { name: "Action 2 label" })).toHaveValue("Complete");
    expect(screen.getByRole("textbox", { name: "Action 3 label" })).toHaveValue("Fail");
    expect(screen.queryByRole("textbox", { name: "Action 1 label" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Action" }));

    expect(screen.getByLabelText("Action 7 source")).toHaveValue("running");
    expect(screen.getByLabelText("Action 7 target")).toHaveValue("completed");
  });

  it("reorders visible workflow actions by dragging without changing action details", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await screen.findByTestId("mock-mermaid-svg");
    await user.selectOptions(screen.getByLabelText("Selected State"), "running");
    await waitFor(() => {
      expect(screen.queryByText("Rendering preview...")).not.toBeInTheDocument();
    });

    const dataTransfer = createDragDataTransfer();
    const failHandle = screen.getByRole("button", { name: "Drag Fail action" });
    const completeRow = screen.getByRole("listitem", { name: "Complete action row" });

    await act(async () => {
      fireEvent.dragStart(failHandle, { dataTransfer });
      fireEvent.dragEnter(completeRow, { dataTransfer });
      fireEvent.dragOver(completeRow, { dataTransfer });
      fireEvent.drop(completeRow, { dataTransfer });
    });

    expect(getWorkflowActionLabelValues()).toEqual(["Fail", "Complete", "Cancel"]);
    expect(screen.getByLabelText("Selected State")).toHaveValue("running");
    expect(screen.getByLabelText("Action 2 source")).toHaveValue("running");
    expect(screen.getByLabelText("Action 2 target")).toHaveValue("failed");
    expect(screen.getByLabelText("Action 3 source")).toHaveValue("running");
    expect(screen.getByLabelText("Action 3 target")).toHaveValue("completed");
  });

  it("switches to workflow buckets and maps states while retaining the workflow preview", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Buckets" }));

    const mappingPanel = screen.getByRole("heading", { name: "State Mapping" }).closest("section") as HTMLElement;

    expect(screen.getByRole("img", { name: "Workflow Mermaid preview" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Bucket 1 label" })).toHaveValue("Waiting");
    expect(screen.getByRole("textbox", { name: "Bucket 2 label" })).toHaveValue("Active");
    expect(screen.queryByRole("button", { name: /^Waiting$/ })).not.toBeInTheDocument();
    expect(within(mappingPanel).getByText("queued")).toBeInTheDocument();
    expect(within(mappingPanel).queryByText("running")).not.toBeInTheDocument();

    await user.click(screen.getByRole("textbox", { name: "Bucket 2 label" }));

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(within(mappingPanel).getByText("running")).toBeInTheDocument();

    await user.click(screen.getByRole("textbox", { name: "Bucket 1 label" }));
    await user.click(within(mappingPanel).getByRole("button", { name: "Add State" }));
    await user.selectOptions(within(mappingPanel).getByLabelText("State to add"), "running");

    expect(within(mappingPanel).getByText("running")).toBeInTheDocument();

    await user.click(within(mappingPanel).getByRole("button", { name: "Add State" }));
    await user.selectOptions(within(mappingPanel).getByLabelText("State to add"), "running");

    expect(within(mappingPanel).getAllByText("running")).toHaveLength(1);

    const queuedRow = within(mappingPanel).getByText("queued").closest("article") as HTMLElement;
    await user.click(within(queuedRow).getByRole("button", { name: "Remove" }));

    expect(within(mappingPanel).queryByText("queued")).not.toBeInTheDocument();
    await expectWorkflowAction(user, "Export Workflow", true);
    expect(screen.queryByRole("button", { name: "View Issues" })).not.toBeInTheDocument();
  });

  it("focuses workflow preview styling on the selected bucket only in buckets view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));

    await waitFor(async () => {
      const source = await getLastRenderedMermaidSource();

      expect(source).toContain("class running,failed state;");
      expect(source).toContain("class completed,cancelled terminal;");
      expect(source).toContain("class queued entry;");
      expect(source).not.toContain("unfocusedState");
    });

    await user.click(screen.getByRole("button", { name: "Buckets" }));

    await waitFor(async () => {
      const source = await getLastRenderedMermaidSource();

      expect(source).toContain("class queued entry;");
      expect(source).toContain("class running,failed unfocusedState;");
      expect(source).toContain("class completed,cancelled unfocusedTerminal;");
    });

    await user.click(getWorkflowActionsTab());

    await waitFor(async () => {
      const source = await getLastRenderedMermaidSource();

      expect(source).toContain("class running,failed state;");
      expect(source).toContain("class completed,cancelled terminal;");
      expect(source).toContain("class queued entry;");
      expect(source).not.toContain("unfocusedState");
    });
  });

  it("reorders workflow buckets by dragging while preserving the selected bucket mapping", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Buckets" }));

    const mappingPanel = screen.getByRole("heading", { name: "State Mapping" }).closest("section") as HTMLElement;
    const dataTransfer = createDragDataTransfer();
    const finishedHandle = screen.getByRole("button", { name: "Drag Finished bucket" });
    const activeRow = screen.getByRole("listitem", { name: "Active bucket row" });

    fireEvent.dragStart(finishedHandle, { dataTransfer });
    fireEvent.dragEnter(activeRow, { dataTransfer });
    fireEvent.dragOver(activeRow, { dataTransfer });
    fireEvent.drop(activeRow, { dataTransfer });

    expect(getWorkflowBucketLabelValues()).toEqual(["Waiting", "Finished", "Active"]);
    expect(within(mappingPanel).getByText("queued")).toBeInTheDocument();
    expect(within(mappingPanel).queryByText("completed")).not.toBeInTheDocument();
  });

  it("disables workflow export when workflow actions are invalid", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.clear(screen.getByRole("textbox", { name: "Action 1 label" }));

    expect(within(await openWorkflowValidationIssues(user)).getByText(/needs a label/)).toBeInTheDocument();
    await expectWorkflowAction(user, "Export Workflow", false);
    await expectWorkflowAction(user, "Export Bundled Workflow", false);
    await expectWorkflowAction(user, "Save State Machine and Workflow", false);
  });

  it("edits workflow action trigger visibility and keeps handler metadata out of actions", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));

    expect(screen.getByLabelText("Action 1 trigger")).toHaveValue("user");
    expect(screen.getByLabelText("Action 1 visible")).toBeChecked();
    expect(screen.queryByLabelText("Action 1 handler key")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Action 1 trigger"), "automatic");

    expect(screen.getByLabelText("Action 1 visible")).not.toBeChecked();

    await user.click(screen.getByLabelText("Action 1 visible"));

    expect(
      within(await openWorkflowValidationIssues(user)).getByText('Automatic action "start" must be hidden from user controls.'),
    ).toBeInTheDocument();
    await expectWorkflowAction(user, "Export Workflow", false);
    await user.click(screen.getByRole("button", { name: "Close workflow validation issues" }));

    await user.click(screen.getByLabelText("Action 1 visible"));

    await expectWorkflowAction(user, "Export Workflow", true);
  });

  it("adds and edits workflow lifecycle hooks with handler validation", async () => {
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });

    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Lifecycle" }));

    expect(screen.queryByText("No lifecycle hooks for this workflow.")).not.toBeInTheDocument();
    expect(screen.queryByText("No hooks")).not.toBeInTheDocument();

    const beforeTransitionSection = screen.getByLabelText("Before Transition target").closest("section") as HTMLElement;
    const beforeTransitionTarget = screen.getByLabelText("Before Transition target") as HTMLSelectElement;

    expect(Array.from(beforeTransitionTarget.options).map((option) => option.textContent)).toEqual([
      "Start (start)",
      "Complete (complete)",
      "Fail (fail)",
      "Retry (retry)",
      "Cancel (cancel_queued)",
      "Cancel (cancel_running)",
    ]);

    await user.selectOptions(screen.getByLabelText("Before Transition target"), "start");
    await user.click(within(beforeTransitionSection).getByRole("button", { name: "Add Hook" }));

    expect(screen.getByLabelText("Phase")).toHaveValue("Before Transition");
    expect(screen.getByLabelText("Target")).toHaveValue("start");
    expect(screen.getByRole("button", { name: /Start \(start\) No main handler Valid/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Main Handler Key"), "run_start");
    await user.type(screen.getByLabelText("Success Handler Key"), "start_ok");
    await user.type(screen.getByLabelText("Failure Handler Key"), "Start Failed");

    expect(
      within(await openWorkflowValidationIssues(user)).getByText(/handler key must use lowercase letters/),
    ).toBeInTheDocument();
    await expectWorkflowAction(user, "Export Workflow", false);

    await user.click(screen.getByRole("button", { name: "Close workflow validation issues" }));
    await user.clear(screen.getByLabelText("Failure Handler Key"));
    await user.type(screen.getByLabelText("Failure Handler Key"), "start_failed");

    await expectWorkflowAction(user, "Export Workflow", true);

    await clickWorkflowAction(user, "Export Workflow");
    await clickWorkflowAction(user, "Export Bundled Workflow");

    expect(write).toHaveBeenCalledTimes(2);
    const linkedExport = JSON.parse(await readBlobText(write.mock.calls[0][0] as Blob));
    const bundledExport = JSON.parse(await readBlobText(write.mock.calls[1][0] as Blob));
    const expectedHooks = [
      {
        id: "before_transition_start",
        phase: "before_transition",
        targetType: "action",
        targetId: "start",
        handlerKey: "run_start",
        onSuccess: { handlerKey: "start_ok" },
        onFailure: { handlerKey: "start_failed" },
      },
    ];

    expect(linkedExport.hooks).toEqual(expectedHooks);
    expect(bundledExport.hooks).toEqual(expectedHooks);
    expect(bundledExport.embeddedStateMachineDefinition.id).toBe("scan_job_state");

    await user.click(getWorkflowActionsTab());

    expect(screen.getByText("Before transition")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("button", { name: "Lifecycle" })).toHaveClass("active");
    expect(screen.getByLabelText("Main Handler Key")).toHaveValue("run_start");

    await user.click(getWorkflowActionsTab());
    const actionIdInput = screen.getByRole("textbox", { name: "Action 1 ID" });

    await user.clear(actionIdInput);
    await user.type(actionIdInput, "scan.start");
    await user.click(screen.getByRole("button", { name: "Lifecycle" }));

    expect(screen.getByLabelText("Target")).toHaveValue("scan.start");

    await clickWorkflowAction(user, "Export Workflow");
    await waitFor(() => expect(write).toHaveBeenCalledTimes(3));
    const retargetedExport = JSON.parse(await readBlobText(write.mock.calls[2][0] as Blob));

    expect(retargetedExport.hooks[0].targetId).toBe("scan.start");
  });

  it("adds scheduled while-in-state lifecycle hooks and exports retry settings", async () => {
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });

    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Lifecycle" }));

    const whileInStateSection = screen.getByLabelText("While In State target").closest("section") as HTMLElement;

    await user.selectOptions(screen.getByLabelText("While In State target"), "failed");
    await user.click(within(whileInStateSection).getByRole("button", { name: "Add Hook" }));

    expect(screen.getByLabelText("Schedule Trigger")).toHaveValue("every_interval");
    expect(screen.getByLabelText("Schedule Duration")).toHaveValue(15);
    expect(screen.getByLabelText("Schedule Duration Unit")).toHaveValue("minutes");
    expect(screen.getByRole("button", { name: /failed No main handler Issue/ })).toBeInTheDocument();

    expect(
      within(await openWorkflowValidationIssues(user)).getByText(/must define a handler key/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close workflow validation issues" }));

    await user.type(screen.getByLabelText("Main Handler Key"), "check_failed");
    await user.selectOptions(screen.getByLabelText("Schedule Trigger"), "after_duration");
    await user.clear(screen.getByLabelText("Schedule Duration"));
    await user.type(screen.getByLabelText("Schedule Duration"), "2");
    await user.selectOptions(screen.getByLabelText("Schedule Duration Unit"), "hours");
    await user.type(screen.getByLabelText("Retry Max Attempts"), "3");
    await user.type(screen.getByLabelText("Retry Delay Ms"), "60000");

    await expectWorkflowAction(user, "Export Workflow", true);
    await clickWorkflowAction(user, "Export Workflow");

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const workflowExport = JSON.parse(await readBlobText(write.mock.calls[0][0] as Blob));

    expect(workflowExport.schemaVersion).toBe("0.7.0");
    expect(workflowExport.hooks).toEqual([
      {
        id: "while_in_state_failed",
        phase: "while_in_state",
        targetType: "state",
        targetId: "failed",
        handlerKey: "check_failed",
        schedule: { trigger: "after_duration", delayMs: 7200000 },
        retryPolicy: { maxAttempts: 3, delayMs: 60000 },
      },
    ]);
  });

  it("shows retry controls only for while-in-state lifecycle hooks", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Lifecycle" }));

    const beforeTransitionSection = screen.getByLabelText("Before Transition target").closest("section") as HTMLElement;

    await user.selectOptions(screen.getByLabelText("Before Transition target"), "start");
    await user.click(within(beforeTransitionSection).getByRole("button", { name: "Add Hook" }));

    expect(screen.queryByLabelText("Retry Max Attempts")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Retry Delay Ms")).not.toBeInTheDocument();

    const whileInStateSection = screen.getByLabelText("While In State target").closest("section") as HTMLElement;

    await user.selectOptions(screen.getByLabelText("While In State target"), "failed");
    await user.click(within(whileInStateSection).getByRole("button", { name: "Add Hook" }));

    expect(screen.getByLabelText("Retry Max Attempts")).toBeInTheDocument();
    expect(screen.getByLabelText("Retry Delay Ms")).toBeInTheDocument();
  });

  it("shows retry controls for imported unsupported retry metadata so it can be cleared", async () => {
    const user = userEvent.setup();
    render(<App />);

    const json = JSON.stringify({
      schemaVersion: "0.7.0",
      appName: "Article Manager",
      workflowVersion: "1.0.0",
      id: "article_workflow",
      stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
      states: ["queued", "running", "completed", "failed", "cancelled"],
      actions: [],
      buckets: [],
      hooks: [
        {
          id: "entry_running",
          phase: "on_state_entry",
          targetType: "state",
          targetId: "running",
          handlerKey: "check_running",
          retryPolicy: { maxAttempts: 3, delayMs: 1000 },
        },
      ],
    });

    fireEvent.change(screen.getByLabelText("Import workflow JSON definition"), {
      target: { files: [createTextFile(json, "invalid-retry-workflow.json")] },
    });

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Lifecycle" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Workflow ID")).toHaveValue("article_workflow");
    });

    expect(screen.getByLabelText("Retry Max Attempts")).toHaveValue(3);
    expect(screen.getByLabelText("Retry Delay Ms")).toHaveValue(1000);
    expect(
      within(await openWorkflowValidationIssues(user)).getByText(/can only define retry policy for while-in-state hooks/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close workflow validation issues" }));
    await expectWorkflowAction(user, "Export Workflow", false);

    await user.clear(screen.getByLabelText("Retry Max Attempts"));
    await user.clear(screen.getByLabelText("Retry Delay Ms"));

    await expectWorkflowAction(user, "Export Workflow", true);
    expect(screen.queryByLabelText("Retry Max Attempts")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Retry Delay Ms")).not.toBeInTheDocument();
  });

  it("regenerates lifecycle hook IDs when state targets change", async () => {
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });

    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Lifecycle" }));

    const onStateEntrySection = screen.getByLabelText("On State Entry target").closest("section") as HTMLElement;

    await user.selectOptions(screen.getByLabelText("On State Entry target"), "queued");
    await user.click(within(onStateEntrySection).getByRole("button", { name: "Add Hook" }));
    await user.selectOptions(screen.getByLabelText("Target"), "running");

    await clickWorkflowAction(user, "Export Workflow");

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const workflowExport = JSON.parse(await readBlobText(write.mock.calls[0][0] as Blob));

    expect(workflowExport.hooks).toEqual([
      {
        id: "on_state_entry_running",
        phase: "on_state_entry",
        targetType: "state",
        targetId: "running",
      },
    ]);
  });

  it("suffixes regenerated lifecycle hook IDs when another hook already uses the target-derived ID", async () => {
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });
    const json = JSON.stringify({
      schemaVersion: "0.5.0",
      appName: "Article Manager",
      workflowVersion: "1.0.0",
      id: "article_workflow",
      stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
      hooks: [
        {
          id: "on_state_entry_running",
          phase: "while_in_state",
          targetType: "state",
          targetId: "queued",
          handlerKey: "check_queued",
          schedule: { trigger: "every_interval", intervalMs: 900000 },
        },
      ],
    });

    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    render(<App />);

    fireEvent.change(screen.getByLabelText("Import workflow JSON definition"), {
      target: { files: [createTextFile(json, "workflow-with-hook-id-collision.json")] },
    });

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Workflow ID")).toHaveValue("article_workflow");
    });
    await user.click(screen.getByRole("button", { name: "Lifecycle" }));

    const onStateEntrySection = screen.getByLabelText("On State Entry target").closest("section") as HTMLElement;

    await user.selectOptions(screen.getByLabelText("On State Entry target"), "queued");
    await user.click(within(onStateEntrySection).getByRole("button", { name: "Add Hook" }));
    await user.selectOptions(screen.getByLabelText("Target"), "running");

    await clickWorkflowAction(user, "Export Workflow");

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const workflowExport = JSON.parse(await readBlobText(write.mock.calls[0][0] as Blob));

    expect(workflowExport.hooks).toEqual([
      {
        id: "on_state_entry_running",
        phase: "while_in_state",
        targetType: "state",
        targetId: "queued",
        handlerKey: "check_queued",
        schedule: { trigger: "every_interval", intervalMs: 900000 },
      },
      {
        id: "on_state_entry_running_2",
        phase: "on_state_entry",
        targetType: "state",
        targetId: "running",
      },
    ]);
  });

  it("keeps workflow actions valid when workflow buckets and state metadata are hidden", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Buckets" }));

    await user.click(screen.getByLabelText("Bucket 1 visible"));

    await expectWorkflowAction(user, "Export Workflow", true);
    expect(screen.queryByRole("button", { name: "View Issues" })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Bucket 1 visible"));
    await user.click(screen.getByLabelText("queued visible"));

    await expectWorkflowAction(user, "Export Workflow", true);
    expect(screen.queryByRole("button", { name: "View Issues" })).not.toBeInTheDocument();
  });

  it("resets workflow actions and bucket structure from the current state machine", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });

    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await clickWorkflowAction(user, "Reset Workflow");

    expect(confirm).toHaveBeenCalledWith(
      "Reset workflow actions and bucket structure? This removes workflow actions and buckets, but keeps the state machine definition.",
    );
    expect(screen.getByText("Workflow reset from current state machine.")).toBeInTheDocument();
    expect(screen.getByText("No workflow actions for queued.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Buckets" }));

    expect(getWorkflowBucketLabelValues()).toEqual(["Workflow"]);
    const mappingPanel = screen.getByRole("heading", { name: "State Mapping" }).closest("section") as HTMLElement;

    for (const state of ["queued", "running", "completed", "failed", "cancelled"]) {
      expect(within(mappingPanel).getByText(state)).toBeInTheDocument();
    }

    await clickWorkflowAction(user, "Export Workflow");

    const workflowExport = JSON.parse(await readBlobText(write.mock.calls[0][0]));

    expect(workflowExport.id).toBe("scan_job_workflow");
    expect(workflowExport.workflowVersion).toBe("0.1.0");
    expect(workflowExport.actions).toEqual([]);
    expect(workflowExport.hooks).toEqual([]);
    expect(workflowExport.states.map((state: { id: string }) => state.id)).toEqual([
      "queued",
      "running",
      "completed",
      "failed",
      "cancelled",
    ]);
    expect(workflowExport.buckets).toEqual([
      {
        id: "workflow",
        label: "Workflow",
        visible: true,
        states: ["queued", "running", "completed", "failed", "cancelled"],
      },
    ]);
  });

  it("exports linked and bundled workflow definitions", async () => {
    const user = userEvent.setup();
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });

    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    const actionDataTransfer = createDragDataTransfer();
    const cancelActionHandle = screen.getByRole("button", { name: "Drag Cancel action" });
    const startActionRow = screen.getByRole("listitem", { name: "Start action row" });

    fireEvent.dragStart(cancelActionHandle, { dataTransfer: actionDataTransfer });
    fireEvent.dragEnter(startActionRow, { dataTransfer: actionDataTransfer });
    fireEvent.dragOver(startActionRow, { dataTransfer: actionDataTransfer });
    fireEvent.drop(startActionRow, { dataTransfer: actionDataTransfer });

    await user.click(screen.getByRole("button", { name: "Buckets" }));
    const bucketDataTransfer = createDragDataTransfer();
    const finishedBucketHandle = screen.getByRole("button", { name: "Drag Finished bucket" });
    const waitingBucketRow = screen.getByRole("listitem", { name: "Waiting bucket row" });

    fireEvent.dragStart(finishedBucketHandle, { dataTransfer: bucketDataTransfer });
    fireEvent.dragEnter(waitingBucketRow, { dataTransfer: bucketDataTransfer });
    fireEvent.dragOver(waitingBucketRow, { dataTransfer: bucketDataTransfer });
    fireEvent.drop(waitingBucketRow, { dataTransfer: bucketDataTransfer });

    await clickWorkflowAction(user, "Export Workflow");
    await clickWorkflowAction(user, "Export Bundled Workflow");

    await waitFor(() => {
      expect(showSaveFilePicker).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedName: "example-project-0.1.0-workflow-definition.json",
        }),
      );
    });
    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: "example-project-0.1.0-workflow-definition-bundled.json",
      }),
    );
    expect(write).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(2);
    const linkedExport = JSON.parse(await readBlobText(write.mock.calls[0][0] as Blob));
    const bundledExport = JSON.parse(await readBlobText(write.mock.calls[1][0] as Blob));

    expect(linkedExport.schemaVersion).toBe("0.7.0");
    expect(linkedExport.states).toEqual([
      { id: "queued", visible: true },
      { id: "running", visible: true },
      { id: "completed", visible: true },
      { id: "failed", visible: true },
      { id: "cancelled", visible: true },
    ]);
    expect(linkedExport.actions.map((action: { id: string }) => action.id)).toEqual([
      "cancel_queued",
      "complete",
      "fail",
      "retry",
      "start",
      "cancel_running",
    ]);
    expect(linkedExport.actions[0]).toMatchObject({ trigger: "user", visible: true });
    expect(linkedExport.actions[0]).not.toHaveProperty("processing");
    expect(linkedExport.buckets).toEqual([
      { id: "finished", label: "Finished", visible: true, states: ["completed", "cancelled"] },
      { id: "waiting", label: "Waiting", visible: true, states: ["queued"] },
      { id: "active", label: "Active", visible: true, states: ["running", "failed"] },
    ]);
    expect(linkedExport.hooks).toEqual([]);
    expect(bundledExport.actions).toEqual(linkedExport.actions);
    expect(bundledExport.buckets).toEqual(linkedExport.buckets);
    expect(bundledExport.hooks).toEqual(linkedExport.hooks);
    expect(bundledExport.embeddedStateMachineDefinition.id).toBe("scan_job_state");
  });

  it("exports an empty bucket overlay after buckets are removed without changing actions", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const write = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue({ write, close }),
    });

    (
      window as Window & {
        showSaveFilePicker?: typeof showSaveFilePicker;
      }
    ).showSaveFilePicker = showSaveFilePicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Buckets" }));

    for (const bucket of ["Waiting", "Active", "Finished"]) {
      const row = screen.getByRole("listitem", { name: `${bucket} bucket row` });

      await user.click(within(row).getByRole("button", { name: "Remove" }));
    }

    expect(confirm).toHaveBeenCalledTimes(3);
    expect(confirm).toHaveBeenCalledWith(
      "Remove this bucket? Its state assignments will be removed, but workflow actions and the state machine will not change.",
    );
    expect(queryWorkflowBucketLabelValues()).toEqual([]);
    await expectWorkflowAction(user, "Export Workflow", true);

    await user.click(getWorkflowActionsTab());

    expect(getWorkflowActionLabelValues()).toEqual(["Start", "Cancel"]);

    await clickWorkflowAction(user, "Export Workflow");
    await clickWorkflowAction(user, "Export Bundled Workflow");

    const linkedExport = JSON.parse(await readBlobText(write.mock.calls[0][0] as Blob));
    const bundledExport = JSON.parse(await readBlobText(write.mock.calls[1][0] as Blob));

    expect(linkedExport.buckets).toEqual([]);
    expect(bundledExport.buckets).toEqual([]);
    expect(linkedExport.hooks).toEqual([]);
    expect(bundledExport.hooks).toEqual([]);
    expect(linkedExport.actions.map((action: { id: string }) => action.id)).toEqual([
      "start",
      "complete",
      "fail",
      "retry",
      "cancel_queued",
      "cancel_running",
    ]);
    expect(bundledExport.actions).toEqual(linkedExport.actions);
    expect(bundledExport.embeddedStateMachineDefinition.id).toBe("scan_job_state");
  });

  it("imports linked workflow definitions", async () => {
    const user = userEvent.setup();
    render(<App />);

    const json = JSON.stringify({
      schemaVersion: "0.1.0",
      appName: "Article Manager",
      workflowVersion: "1.0.0",
      id: "article_workflow",
      stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
      actions: [{ id: "start", label: "Start", from: "queued", to: "running" }],
    });
    const file = new File([json], "workflow.json", { type: "application/json" });

    Object.defineProperty(file, "text", {
      value: async () => json,
    });

    fireEvent.change(screen.getByLabelText("Import workflow JSON definition"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Workflow" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Workflow ID")).toHaveValue("article_workflow");
    });
    expect(screen.getByLabelText("Workflow Version")).toHaveValue("1.0.0");
    expect(screen.getByLabelText("Action 1 trigger")).toHaveValue("user");
    expect(screen.getByLabelText("Action 1 visible")).toBeChecked();
    await expectWorkflowAction(user, "Export Workflow", true);

    fireEvent.click(screen.getByRole("button", { name: "Buckets" }));
    expect(queryWorkflowBucketLabelValues()).toEqual([]);
    expect(screen.getByText("No bucket selected")).toBeInTheDocument();
    expect(screen.getByText("Add a workflow bucket to map states.")).toBeInTheDocument();
  });

  it("imports legacy action processing as before-transition lifecycle hooks", async () => {
    const user = userEvent.setup();
    render(<App />);

    const json = JSON.stringify({
      schemaVersion: "0.4.0",
      appName: "Article Manager",
      workflowVersion: "1.0.0",
      id: "article_workflow",
      stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
      states: ["queued", "running", "completed", "failed", "cancelled"],
      actions: [
        {
          id: "start",
          label: "Start",
          from: "queued",
          to: "running",
          trigger: "user",
          visible: true,
          processing: { handlerKey: "start_scan" },
        },
      ],
      buckets: [],
    });

    fireEvent.change(screen.getByLabelText("Import workflow JSON definition"), {
      target: { files: [createTextFile(json, "legacy-workflow.json")] },
    });

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Lifecycle" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Main Handler Key")).toHaveValue("start_scan");
    });
    expect(screen.getByLabelText("Phase")).toHaveValue("Before Transition");
    expect(screen.getByLabelText("Target")).toHaveValue("start");

    await user.click(getWorkflowActionsTab());

    expect(screen.getByText("Before transition")).toBeInTheDocument();
    expect(screen.queryByLabelText("Action 1 handler key")).not.toBeInTheDocument();
  });

  it("preserves invalid imported schedule fields for validation", async () => {
    const user = userEvent.setup();
    render(<App />);

    const json = JSON.stringify({
      schemaVersion: "0.7.0",
      appName: "Article Manager",
      workflowVersion: "1.0.0",
      id: "article_workflow",
      stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
      states: ["queued", "running", "completed", "failed", "cancelled"],
      actions: [],
      buckets: [],
      hooks: [
        {
          id: "while_running",
          phase: "while_in_state",
          targetType: "state",
          targetId: "running",
          handlerKey: "check_running",
          schedule: { trigger: "every_interval", intervalMs: "soon" },
        },
      ],
    });

    fireEvent.change(screen.getByLabelText("Import workflow JSON definition"), {
      target: { files: [createTextFile(json, "invalid-scheduled-workflow.json")] },
    });

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Lifecycle" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Workflow ID")).toHaveValue("article_workflow");
    });
    expect(screen.getByLabelText("Schedule Trigger")).toHaveValue("every_interval");
    expect(screen.getByLabelText("Schedule Duration")).toHaveValue(null);
    expect(
      within(await openWorkflowValidationIssues(user)).getByText(/schedule intervalMs must be a positive integer/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close workflow validation issues" }));
    await expectWorkflowAction(user, "Export Workflow", false);
  });

  it("imports linked workflow definitions with explicit empty bucket overlays", async () => {
    const user = userEvent.setup();
    render(<App />);

    const json = JSON.stringify({
      schemaVersion: "0.4.0",
      appName: "Article Manager",
      workflowVersion: "1.0.0",
      id: "article_workflow",
      stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
      states: ["queued", "running", "completed", "failed", "cancelled"],
      actions: [{ id: "start", label: "Start", from: "queued", to: "running", trigger: "user", visible: true }],
      buckets: [],
    });
    const file = new File([json], "workflow-empty-buckets.json", { type: "application/json" });

    Object.defineProperty(file, "text", {
      value: async () => json,
    });

    fireEvent.change(screen.getByLabelText("Import workflow JSON definition"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Workflow" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Workflow ID")).toHaveValue("article_workflow");
    });
    await expectWorkflowAction(user, "Export Workflow", true);

    fireEvent.click(screen.getByRole("button", { name: "Buckets" }));
    expect(queryWorkflowBucketLabelValues()).toEqual([]);
    expect(screen.getByText("Add a workflow bucket to map states.")).toBeInTheDocument();
  });

  it("imports linked workflow definitions from the workflow drop zone", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));

    const json = JSON.stringify({
      schemaVersion: "0.3.0",
      appName: "Article Manager",
      workflowVersion: "1.0.0",
      id: "article_workflow",
      stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
      states: ["queued", "running", "completed", "failed", "cancelled"],
      actions: [{ id: "start", label: "Start", from: "queued", to: "running", trigger: "user", visible: true }],
      buckets: [{ id: "workflow", label: "Workflow", visible: true, states: ["queued", "running", "completed", "failed", "cancelled"] }],
    });
    const dropZone = screen.getByRole("button", { name: /Workflow JSON/ });

    fireEvent.drop(dropZone, {
      dataTransfer: createFileDataTransfer(createTextFile(json, "article-workflow.json", "application/json")),
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Workflow ID")).toHaveValue("article_workflow");
    });
    expect(screen.getByLabelText("Target App")).toHaveValue("Article Manager");
    await expectWorkflowAction(user, "Export Workflow", true);
  });

  it("imports bundled workflow definitions and loads the embedded state machine", async () => {
    render(<App />);

    const json = JSON.stringify({
      schemaVersion: "0.1.0",
      appName: "Article Manager",
      workflowVersion: "1.0.0",
      id: "article_workflow",
      stateMachine: { id: "article_state", definitionVersion: "2.0.0" },
      embeddedStateMachineDefinition: {
        schemaVersion: "0.2.0",
        appName: "Article Manager",
        definitionVersion: "2.0.0",
        id: "article_state",
        states: ["draft", "published"],
        terminalStates: ["published"],
        transitions: [{ from: "draft", to: "published" }],
      },
      actions: [{ id: "publish", label: "Publish", from: "draft", to: "published" }],
    });
    const file = new File([json], "workflow-bundled.json", { type: "application/json" });

    Object.defineProperty(file, "text", {
      value: async () => json,
    });

    fireEvent.change(screen.getByLabelText("Import workflow JSON definition"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("State Machine ID")).toHaveValue("article_state");
    });
    await waitFor(() => {
      expect(screen.queryByText("Rendering preview...")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Workflow" }));
    expect(screen.getByLabelText("State Machine")).toHaveValue("article_state@2.0.0");
    expect(screen.getByLabelText("Workflow ID")).toHaveValue("article_workflow");
    await waitFor(() => {
      expect(screen.queryByText("Rendering preview...")).not.toBeInTheDocument();
    });
  });

  it("imports bundled workflow definitions from the workflow drop zone", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));

    const json = JSON.stringify({
      schemaVersion: "0.3.0",
      appName: "Article Manager",
      workflowVersion: "1.0.0",
      id: "article_workflow",
      stateMachine: { id: "article_state", definitionVersion: "2.0.0" },
      embeddedStateMachineDefinition: {
        schemaVersion: "0.2.0",
        appName: "Article Manager",
        definitionVersion: "2.0.0",
        id: "article_state",
        states: ["draft", "published"],
        terminalStates: ["published"],
        transitions: [{ from: "draft", to: "published" }],
      },
      states: ["draft", "published"],
      actions: [{ id: "publish", label: "Publish", from: "draft", to: "published", trigger: "user", visible: true }],
      buckets: [{ id: "workflow", label: "Workflow", visible: true, states: ["draft", "published"] }],
    });

    fireEvent.drop(screen.getByRole("button", { name: /Workflow JSON/ }), {
      dataTransfer: createFileDataTransfer(createTextFile(json, "article-workflow-bundled.json", "application/json")),
    });

    await waitFor(() => {
      expect(screen.getByLabelText("State Machine")).toHaveValue("article_state@2.0.0");
    });
    expect(screen.getByLabelText("Workflow ID")).toHaveValue("article_workflow");
    expect(screen.getByLabelText("Target App")).toHaveValue("Article Manager");

    await user.click(screen.getByRole("button", { name: "State Machine" }));

    expect(screen.getByLabelText("State Machine ID")).toHaveValue("article_state");
  });

  it("imports state-machine definitions from the workflow drop zone", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));

    const json = JSON.stringify({
      schemaVersion: "0.2.0",
      appName: "Article Manager",
      definitionVersion: "1.2.3",
      id: "article_state",
      states: ["draft", "published"],
      terminalStates: ["published"],
      transitions: [{ from: "draft", to: "published" }],
    });

    fireEvent.drop(screen.getByRole("button", { name: /Workflow JSON/ }), {
      dataTransfer: createFileDataTransfer(createTextFile(json, "article-state.json", "application/json")),
    });

    await waitFor(() => {
      expect(screen.getByLabelText("State Machine")).toHaveValue("article_state@1.2.3");
    });
    expect(screen.getByLabelText("Target App")).toHaveValue("Article Manager");
    expect(screen.getByText(/Workflow synced to current state machine/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "State Machine" }));

    expect(screen.getByLabelText("Target App")).toHaveValue("Article Manager");
    expect(screen.getByLabelText("State Machine ID")).toHaveValue("article_state");
  });
});
