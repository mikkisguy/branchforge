/**
 * Component-level WCAG AA contrast tests using axe-core.
 *
 * These tests validate that UI components render without axe-detected
 * violations in both light and dark modes.
 *
 * Note: In jsdom, CSS variables from Tailwind may not fully resolve, so
 * the primary contrast verification lives in contrast-tokens.test.ts
 * which computes ratios directly. These tests serve as axe-core smoke
 * tests and will detect structural/attribute-level a11y issues.
 */
import { describe, it } from "vitest";
import {
  renderForAxe,
  runAxe,
  formatViolations,
  testInBothModes,
} from "@/test/axe-helper";

// UI Components
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function expectNoViolations(container: HTMLElement, label: string) {
  const violations = await runAxe(container);
  if (violations.length > 0) {
    throw new Error(`${label}:\n${formatViolations(violations)}`);
  }
}

describe("WCAG AA Component Contrast", () => {
  it("buttons render without violations in both modes", async () => {
    const { light, dark } = await testInBothModes(
      <div className="space-y-2 p-4">
        <Button variant="default">Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
    );
    const all = [...light, ...dark];
    if (all.length > 0) {
      throw new Error(`Button violations:\n${formatViolations(all)}`);
    }
  });

  it("badges render without violations", async () => {
    const { light, dark } = await testInBothModes(
      <div className="flex gap-2 p-4">
        <Badge variant="default">Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Badge variant="outline">Outline</Badge>
      </div>
    );
    const all = [...light, ...dark];
    if (all.length > 0) {
      throw new Error(`Badge violations:\n${formatViolations(all)}`);
    }
  });

  it("cards with form controls render without violations", async () => {
    const { container } = renderForAxe(
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Manage preferences.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" placeholder="you@example.com" />
          </div>
        </CardContent>
      </Card>,
      true
    );
    await expectNoViolations(container, "dark mode card");
  });
});
