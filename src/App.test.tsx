import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the initial valid definition and graph preview", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Definition Editor" })).toBeInTheDocument();
    expect(screen.getByText("Valid")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "State graph preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export JSON" })).toBeEnabled();
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

  it("shows validation errors and disables export for terminal outgoing transitions", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("checkbox", { name: "queued terminal" }));

    expect(screen.getAllByText(/Terminal state "queued" cannot have outgoing transitions/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Export JSON" })).toBeDisabled();
    expect(screen.queryByRole("img", { name: "State graph preview" })).not.toBeInTheDocument();
  });

  it("imports a valid JSON definition", async () => {
    render(<App />);

    const json = JSON.stringify({
      schemaVersion: "0.1.0",
      id: "article_state",
      states: ["draft", "published"],
      terminalStates: ["published"],
      transitions: [{ from: "draft", to: "published" }],
    });
    const file = new File([json], "article-state.json", { type: "application/json" });

    Object.defineProperty(file, "text", {
      value: async () => json,
    });

    fireEvent.change(screen.getByLabelText("Import JSON definition"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Machine ID")).toHaveValue("article_state");
    });
    expect(screen.getByRole("textbox", { name: "State 1 ID" })).toHaveValue("draft");
    expect(screen.getByText("Valid")).toBeInTheDocument();
  });

  it("creates transition rows with selectable states", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Add Transition" }));

    expect(screen.getByLabelText("Transition 7 source")).toHaveValue("queued");
    expect(screen.getByLabelText("Transition 7 target")).toHaveValue("running");
  });
});
