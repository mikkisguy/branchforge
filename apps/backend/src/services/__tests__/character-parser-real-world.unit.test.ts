import { describe, it, expect } from "vitest";
import { characterParserService } from "../character-parser.service.js";

describe("real-world Ren'Py file (from db)", () => {
  it("parses characters from a real GitLab-imported project's variables.rpy", () => {
    // This is the actual content from project_files.original_content
    // for project 3c3f11c1 (game/variables.rpy), with psql's
    // trailing whitespace stripped.
    const content = ` ## Persistent settings
 default persistent.age_verified = False
 default persistent.pl_nickname = ""

 ## Characters

 # General
 define n = Character(None, what_italic=True)
 define w = Character("Welcome!", who_color="#FFFFFF")
 define u = Character("???", who_color="#E4E4E4")

 # Nelson
 define ne_first = "Nelson"
 define ne_last = "Stone"
 define ne = Character("[persistent.pl_nickname]", who_color="#94B0B9")

 # Reynard
 define re_first = "Reynard"
 define re_last = "Stone"
 define re = Character("[re_first]", who_color="#CDCDCD")
`;

    const detected = characterParserService.parseFile(
      content,
      "game/variables.rpy"
    );

    // All characters should be detected, even the simple `define x = "y"`
    // string variables should NOT be misclassified as characters.
    const tags = detected.map((c) => c.tag);
    expect(tags).toContain("n");
    expect(tags).toContain("w");
    expect(tags).toContain("u");
    expect(tags).toContain("ne");
    expect(tags).toContain("re");

    // String variable assignments like `define ne_first = "Nelson"`
    // should NOT be detected as characters.
    expect(tags).not.toContain("ne_first");
    expect(tags).not.toContain("ne_last");
    expect(tags).not.toContain("re_first");
    expect(tags).not.toContain("re_last");

    // Sanity: check name types
    const byTag = new Map(detected.map((c) => [c.tag, c]));
    expect(byTag.get("n")?.nameType).toBe("none");
    expect(byTag.get("w")?.nameType).toBe("literal");
    expect(byTag.get("u")?.nameType).toBe("unknown");
    expect(byTag.get("ne")?.nameType).toBe("interpolated");
    expect(byTag.get("re")?.nameType).toBe("interpolated");
  });

  it('does NOT detect `define foo = "bar"` as a character (regression for #138)', () => {
    // Simple string variable assignments should not be confused
    // with character definitions. The original parser's "simple
    // assignment" check should still skip these.
    const content = `define ne_first = "Nelson"
define ne_last = "Stone"
`;
    const detected = characterParserService.parseFile(content, "test.rpy");
    expect(detected).toHaveLength(0);
  });
});
