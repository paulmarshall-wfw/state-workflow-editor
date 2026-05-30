import { describe, expect, it } from "vitest";
import {
  buildStateMachineDefinitionKey,
  buildWorkflowDefinitionKey,
  buildWorkflowStateMachineKey,
  createDefinitionLibraryStorage,
} from "./persistence";
import { StateMachineDefinition } from "./stateMachine";
import { WORKFLOW_SCHEMA_VERSION, WorkflowDefinition } from "./workflow";

const stateMachineDefinition: StateMachineDefinition<string> = {
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
};

const workflowDefinition: WorkflowDefinition<string> = {
  schemaVersion: WORKFLOW_SCHEMA_VERSION,
  appName: "Example Project",
  workflowVersion: "0.1.0",
  id: "scan_job_workflow",
  stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
  states: [
    { id: "queued", visible: true },
    { id: "running", visible: true },
    { id: "completed", visible: true },
  ],
  actions: [{ id: "start", label: "Start", from: "queued", to: "running", trigger: "user", visible: true }],
  buckets: [{ id: "workflow", label: "Workflow", visible: true, states: ["queued", "running", "completed"] }],
  hooks: [
    {
      id: "before_start",
      phase: "before_transition",
      targetType: "action",
      targetId: "start",
      handlerKey: "prepare_start",
    },
  ],
};

describe("persistence keys", () => {
  it("builds stable composite keys for state machines and workflows", () => {
    expect(buildStateMachineDefinitionKey(stateMachineDefinition)).toBe("stateMachine:scan_job_state@0.1.0");
    expect(buildWorkflowStateMachineKey(workflowDefinition.stateMachine)).toBe("stateMachine:scan_job_state@0.1.0");
    expect(buildWorkflowDefinitionKey(workflowDefinition)).toBe(
      "workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0",
    );
  });
});

describe("IndexedDB definition library storage", () => {
  it("saves drafts without polluting the saved definition library", async () => {
    const storage = createDefinitionLibraryStorage(createFakeIndexedDb());

    await storage.saveCurrentWorkspaceDraft({
      definition: stateMachineDefinition,
      workflow: workflowDefinition,
      activePage: "workflow",
      selectedWorkflowView: "lifecycle",
    });

    const draft = await storage.loadCurrentWorkspaceDraft();

    expect(draft?.definition.id).toBe("scan_job_state");
    expect(draft?.workflow.hooks).toHaveLength(1);
    expect(draft?.activePage).toBe("workflow");
    expect(await storage.listStateMachineDefinitions()).toEqual([]);
    expect(await storage.listWorkflowDefinitions()).toEqual([]);
  });

  it("stores state-machine versions and parent-scoped workflows", async () => {
    const storage = createDefinitionLibraryStorage(createFakeIndexedDb());
    const stateMachineRecord = await storage.saveStateMachineDefinition(stateMachineDefinition);
    const workflowRecord = await storage.saveWorkflowDefinition(workflowDefinition);

    expect(stateMachineRecord.key).toBe("stateMachine:scan_job_state@0.1.0");
    expect(workflowRecord.key).toBe("workflow:scan_job_state@0.1.0/scan_job_workflow@0.1.0");
    expect(workflowRecord.stateMachineKey).toBe(stateMachineRecord.key);

    const savedStateMachines = await storage.listStateMachineDefinitions();
    const savedWorkflows = await storage.listWorkflowDefinitionsForStateMachine(stateMachineRecord.key);

    expect(savedStateMachines.map((record) => record.key)).toEqual([stateMachineRecord.key]);
    expect(savedWorkflows.map((record) => record.key)).toEqual([workflowRecord.key]);
    expect(savedWorkflows[0].definition.actions).toEqual(workflowDefinition.actions);
    expect(savedWorkflows[0].definition.buckets).toEqual(workflowDefinition.buckets);
    expect(savedWorkflows[0].definition.hooks).toEqual(workflowDefinition.hooks);
  });

  it("overwrites records by composite key and deletes them explicitly", async () => {
    const storage = createDefinitionLibraryStorage(createFakeIndexedDb());

    await storage.saveStateMachineDefinition(stateMachineDefinition);
    await storage.saveStateMachineDefinition({ ...stateMachineDefinition, appName: "Updated Project" });

    expect((await storage.getStateMachineDefinition("stateMachine:scan_job_state@0.1.0"))?.definition.appName).toBe(
      "Updated Project",
    );

    await storage.deleteStateMachineDefinition("stateMachine:scan_job_state@0.1.0");

    expect(await storage.getStateMachineDefinition("stateMachine:scan_job_state@0.1.0")).toBeNull();
  });
});

function createFakeIndexedDb(): IDBFactory {
  const database = new FakeDatabase();

  return {
    open: (_name: string, _version?: number) => {
      const request = new FakeOpenRequest(database);

      queueMicrotask(() => {
        request.result = database as unknown as IDBDatabase;
        request.transaction = new FakeTransaction(database) as unknown as IDBTransaction;
        request.onupgradeneeded?.({} as IDBVersionChangeEvent);
        request.onsuccess?.({} as Event);
      });

      return request as unknown as IDBOpenDBRequest;
    },
  } as IDBFactory;
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
