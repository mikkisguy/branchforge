import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "@/components/ui/logo";
import { BASE_URL } from "@/lib/constants";
import { APP_NAME } from "@/lib/version";

describe("Logo", () => {
  it("renders the favicon image with the app name as alt text", () => {
    render(<Logo />);

    const image = screen.getByRole("img", { name: APP_NAME });
    expect(image).toHaveAttribute("src", `${BASE_URL}favicon.png`);
  });

  it("exposes the full app name as a tooltip when compact", () => {
    render(<Logo compact size="sm" />);

    expect(screen.getByRole("heading", { name: APP_NAME })).toHaveAttribute(
      "title",
      APP_NAME
    );
  });
});
