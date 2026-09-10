import { describe, expect, it } from "vitest";

import { buttonVariants } from "@/components/ui/button-variants";

describe("buttonVariants sizes", () => {
  it("uses 40px default height with mobile touch target", () => {
    const classes = buttonVariants({ size: "default" });
    const classList = classes.split(/\s+/);
    expect(classList).toContain("h-10");
    expect(classList).toContain("max-md:min-h-11");
    expect(classList).not.toContain("min-h-11");
  });

  it("uses 32px compact height on sm", () => {
    const classes = buttonVariants({ size: "sm" });
    expect(classes).toContain("h-8");
    expect(classes).toContain("max-md:min-h-11");
  });

  it("uses 36px square icon size with mobile expansion", () => {
    const classes = buttonVariants({ size: "icon" });
    expect(classes).toContain("h-9");
    expect(classes).toContain("w-9");
    expect(classes).toContain("max-md:h-11");
    expect(classes).toContain("max-md:w-11");
  });
});
