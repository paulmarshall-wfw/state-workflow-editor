import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function getWorkflowBucketLabelValues() {
  return screen
    .getAllByRole("textbox", { name: /^Bucket \d+ label$/ })
    .map((input) => (input as HTMLInputElement).value);
}

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
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
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("renders the initial valid definition and Mermaid preview", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "State Workflow Editor" })).toBeInTheDocument();
    expect(screen.queryByText("State Machine Core")).not.toBeInTheDocument();
    expect(screen.getByText("v0.0.2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "State Machine" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workflow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Target Project")).toHaveValue("Example Project");
    expect(screen.getByLabelText("State Machine Version")).toHaveValue("0.1.0");
    expect(screen.getByText("Valid")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "State machine Mermaid preview" })).toBeInTheDocument();
    expect(await screen.findByTestId("mock-mermaid-svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export State Machine" })).toBeEnabled();
  });

  it("generates Mermaid source with directed transitions and terminal-state styling", () => {
    const definition = {
      schemaVersion: "0.2.0",
      appName: "Example Project",
      definitionVersion: "0.1.0",
      id: "scan_job_state",
      states: ["queued", "running", "completed"],
      terminalStates: ["completed"],
      transitions: [
        { from: "queued", to: "running" },
        { from: "running", to: "completed" },
      ],
    } as const;
    const source = buildMermaidDiagram(definition);
    const darkSource = buildMermaidDiagram(definition, "dark");

    expect(source).toContain("flowchart LR");
    expect(source).toContain("queued --> running");
    expect(source).toContain("running --> completed");
    expect(source).toContain("classDef state fill:#eef2f5");
    expect(source).toContain("class completed terminal;");
    expect(darkSource).toContain("classDef state fill:#182028");
    expect(darkSource).toContain("color:#eef3f7");
  });

  it("generates workflow Mermaid source with action-labelled transitions", () => {
    const definition = {
      schemaVersion: "0.2.0",
      appName: "Example Project",
      definitionVersion: "0.1.0",
      id: "scan_job_state",
      states: ["queued", "running"],
      terminalStates: [],
      transitions: [{ from: "queued", to: "running" }],
    } as const;
    const workflow = {
      schemaVersion: "0.2.0",
      appName: "Example Project",
      workflowVersion: "0.1.0",
      id: "scan_job_workflow",
      stateMachine: { id: "scan_job_state", definitionVersion: "0.1.0" },
      actions: [{ id: "start", label: "Start", from: "queued", to: "running" }],
      buckets: [{ id: "workflow", label: "Workflow", states: ["queued", "running"] }],
    } as const;

    expect(buildWorkflowMermaidDiagram(definition, workflow)).toContain("queued -->|start| running");
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

  it("validates app name and state definition version", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.clear(screen.getByLabelText("Target Project"));
    await user.clear(screen.getByLabelText("State Machine Version"));
    await user.type(screen.getByLabelText("State Machine Version"), "draft");

    expect(screen.getByText("App name is required.")).toBeInTheDocument();
    expect(screen.getByText("State definition version must use a numbered SemVer value such as 0.1.0.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export State Machine" })).toBeDisabled();
  });

  it("adds states and terminal states through the editor", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add State" }));
    const stateInput = screen.getByRole("textbox", { name: "State 6 ID" });

    await user.clear(stateInput);
    await user.type(stateInput, "archived");
    await user.click(screen.getByRole("checkbox", { name: "archived terminal" }));

    expect(stateInput).toHaveValue("archived");
    expect(screen.getByRole("checkbox", { name: "archived terminal" })).toBeChecked();
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
    expect(screen.getByRole("button", { name: "queued" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("checkbox", { name: "completed terminal" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "cancelled terminal" })).toBeChecked();
    expect(screen.getByLabelText("Transition 1 target")).toHaveValue("running");
  });

  it("reorders states with keyboard move controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("button", { name: "Move queued up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move cancelled down" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Move running up" }));

    expect(getStateInputValues()).toEqual(["running", "queued", "completed", "failed", "cancelled"]);
    expect(screen.getByRole("button", { name: "queued" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Move queued down" }));

    expect(getStateInputValues()).toEqual(["running", "completed", "queued", "failed", "cancelled"]);
    expect(screen.getByRole("button", { name: "queued" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows validation errors and disables export for terminal outgoing transitions", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("checkbox", { name: "queued terminal" }));

    expect(screen.getAllByText(/Terminal state "queued" cannot have outgoing transitions/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Export State Machine" })).toBeDisabled();
    expect(screen.queryByRole("img", { name: "State machine Mermaid preview" })).not.toBeInTheDocument();
  });

  it("imports a valid JSON definition", async () => {
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
    expect(screen.getByLabelText("Target Project")).toHaveValue("Article Manager");
    expect(screen.getByLabelText("State Machine Version")).toHaveValue("1.2.3");
    expect(screen.getByRole("textbox", { name: "State 1 ID" })).toHaveValue("draft");
    expect(screen.getByText("Valid")).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Export State Machine" }));

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

    await user.click(screen.getByRole("button", { name: "Move failed up" }));
    await user.click(screen.getByRole("button", { name: "Move failed up" }));
    await user.click(screen.getByRole("button", { name: "Export State Machine" }));

    await waitFor(() => {
      expect(write).toHaveBeenCalledWith(expect.any(Blob));
    });

    const exported = JSON.parse(await readBlobText(write.mock.calls[0][0] as Blob));

    expect(exported.states).toEqual(["queued", "failed", "running", "completed", "cancelled"]);
    expect(exported.terminalStates).toEqual(["completed", "cancelled"]);
    expect(exported.transitions).toContainEqual({ from: "queued", to: "running" });
    expect(exported.transitions).toContainEqual({ from: "running", to: "failed" });
    expect(close).toHaveBeenCalled();
  });

  it("uses package.json name from the folder picker for both target project fields", async () => {
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

    await user.click(screen.getByRole("button", { name: "Choose project folder" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Target Project")).toHaveValue("state-workflow-engine");
    });
    expect(screen.getByText('Selected project "state-workflow-engine" from package.json.')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Workflow" }));

    expect(screen.getByLabelText("Target Project")).toHaveValue("state-workflow-engine");
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

    await user.click(screen.getByRole("button", { name: "Choose project folder" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Target Project")).toHaveValue("state-workflow-engine");
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

    await user.click(screen.getByRole("button", { name: "Choose project folder" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Target Project")).toHaveValue("selected-project");
    });
    expect(screen.getByText('Selected project "selected-project" from selected folder.')).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Choose project folder" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Target Project")).toHaveValue("dashboard-project");
    });
    expect(screen.getByText('Selected project "dashboard-project" from .app-dashboard.json.')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Choose project folder" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Target Project")).toHaveValue("another-folder");
    });
    expect(screen.getByText('Selected project "another-folder" from selected folder.')).toBeInTheDocument();
  });

  it("keeps existing target project values when folder picking is unsupported or cancelled", async () => {
    const user = userEvent.setup();

    delete (
      window as Window & {
        showDirectoryPicker?: unknown;
      }
    ).showDirectoryPicker;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Choose project folder" }));

    expect(screen.getByLabelText("Target Project")).toHaveValue("Example Project");
    expect(
      screen.getByText("Folder picker is not supported in this browser. Type the target project name manually."),
    ).toBeInTheDocument();

    const showDirectoryPicker = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));

    (
      window as Window & {
        showDirectoryPicker?: typeof showDirectoryPicker;
      }
    ).showDirectoryPicker = showDirectoryPicker;

    await user.click(screen.getByRole("button", { name: "Choose project folder" }));

    expect(screen.getByLabelText("Target Project")).toHaveValue("Example Project");
    expect(screen.getByText("Project selection cancelled.")).toBeInTheDocument();
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

    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    vi.spyOn(anchor, "click").mockImplementation(click);

    await user.click(screen.getByRole("button", { name: "Export State Machine" }));

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
    expect(screen.getByText("Button Label")).toBeInTheDocument();
    expect(screen.getByText("From State")).toBeInTheDocument();
    expect(screen.getByText("To State")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Action 1 ID" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Workflow Mermaid preview" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Action" }));
    const actionInput = screen.getByRole("textbox", { name: "Action 7 label" });

    await user.clear(actionInput);
    await user.type(actionInput, "Pause");

    expect(actionInput).toHaveValue("Pause");
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

  it("reorders visible workflow actions with keyboard controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await screen.findByTestId("mock-mermaid-svg");
    await user.selectOptions(screen.getByLabelText("Selected State"), "running");
    await waitFor(() => {
      expect(screen.queryByText("Rendering preview...")).not.toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Move Complete action up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Cancel action down" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Move Fail action up" }));

    expect(getWorkflowActionLabelValues()).toEqual(["Fail", "Complete", "Cancel"]);

    await user.click(screen.getByRole("button", { name: "Move Complete action down" }));

    expect(getWorkflowActionLabelValues()).toEqual(["Fail", "Cancel", "Complete"]);
    expect(screen.getByLabelText("Selected State")).toHaveValue("running");
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
    expect(screen.getByText('State "queued" must be assigned to one workflow bucket.')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export Workflow" })).toBeDisabled();
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

  it("reorders workflow buckets with keyboard controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.click(screen.getByRole("button", { name: "Buckets" }));

    const mappingPanel = screen.getByRole("heading", { name: "State Mapping" }).closest("section") as HTMLElement;

    expect(screen.getByRole("button", { name: "Move Waiting bucket up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Finished bucket down" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Move Active bucket up" }));

    expect(getWorkflowBucketLabelValues()).toEqual(["Active", "Waiting", "Finished"]);
    expect(within(mappingPanel).getByText("queued")).toBeInTheDocument();
  });

  it("disables workflow export when workflow actions are invalid", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Workflow" }));
    await user.clear(screen.getByRole("textbox", { name: "Action 1 label" }));

    expect(screen.getByText(/needs a label/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export Workflow" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export Bundled Workflow" })).toBeDisabled();
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
    await user.click(screen.getByRole("button", { name: "Move Cancel action up" }));
    await user.click(screen.getByRole("button", { name: "Buckets" }));
    await user.click(screen.getByRole("button", { name: "Move Finished bucket up" }));
    await user.click(screen.getByRole("button", { name: "Move Finished bucket up" }));
    await user.click(screen.getByRole("button", { name: "Export Workflow" }));
    await user.click(screen.getByRole("button", { name: "Export Bundled Workflow" }));

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

    expect(linkedExport.schemaVersion).toBe("0.2.0");
    expect(linkedExport.actions.map((action: { id: string }) => action.id)).toEqual([
      "cancel_queued",
      "complete",
      "fail",
      "retry",
      "start",
      "cancel_running",
    ]);
    expect(linkedExport.buckets).toEqual([
      { id: "finished", label: "Finished", states: ["completed", "cancelled"] },
      { id: "waiting", label: "Waiting", states: ["queued"] },
      { id: "active", label: "Active", states: ["running", "failed"] },
    ]);
    expect(bundledExport.actions).toEqual(linkedExport.actions);
    expect(bundledExport.buckets).toEqual(linkedExport.buckets);
    expect(bundledExport.embeddedStateMachineDefinition.id).toBe("scan_job_state");
  });

  it("imports linked workflow definitions", async () => {
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
    expect(screen.getByRole("button", { name: "Export Workflow" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Buckets" }));
    expect(screen.getByRole("textbox", { name: "Bucket 1 label" })).toHaveValue("Workflow");
    const mappingPanel = screen.getByRole("heading", { name: "State Mapping" }).closest("section") as HTMLElement;
    expect(within(mappingPanel).getByText("queued")).toBeInTheDocument();
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
});
