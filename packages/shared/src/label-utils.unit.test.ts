import { describe, it, expect } from "vitest";
import { sanitizeLabelName, RENPY_LABEL_REGEX } from "./index.js";

describe("sanitizeLabelName", () => {
  describe("valid labels", () => {
    it("converts to lowercase", () => {
      expect(sanitizeLabelName("HelloWorld")).toBe("helloworld");
      expect(sanitizeLabelName("MYLABEL")).toBe("mylabel");
    });

    it("replaces spaces with underscores", () => {
      expect(sanitizeLabelName("hello world")).toBe("hello_world");
      expect(sanitizeLabelName("My Label")).toBe("my_label");
    });

    it("replaces special characters with underscores", () => {
      expect(sanitizeLabelName("hello-world")).toBe("hello_world");
      expect(sanitizeLabelName("hello!world")).toBe("hello_world");
      expect(sanitizeLabelName("hello@world")).toBe("hello_world");
      expect(sanitizeLabelName("hello.world")).toBe("hello_world");
    });

    it("allows alphanumeric characters and underscores", () => {
      expect(sanitizeLabelName("hello_world_123")).toBe("hello_world_123");
    });

    it("trims leading and trailing underscores", () => {
      expect(sanitizeLabelName("__hello__")).toBe("hello");
      expect(sanitizeLabelName("_hello_world_")).toBe("hello_world");
    });

    it("handles multiple consecutive invalid characters", () => {
      expect(sanitizeLabelName("hello!!!world")).toBe("hello_world");
      expect(sanitizeLabelName("hello---world")).toBe("hello_world");
    });
  });

  describe("edge cases", () => {
    it("returns 'untitled' for empty string", () => {
      expect(sanitizeLabelName("")).toBe("untitled");
    });

    it("returns 'untitled' for string starting with number", () => {
      expect(sanitizeLabelName("123hello")).toBe("untitled");
      expect(sanitizeLabelName("9label")).toBe("untitled");
      expect(sanitizeLabelName("1")).toBe("untitled");
    });

    it("returns 'untitled' if sanitization results in empty string", () => {
      expect(sanitizeLabelName("!!!")).toBe("untitled");
      expect(sanitizeLabelName("___")).toBe("untitled");
      expect(sanitizeLabelName("   ")).toBe("untitled");
    });

    it("handles mixed case with special chars", () => {
      expect(sanitizeLabelName("Hello! World?")).toBe("hello_world");
    });

    it("handles unicode characters", () => {
      expect(sanitizeLabelName("café")).toBe("caf");
    });
  });

  describe("real-world examples", () => {
    it("handles typical label titles", () => {
      expect(sanitizeLabelName("Start")).toBe("start");
      expect(sanitizeLabelName("Introduction")).toBe("introduction");
      expect(sanitizeLabelName("First Meeting")).toBe("first_meeting");
      expect(sanitizeLabelName("Scene 1: The Cafe")).toBe("scene_1_the_cafe");
    });

    it("handles complex titles", () => {
      expect(sanitizeLabelName("Chapter 1 - The Beginning")).toBe(
        "chapter_1_the_beginning"
      );
      expect(sanitizeLabelName("Act I: Prologue")).toBe("act_i_prologue");
    });
  });
});

describe("RENPY_LABEL_REGEX", () => {
  describe("matching valid labels", () => {
    it("matches simple label definition", () => {
      const match = "label start:".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("start");
    });

    it("matches label with numbers", () => {
      const match = "label scene_1:".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("scene_1");
    });

    it("matches label starting with underscore", () => {
      const match = "label _private:".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("_private");
    });

    it("matches label with indentation", () => {
      const match = "    label indented:".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("indented");
    });

    it("matches label with tab indentation", () => {
      const match = "\tlabel tabbed:".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("tabbed");
    });

    it("matches label with multiple words", () => {
      const match = "label my_long_label_name:".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("my_long_label_name");
    });
  });

  describe("not matching invalid labels", () => {
    it("does not match label starting with number", () => {
      const match = "label 123:".match(RENPY_LABEL_REGEX);
      expect(match).toBeNull();
    });

    it("matches only valid prefix when label has special characters", () => {
      const match = "label my-label:".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("my");
    });

    it("matches only first word when label has spaces", () => {
      const match = "label my label:".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("my");
    });

    it("does not match label starting with special char", () => {
      const match = "label @invalid:".match(RENPY_LABEL_REGEX);
      expect(match).toBeNull();
    });
  });

  describe("pattern with parameters", () => {
    it("matches label with parameters (colon)", () => {
      const match = "label start(param):".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("start");
    });

    it("matches label with colon and spaces", () => {
      const match = "label start   :".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("start");
    });

    it("matches label without colon (partial match)", () => {
      const match = "label start".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("start");
    });
  });

  describe("whitespace handling", () => {
    it("matches with multiple spaces between label and name", () => {
      const match = "label     start:".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("start");
    });

    it("matches with tabs", () => {
      const match = "label\t\tstart:".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("start");
    });

    it("matches with mixed spaces and tabs", () => {
      const match = "label \t start:".match(RENPY_LABEL_REGEX);
      expect(match).toBeTruthy();
      expect(match?.[1]).toBe("start");
    });
  });
});
