import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormErrorMessage } from "@/components/ui/form-error-message";

describe("FormErrorMessage", () => {
  it("renders nothing when message is undefined", () => {
    const { container } = render(<FormErrorMessage id="test" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when message is empty string", () => {
    const { container } = render(<FormErrorMessage id="test" message="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the error message with role='alert'", () => {
    render(<FormErrorMessage id="price-error" message="Price is required" />);
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Price is required");
    expect(error).toHaveAttribute("id", "price-error");
  });

  it("applies additional className", () => {
    render(<FormErrorMessage id="x" message="Oops" className="extra" />);
    const error = screen.getByRole("alert");
    expect(error.className).toContain("extra");
  });
});
