import { describe, it, expect } from "vitest";
import {
  generateVisualName,
  generateJumpLabel,
  type VisualSystemConfig,
  type VisualNameComponents,
  type RouteConfig,
} from "./index.js";

describe("generateVisualName", () => {
  describe("Prequel pattern with act-based grouping", () => {
    const prequelConfig: VisualSystemConfig = {
      namingTemplate: "{group}_{label}_{counter}_{slug}",
      groupPrefixes: {
        act: {
          I: "ai",
          II: "aii",
          III: "aiii",
        },
      },
      labelPadding: 2,
      counterPadding: 2,
      jumpPrefixShared: "",
    };

    it("generates name with act prefix", () => {
      const components: VisualNameComponents = {
        groupType: "act",
        groupValue: "I",
        labelNumber: 1,
        counter: 1,
        slug: "cafe",
      };
      const result = generateVisualName(prequelConfig, components);
      expect(result).toBe("ai_01_01_cafe");
    });

    it("generates name for Act II", () => {
      const components: VisualNameComponents = {
        groupType: "act",
        groupValue: "II",
        labelNumber: 5,
        counter: 2,
        slug: "bedroom",
      };
      const result = generateVisualName(prequelConfig, components);
      expect(result).toBe("aii_05_02_bedroom");
    });

    it("handles single digit padding", () => {
      const config: VisualSystemConfig = {
        ...prequelConfig,
        labelPadding: 1 as const,
        counterPadding: 1 as const,
      };
      const components: VisualNameComponents = {
        groupType: "act",
        groupValue: "I",
        labelNumber: 1,
        counter: 1,
        slug: "cafe",
      };
      const result = generateVisualName(config, components);
      expect(result).toBe("ai_1_1_cafe");
    });

    it("handles missing act prefix gracefully", () => {
      const components: VisualNameComponents = {
        groupType: "act",
        groupValue: "IV", // Not in config
        labelNumber: 1,
        counter: 1,
        slug: "cafe",
      };
      const result = generateVisualName(prequelConfig, components);
      expect(result).toBe("IV_01_01_cafe");
    });

    it("handles missing groupType gracefully", () => {
      const components: VisualNameComponents = {
        labelNumber: 1,
        counter: 1,
        slug: "cafe",
      };
      const result = generateVisualName(prequelConfig, components);
      expect(result).toBe("01_01_cafe");
    });
  });

  describe("Sequel pattern with chapter-based grouping", () => {
    const sequelConfig: VisualSystemConfig = {
      namingTemplate: "{group}_{label}_{counter}_{slug}",
      groupPrefixes: {
        chapter: {
          "1": "ch1",
          "2": "ch2",
          "3": "ch3",
          "4": "ch4",
          "5": "ch5",
        },
      },
      labelPadding: 2,
      counterPadding: 2,
      jumpPrefixShared: "",
    };

    it("generates name with chapter prefix", () => {
      const components: VisualNameComponents = {
        groupType: "chapter",
        groupValue: "1",
        labelNumber: 1,
        counter: 1,
        slug: "cafe",
      };
      const result = generateVisualName(sequelConfig, components);
      expect(result).toBe("ch1_01_01_cafe");
    });

    it("generates name for later chapter", () => {
      const components: VisualNameComponents = {
        groupType: "chapter",
        groupValue: "5",
        labelNumber: 10,
        counter: 3,
        slug: "garden",
      };
      const result = generateVisualName(sequelConfig, components);
      expect(result).toBe("ch5_10_03_garden");
    });
  });

  describe("Route-based naming", () => {
    const routeConfig: VisualSystemConfig = {
      namingTemplate: "{route}{group}_{label}_{counter}_{slug}",
      groupPrefixes: {
        act: {
          I: "ai",
          II: "aii",
          III: "aiii",
        },
      },
      labelPadding: 2,
      counterPadding: 2,
      jumpPrefixShared: "",
    };

    it("includes route prefix when provided", () => {
      const components: VisualNameComponents = {
        routeKey: "eileen",
        groupType: "act",
        groupValue: "I",
        labelNumber: 1,
        counter: 1,
        slug: "cafe",
      };
      const result = generateVisualName(routeConfig, components);
      expect(result).toBe("eileen_ai_01_01_cafe");
    });

    it("omits route prefix when not provided", () => {
      const components: VisualNameComponents = {
        groupType: "act",
        groupValue: "I",
        labelNumber: 1,
        counter: 1,
        slug: "cafe",
      };
      const result = generateVisualName(routeConfig, components);
      expect(result).toBe("ai_01_01_cafe");
    });
  });
});

describe("generateJumpLabel", () => {
  // Mock route configurations
  const lucasRoute: RouteConfig = {
    id: "1",
    projectId: "proj-1",
    routeKey: "lucas",
    routeName: "Lucas's Route",
    jumpPrefix: "lucas_",
    sortOrder: 1,
    isShared: false,
  };

  const eileenRoute: RouteConfig = {
    id: "2",
    projectId: "proj-1",
    routeKey: "eileen",
    routeName: "Eileen's Route",
    jumpPrefix: "eileen_",
    sortOrder: 2,
    isShared: false,
  };

  const sharedRoute: RouteConfig = {
    id: "3",
    projectId: "proj-1",
    routeKey: "shared",
    routeName: "Shared Route",
    jumpPrefix: "",
    sortOrder: 0,
    isShared: true,
  };

  it("generates shared route jump label", () => {
    const result = generateJumpLabel(sharedRoute, 5, 2);
    expect(result).toBe("05");
  });

  it("generates Lucas route jump label", () => {
    const result = generateJumpLabel(lucasRoute, 3, 2);
    expect(result).toBe("lucas_03");
  });

  it("generates Eileen route jump label", () => {
    const result = generateJumpLabel(eileenRoute, 7, 2);
    expect(result).toBe("eileen_07");
  });

  it("generates label for null route (shared/common)", () => {
    const result = generateJumpLabel(null, 1, 2);
    expect(result).toBe("01");
  });

  it("pads label number correctly", () => {
    const result = generateJumpLabel(sharedRoute, 1, 2);
    expect(result).toBe("01");
  });

  it("uses labelPadding of 1", () => {
    const result = generateJumpLabel(lucasRoute, 5, 1);
    expect(result).toBe("lucas_5");
  });
});
