import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectsSettingsContent } from "@/components/ide-shared/ProjectsSettingsContent";
import type { Project } from "@/lib/api/projects";
import { formatDate } from "@/lib/utils";

vi.mock("@/hooks/useGitLab", () => ({
  useGitLab: () => ({
    hasIntegration: true,
    isLoadingIntegration: false,
  }),
}));

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

const updatedAt = "2026-09-18T12:00:00.000Z";

function makeProject(
  overrides: Partial<Project> & Pick<Project, "id" | "name">
): Project {
  return {
    description: undefined,
    visibility: "OWNER",
    source: "GITLAB",
    duoEndingEnabled: false,
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  };
}

const longTitle = "intimate discoveries long title";
const shortTitle = "test project";

function renderList() {
  render(
    <ProjectsSettingsContent
      projects={[
        makeProject({
          id: "long",
          name: longTitle,
          description: "A story that keeps going",
          source: "GITLAB",
        }),
        makeProject({
          id: "short",
          name: shortTitle,
          source: "ZIP",
        }),
      ]}
      onUpdateProject={vi.fn()}
      onDeleteProject={vi.fn()}
      onExportProject={vi.fn()}
      onViewExportHistory={vi.fn()}
    />
  );
}

describe("ProjectsSettingsContent", () => {
  it("clamps long titles and keeps dates and actions reachable", () => {
    renderList();

    expect(screen.getByText(longTitle)).toHaveClass("line-clamp-2");
    expect(screen.getByText(shortTitle)).toHaveClass("line-clamp-2");

    const updatedLabel = `Updated ${formatDate(updatedAt)}`;
    expect(screen.getAllByRole("cell", { name: updatedLabel })).toHaveLength(2);

    for (const name of [longTitle, shortTitle]) {
      expect(
        screen.getByRole("button", { name: `Export ${name}` })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `Export history for ${name}` })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `Edit ${name}` })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `Delete ${name}` })
      ).toBeInTheDocument();
    }

    expect(
      screen.getByRole("button", { name: `About ${longTitle}` })
    ).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(table).toHaveClass("max-[539px]:block");
    expect(table).toHaveClass("min-[540px]:table-fixed");
    expect(table).not.toHaveClass("table-fixed");
  });
});
