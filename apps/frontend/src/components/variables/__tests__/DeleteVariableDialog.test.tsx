import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VariableReference } from "@branchforge/shared";
import { createTestQueryClient } from "@/test/query-client";
import { ApiRequestError } from "@/lib/api/client";
import { variablesApi } from "@/lib/api/variables";
import { DeleteVariableDialog } from "../DeleteVariableDialog";

vi.mock("@/lib/api/variables", () => ({
  variablesApi: { listVariableReferences: vi.fn() },
}));

const variable = {
  id: "variable-1",
  projectId: "project-1",
  key: "both_mode",
  category: null,
  description: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const reference: VariableReference = {
  fileId: "47fd0168-fa3e-4eb9-93b9-c50967dfe45a",
  filePath: "game/chapter.rpy",
  line: 12,
  kind: "condition",
};

function showDialog() {
  const onClose = vi.fn();
  const onDelete = vi
    .fn<(id: string) => Promise<void>>()
    .mockResolvedValue(undefined);
  const onOpenReference = vi
    .fn<(reference: VariableReference) => Promise<boolean>>()
    .mockResolvedValue(true);
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <DeleteVariableDialog
        variable={variable}
        onClose={onClose}
        onDelete={onDelete}
        onOpenReference={onOpenReference}
      />
    </QueryClientProvider>
  );
  const confirm = screen.getByRole("button", { name: "Delete Variable" });
  return { confirm, onClose, onDelete, onOpenReference, user };
}

describe("DeleteVariableDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("disables deletion while checking and opens a blocking line in Script Mode", async () => {
    vi.mocked(variablesApi.listVariableReferences).mockResolvedValue([
      reference,
    ]);
    const { confirm, onClose, onDelete, onOpenReference, user } = showDialog();

    expect(confirm).toBeDisabled();
    const location = await screen.findByRole("button", {
      name: "game/chapter.rpy:12",
    });
    expect(confirm).toBeDisabled();
    await user.click(location);

    expect(onOpenReference).toHaveBeenCalledWith(reference);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("keeps the dialog open when the server finds new references and allows deletion after rechecking", async () => {
    vi.mocked(variablesApi.listVariableReferences).mockResolvedValue([]);
    const { confirm, onClose, onDelete, user } = showDialog();
    onDelete.mockRejectedValueOnce(
      new ApiRequestError("Variable is still referenced", 409, {
        reason: "VARIABLE_IN_USE",
        references: [reference],
      })
    );

    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    expect(await screen.findByText("game/chapter.rpy:12")).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    expect(onDelete).toHaveBeenCalledTimes(2);
    expect(onDelete).toHaveBeenLastCalledWith(variable.id);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps deletion disabled when the reference check fails", async () => {
    vi.mocked(variablesApi.listVariableReferences).mockRejectedValue(
      new Error("Offline")
    );
    const { confirm, onDelete } = showDialog();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not check script references."
    );
    expect(confirm).toBeDisabled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
