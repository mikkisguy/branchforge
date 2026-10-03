import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { CharacterEditDialogAvatarSection } from "../CharacterEditDialogAvatarSection";
import type { CharacterFormState } from "../CharacterEditDialog.utils";

function makeForm(
  overrides: Partial<CharacterFormState> = {}
): CharacterFormState {
  return {
    name: "alice",
    displayName: "Alice",
    renpyTag: "alice",
    color: "#FF6B6B",
    notes: "",
    isLoveInterest: false,
    isNarrator: false,
    ...overrides,
  };
}

describe("CharacterEditDialogAvatarSection", () => {
  it("hides the remove button when no avatar is set", () => {
    render(
      <CharacterEditDialogAvatarSection
        form={makeForm()}
        handleAvatarSelect={vi.fn()}
        handleAvatarRemove={vi.fn()}
        isSaving={false}
        fileInputRef={createRef()}
      />
    );

    expect(screen.queryByText("Remove Avatar")).not.toBeInTheDocument();
  });

  it("renders a Remove Avatar button that calls handleAvatarRemove", async () => {
    const user = userEvent.setup();
    const handleAvatarRemove = vi.fn();
    render(
      <CharacterEditDialogAvatarSection
        form={makeForm({ avatarUrl: "/avatars/alice.png" })}
        handleAvatarSelect={vi.fn()}
        handleAvatarRemove={handleAvatarRemove}
        isSaving={false}
        fileInputRef={createRef()}
      />
    );

    const removeButton = screen.getByRole("button", {
      name: /remove avatar/i,
    });

    await user.click(removeButton);
    expect(handleAvatarRemove).toHaveBeenCalledTimes(1);
  });

  it("disables the remove button while saving", () => {
    render(
      <CharacterEditDialogAvatarSection
        form={makeForm({ avatarUrl: "/avatars/alice.png" })}
        handleAvatarSelect={vi.fn()}
        handleAvatarRemove={vi.fn()}
        isSaving={true}
        fileInputRef={createRef()}
      />
    );

    expect(
      screen.getByRole("button", { name: /remove avatar/i })
    ).toBeDisabled();
  });

  it("shows the remove button for a freshly selected preview", () => {
    render(
      <CharacterEditDialogAvatarSection
        form={makeForm({ avatarPreview: "blob:preview" })}
        handleAvatarSelect={vi.fn()}
        handleAvatarRemove={vi.fn()}
        isSaving={false}
        fileInputRef={createRef()}
      />
    );

    expect(
      screen.getByRole("button", { name: /remove avatar/i })
    ).toBeInTheDocument();
    expect(screen.getByAltText("Avatar preview")).toHaveAttribute(
      "src",
      "blob:preview"
    );
  });
});
