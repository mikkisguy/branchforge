/**
 * DeleteFileDialog tests
 *
 * Focuses on the lifecycle behavior introduced by the keyed remount
 * boundary: typed-confirmation and force-choice state reset when the
 * dialog opens for a different file, and survives ordinary rerenders
 * for the same file.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeleteFileDialog } from "@/components/ide-shared/DeleteFileDialog";
import type { DeleteFileImpact } from "@/lib/api/project-files";

const getDeleteImpact = vi.fn();

vi.mock("@/lib/api/project-files", () => ({
  projectFilesApi: {
    getDeleteImpact: (...args: unknown[]) => getDeleteImpact(...args),
  },
}));

function makeImpact(fileId: string): DeleteFileImpact {
  return {
    fileId,
    filePath: "game/script.rpy",
    labelCount: 11,
    labels: Array.from({ length: 11 }, (_unused, index) => ({
      id: `${fileId}-label-${index}`,
      title: `Label ${index}`,
      labelName: index === 0 ? null : `label_${index}`,
    })),
    referenceCount: 0,
    references: [],
  };
}

type DialogProps = ComponentProps<typeof DeleteFileDialog>;

const baseProps: DialogProps = {
  open: true,
  onOpenChange: vi.fn(),
  projectId: "project-1",
  file: { id: "file-1", filePath: "game/script.rpy" },
  onDelete: vi.fn(async () => true),
};

function renderDialog(props: DialogProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DeleteFileDialog {...props} />
    </QueryClientProvider>
  );
  return {
    ...view,
    rerenderDialog: (nextProps: DialogProps) => {
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <DeleteFileDialog {...nextProps} />
        </QueryClientProvider>
      );
    },
  };
}

async function typeBasename(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByLabelText(/to confirm this deletion/);
  await user.type(input, "script.rpy");
  return input;
}

describe("DeleteFileDialog state lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDeleteImpact.mockImplementation((_projectId: string, fileId: string) =>
      Promise.resolve(makeImpact(fileId))
    );
  });

  it("keeps typed confirmation across ordinary rerenders for the same file", async () => {
    const user = userEvent.setup();
    const { rerenderDialog } = renderDialog(baseProps);

    await waitFor(() => {
      expect(
        screen.getByLabelText(/to confirm this deletion/)
      ).toBeInTheDocument();
    });

    const input = await typeBasename(user);
    expect(input).toHaveValue("script.rpy");

    // Ordinary parent rerender with the same file must not reset state.
    rerenderDialog({ ...baseProps });

    expect(screen.getByLabelText(/to confirm this deletion/)).toHaveValue(
      "script.rpy"
    );
  });

  it("starts fresh when the dialog opens for a different file", async () => {
    const user = userEvent.setup();
    const { rerenderDialog } = renderDialog(baseProps);

    await waitFor(() => {
      expect(
        screen.getByLabelText(/to confirm this deletion/)
      ).toBeInTheDocument();
    });

    await typeBasename(user);

    const differentFile = { id: "file-2", filePath: "game/script.rpy" };
    rerenderDialog({ ...baseProps, file: differentFile });

    // New file id -> keyed remount; the typed confirmation input only
    // returns once the new impact report has loaded, and starts empty.
    await waitFor(() => {
      expect(screen.getByLabelText(/to confirm this deletion/)).toHaveValue("");
    });
    expect(getDeleteImpact).toHaveBeenCalledWith("project-1", "file-2");
  });
});
