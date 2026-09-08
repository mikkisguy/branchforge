import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState
        title="No projects yet"
        description="Create a project to get started."
      />
    );

    expect(
      screen.getByRole("heading", { name: "No projects yet" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Create a project to get started.")
    ).toBeInTheDocument();
  });

  it("renders the action slot", () => {
    render(
      <EmptyState
        title="No projects yet"
        action={<Button>Create project</Button>}
      />
    );

    expect(
      screen.getByRole("button", { name: "Create project" })
    ).toBeInTheDocument();
  });
});
