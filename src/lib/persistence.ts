import { StateMachineDefinition } from "./stateMachine";
import { StateWorkflowDefinitionBundle } from "./stateWorkflowDefinition";
import { WorkflowDefinition } from "./workflow";

export const STORAGE_SCHEMA_VERSION = 2;
export const CURRENT_WORKSPACE_DRAFT_KEY = "current_workspace";

const databaseName = "state-workflow-editor-library";
const draftsStoreName = "drafts";
const stateMachinesStoreName = "stateMachineDefinitions";
const workflowsStoreName = "workflowDefinitions";
const stateWorkflowDefinitionsStoreName = "stateWorkflowDefinitions";
const workflowStateMachineIndexName = "stateMachineKey";

export type CurrentWorkspaceDraft<State extends string = string> = {
  key: typeof CURRENT_WORKSPACE_DRAFT_KEY;
  storageSchemaVersion: typeof STORAGE_SCHEMA_VERSION;
  definition: StateMachineDefinition<State>;
  workflow: WorkflowDefinition<State>;
  activePage?: string;
  selectedWorkflowView?: string;
  savedAt: string;
};

export type PersistedStateMachineDefinition<State extends string = string> = {
  key: string;
  storageSchemaVersion: typeof STORAGE_SCHEMA_VERSION;
  definition: StateMachineDefinition<State>;
  savedAt: string;
};

export type PersistedWorkflowDefinition<State extends string = string> = {
  key: string;
  stateMachineKey: string;
  storageSchemaVersion: typeof STORAGE_SCHEMA_VERSION;
  definition: WorkflowDefinition<State>;
  savedAt: string;
};

export type PersistedStateWorkflowDefinition<State extends string = string> = {
  key: string;
  storageSchemaVersion: typeof STORAGE_SCHEMA_VERSION;
  definition: StateWorkflowDefinitionBundle<State>;
  savedAt: string;
};

export type DefinitionLibraryStorage = {
  loadCurrentWorkspaceDraft: () => Promise<CurrentWorkspaceDraft | null>;
  saveCurrentWorkspaceDraft: (
    draft: Omit<CurrentWorkspaceDraft, "key" | "storageSchemaVersion" | "savedAt">,
  ) => Promise<CurrentWorkspaceDraft>;
  listStateWorkflowDefinitions: () => Promise<PersistedStateWorkflowDefinition[]>;
  getStateWorkflowDefinition: (key: string) => Promise<PersistedStateWorkflowDefinition | null>;
  saveStateWorkflowDefinition: (
    definition: StateWorkflowDefinitionBundle<string>,
  ) => Promise<PersistedStateWorkflowDefinition>;
  deleteStateWorkflowDefinition: (key: string) => Promise<void>;
  listStateMachineDefinitions: () => Promise<PersistedStateMachineDefinition[]>;
  getStateMachineDefinition: (key: string) => Promise<PersistedStateMachineDefinition | null>;
  saveStateMachineDefinition: (
    definition: StateMachineDefinition<string>,
  ) => Promise<PersistedStateMachineDefinition>;
  deleteStateMachineDefinition: (key: string) => Promise<void>;
  listWorkflowDefinitions: () => Promise<PersistedWorkflowDefinition[]>;
  listWorkflowDefinitionsForStateMachine: (stateMachineKey: string) => Promise<PersistedWorkflowDefinition[]>;
  getWorkflowDefinition: (key: string) => Promise<PersistedWorkflowDefinition | null>;
  saveWorkflowDefinition: (definition: WorkflowDefinition<string>) => Promise<PersistedWorkflowDefinition>;
  deleteWorkflowDefinition: (key: string) => Promise<void>;
};

export function buildStateMachineDefinitionKey(
  definitionOrReference: Pick<StateMachineDefinition<string>, "id" | "definitionVersion">,
): string {
  return `stateMachine:${definitionOrReference.id}@${definitionOrReference.definitionVersion}`;
}

export function buildWorkflowDefinitionKey(
  workflow: Pick<WorkflowDefinition<string>, "id" | "workflowVersion" | "stateMachine">,
): string {
  return `${buildWorkflowParentKey(workflow.stateMachine)}/${workflow.id}@${workflow.workflowVersion}`;
}

export function buildWorkflowParentKey(
  stateMachineReference: Pick<StateMachineDefinition<string>, "id" | "definitionVersion">,
): string {
  return `workflow:${stateMachineReference.id}@${stateMachineReference.definitionVersion}`;
}

export function buildWorkflowStateMachineKey(
  stateMachineReference: Pick<StateMachineDefinition<string>, "id" | "definitionVersion">,
): string {
  return buildStateMachineDefinitionKey(stateMachineReference);
}

export function buildStateWorkflowDefinitionKey(
  definitionOrReference: Pick<StateWorkflowDefinitionBundle<string>, "id" | "definitionVersion">,
): string {
  return `stateWorkflowDefinition:${definitionOrReference.id}@${definitionOrReference.definitionVersion}`;
}

export function createDefinitionLibraryStorage(indexedDb: IDBFactory = window.indexedDB): DefinitionLibraryStorage {
  return new IndexedDbDefinitionLibraryStorage(indexedDb);
}

class IndexedDbDefinitionLibraryStorage implements DefinitionLibraryStorage {
  private readonly indexedDb: IDBFactory;
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(indexedDb: IDBFactory) {
    this.indexedDb = indexedDb;
  }

  async loadCurrentWorkspaceDraft() {
    return this.getRecord<CurrentWorkspaceDraft>(draftsStoreName, CURRENT_WORKSPACE_DRAFT_KEY);
  }

  async saveCurrentWorkspaceDraft(
    draft: Omit<CurrentWorkspaceDraft, "key" | "storageSchemaVersion" | "savedAt">,
  ): Promise<CurrentWorkspaceDraft> {
    const record: CurrentWorkspaceDraft = {
      ...cloneJson(draft),
      key: CURRENT_WORKSPACE_DRAFT_KEY,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
    };

    await this.putRecord(draftsStoreName, record);
    return record;
  }

  async listStateWorkflowDefinitions() {
    const records = await this.getAllRecords<PersistedStateWorkflowDefinition>(stateWorkflowDefinitionsStoreName);

    return records.sort((left, right) => compareDefinitionRecords(left, right));
  }

  async getStateWorkflowDefinition(key: string) {
    return this.getRecord<PersistedStateWorkflowDefinition>(stateWorkflowDefinitionsStoreName, key);
  }

  async saveStateWorkflowDefinition(definition: StateWorkflowDefinitionBundle<string>) {
    const record: PersistedStateWorkflowDefinition = {
      key: buildStateWorkflowDefinitionKey(definition),
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      definition: cloneJson(definition),
      savedAt: new Date().toISOString(),
    };

    await this.putRecord(stateWorkflowDefinitionsStoreName, record);
    return record;
  }

  async deleteStateWorkflowDefinition(key: string) {
    await this.deleteRecord(stateWorkflowDefinitionsStoreName, key);
  }

  async listStateMachineDefinitions() {
    const records = await this.getAllRecords<PersistedStateMachineDefinition>(stateMachinesStoreName);

    return records.sort((left, right) => compareDefinitionRecords(left, right));
  }

  async getStateMachineDefinition(key: string) {
    return this.getRecord<PersistedStateMachineDefinition>(stateMachinesStoreName, key);
  }

  async saveStateMachineDefinition(definition: StateMachineDefinition<string>) {
    const record: PersistedStateMachineDefinition = {
      key: buildStateMachineDefinitionKey(definition),
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      definition: cloneJson(definition),
      savedAt: new Date().toISOString(),
    };

    await this.putRecord(stateMachinesStoreName, record);
    return record;
  }

  async deleteStateMachineDefinition(key: string) {
    await this.deleteRecord(stateMachinesStoreName, key);
  }

  async listWorkflowDefinitions() {
    const records = await this.getAllRecords<PersistedWorkflowDefinition>(workflowsStoreName);

    return records.sort((left, right) => compareDefinitionRecords(left, right));
  }

  async listWorkflowDefinitionsForStateMachine(stateMachineKey: string) {
    const database = await this.openDatabase();
    const transaction = database.transaction(workflowsStoreName, "readonly");
    const index = transaction.objectStore(workflowsStoreName).index(workflowStateMachineIndexName);
    const records = await requestToPromise<PersistedWorkflowDefinition[]>(index.getAll(stateMachineKey));

    return records.sort((left, right) => compareDefinitionRecords(left, right));
  }

  async getWorkflowDefinition(key: string) {
    return this.getRecord<PersistedWorkflowDefinition>(workflowsStoreName, key);
  }

  async saveWorkflowDefinition(definition: WorkflowDefinition<string>) {
    const record: PersistedWorkflowDefinition = {
      key: buildWorkflowDefinitionKey(definition),
      stateMachineKey: buildWorkflowStateMachineKey(definition.stateMachine),
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      definition: cloneJson(definition),
      savedAt: new Date().toISOString(),
    };

    await this.putRecord(workflowsStoreName, record);
    return record;
  }

  async deleteWorkflowDefinition(key: string) {
    await this.deleteRecord(workflowsStoreName, key);
  }

  private async getRecord<RecordType>(storeName: string, key: string): Promise<RecordType | null> {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, "readonly");
    const result = await requestToPromise<RecordType | undefined>(transaction.objectStore(storeName).get(key));

    return result ?? null;
  }

  private async getAllRecords<RecordType>(storeName: string): Promise<RecordType[]> {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, "readonly");

    return requestToPromise<RecordType[]>(transaction.objectStore(storeName).getAll());
  }

  private async putRecord(storeName: string, record: { key: string }) {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, "readwrite");

    transaction.objectStore(storeName).put(record);
    await transactionToPromise(transaction);
  }

  private async deleteRecord(storeName: string, key: string) {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, "readwrite");

    transaction.objectStore(storeName).delete(key);
    await transactionToPromise(transaction);
  }

  private openDatabase() {
    this.databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.indexedDb.open(databaseName, STORAGE_SCHEMA_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(draftsStoreName)) {
          database.createObjectStore(draftsStoreName, { keyPath: "key" });
        }

        if (!database.objectStoreNames.contains(stateMachinesStoreName)) {
          database.createObjectStore(stateMachinesStoreName, { keyPath: "key" });
        }

        if (!database.objectStoreNames.contains(workflowsStoreName)) {
          const workflowStore = database.createObjectStore(workflowsStoreName, { keyPath: "key" });
          workflowStore.createIndex(workflowStateMachineIndexName, workflowStateMachineIndexName, { unique: false });
        } else {
          const transaction = request.transaction;
          const workflowStore = transaction?.objectStore(workflowsStoreName);

          if (workflowStore && !workflowStore.indexNames.contains(workflowStateMachineIndexName)) {
            workflowStore.createIndex(workflowStateMachineIndexName, workflowStateMachineIndexName, { unique: false });
          }
        }

        if (!database.objectStoreNames.contains(stateWorkflowDefinitionsStoreName)) {
          database.createObjectStore(stateWorkflowDefinitionsStoreName, { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open definition library."));
      request.onblocked = () => reject(new Error("Definition library upgrade is blocked by another open tab."));
    });

    return this.databasePromise;
  }
}

function requestToPromise<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function compareDefinitionRecords(
  left: Pick<PersistedStateMachineDefinition | PersistedWorkflowDefinition, "key" | "savedAt">,
  right: Pick<PersistedStateMachineDefinition | PersistedWorkflowDefinition, "key" | "savedAt">,
) {
  const keyComparison = left.key.localeCompare(right.key);

  if (keyComparison !== 0) {
    return keyComparison;
  }

  return left.savedAt.localeCompare(right.savedAt);
}

function cloneJson<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}
