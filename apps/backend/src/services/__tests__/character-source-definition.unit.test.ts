import { describe, expect, it } from "vitest";
import {
  characterStylingSignature,
  parseCharacterDefinitions,
  renderCharacterSourceDefinition,
  sameCharacterDefinitions,
} from "../character-source-definition.js";
import { generateCharacterDefinitionsFile } from "../rpy-generator.service.js";
import { extractAndStripRpySymbols } from "../rpy-statements.service.js";

const narrator = `define narrator = Character(
    None,
    what_color="#cfcfcf",
    what_italic=True
)`;

function render(
  source: string,
  edits: Partial<Parameters<typeof renderCharacterSourceDefinition>[1]> = {}
) {
  const parsed = parseCharacterDefinitions(source)[0];
  expect(parsed).toBeDefined();
  return renderCharacterSourceDefinition(parsed.sourceDefinition, {
    renpyTag: parsed.tag,
    name: parsed.name,
    nameType: parsed.nameType,
    color: parsed.color,
    ...edits,
  });
}

describe("sameCharacterDefinitions", () => {
  const e = parseCharacterDefinitions(
    'define e = Character("E", color="#abcdef", what_font="font.ttf")'
  )[0]!.sourceDefinition;

  it("matches snapshots with different key order", () => {
    expect(
      sameCharacterDefinitions({ e, narrator: e }, { narrator: e, e })
    ).toBe(true);
  });

  it("detects semantic field changes", () => {
    expect(
      sameCharacterDefinitions({ e }, { e: { ...e, color: "#000000" } })
    ).toBe(false);
  });
});

describe("character source preservation", () => {
  it("preserves the exact narrator definition as source-owned", () => {
    expect(extractAndStripRpySymbols(narrator, "game/script.rpy")).toEqual({
      cleanedContent: narrator,
      characters: [],
      variables: [],
      stats: [],
    });
    expect(render(narrator)).toBe(narrator);
  });

  it("retains absent/false italics on imported managed narrators", () => {
    for (const options of ["", ", what_italic=False"]) {
      const source = `default thought = Character(None${options})`;
      const parsed = parseCharacterDefinitions(source)[0];
      expect(
        generateCharacterDefinitionsFile([
          {
            renpyTag: "thought",
            name: "thought",
            nameType: "none",
            color: parsed.color,
            isNarrator: true,
            sourceDefinition: parsed.sourceDefinition,
          },
        ])
      ).toContain(source);
    }
  });

  it("changes only managed fields, preserving nested options and comments", () => {
    const source = `define  e = Character(
    'Eileen', # name
    who_color="#ABC", what_color="#123456",
    what_italic=False, kind=Character(None, what_prefix="(hi, there)"),
    what_outlines=[(2, "#000", 0, 0)],
) # retained`;
    expect(render(source)).toBe(source);
    const changed = render(source, {
      renpyTag: "hero",
      name: "New",
      color: "#abcdef",
    });
    expect(changed).toBe(
      source
        .replace("define  e", "define  hero")
        .replace("'Eileen'", '"New"')
        .replace('who_color="#ABC"', 'who_color="#abcdef"')
    );
    expect(parseCharacterDefinitions(changed!)[0].color).toBe("#abcdef");
  });

  it("never interprets what_color as speaker color", () => {
    const source = 'define e = Character("E", what_color="#ff0000")';
    expect(parseCharacterDefinitions(source)[0].color).toBe("#cfcfcf");
    expect(render(source, { color: "#112233" })).toBe(
      'define e = Character("E", what_color="#ff0000", color="#112233")'
    );
  });

  it("preserves dynamic expressions until explicit color edits", () => {
    const source =
      'define e = Character("E", who_color=palette.hero, color="#123456")';
    expect(parseCharacterDefinitions(source)[0].color).toBe("#cfcfcf");
    expect(render(source, { name: "Changed" })).toBe(
      source.replace('"E"', '"Changed"')
    );
    expect(render(source, { color: "#abcdef" })).toBe(
      source.replace("palette.hero", '"#abcdef"')
    );
  });

  it.each([
    'define e = Character("E" # comment\n)',
    'define e = Character("E", # comment\n)',
    'define e = Character(\n    "E",\n    what_italic=True # comment\n)',
  ])("inserts a color around comments and commas safely: %s", (source) => {
    const changed = render(source, { color: "#112233" });
    expect(changed).toContain("# comment");
    expect(parseCharacterDefinitions(changed!)[0].color).toBe("#112233");
  });

  it("decodes escaped names but preserves their original spelling", () => {
    const source = String.raw`define e = Character("A \"quote\" and \\slash", who_color='red')`;
    const parsed = parseCharacterDefinitions(source)[0];
    expect(parsed.name).toBe('A "quote" and \\slash');
    expect(parsed.color).toBe("#ff0000");
    expect(render(source)).toBe(source);
  });

  it.each([
    "define e = Character(get_name(), what_italic=True)",
    'define e = Character("E", **options)',
    'define e = Character("E", color="#abcdef", color="#123456")',
    'define e = Character("E"); run()',
    '    define e = Character("E")',
    'define e = Character("E", color=("#abcdef"] )',
    'define e = Character("E",',
    "'''\ndefine e = Character(\"Example\")\n'''",
  ])("leaves unsupported declarations untouched: %s", (source) => {
    expect(parseCharacterDefinitions(source)).toEqual([]);
    expect(extractAndStripRpySymbols(source).cleanedContent).toBe(source);
  });

  it("refuses inconsistent metadata and unsafe requested identifiers", () => {
    const parsed = parseCharacterDefinitions('define e = Character("E")')[0];
    expect(
      renderCharacterSourceDefinition(
        { ...parsed.sourceDefinition, name: "Wrong" },
        {
          renpyTag: "e",
          name: "E",
          nameType: "literal",
          color: "#cfcfcf",
        }
      )
    ).toBeNull();
    expect(
      render(parsed.sourceDefinition.declaration, { renpyTag: "e; run()" })
    ).toBeNull();
  });
  it("distinguishes retained styling from managed name and color edits", () => {
    const metadata = (source: string) =>
      parseCharacterDefinitions(source)[0].sourceDefinition;
    const first = metadata(
      'define e = Character("E", who_color="#123456", what_italic=False)'
    );
    const renamed = metadata(
      'define hero = Character("Hero", who_color="#abcdef", what_italic=False) # comment'
    );
    expect(characterStylingSignature(first)).toBe(
      characterStylingSignature(renamed)
    );
    expect(characterStylingSignature(first)).not.toBe(
      characterStylingSignature(
        metadata(
          'define e = Character("E", who_color="#123456", what_italic=True)'
        )
      )
    );
  });

  it("preserves screen-local defaults and defaults inside quoted examples", () => {
    const source =
      'screen example():\n    default local_value = 1\n    text "Hello"\n\n"""\ndefault example = 3\n"""\ndefault global_value = 2';
    const result = extractAndStripRpySymbols(source, "game/story.rpy");
    expect(result.stats.map((entry) => entry.key)).toEqual(["global_value"]);
    expect(result.cleanedContent).toContain("    default local_value = 1");
    expect(result.cleanedContent).toContain("default example = 3");
  });

  it("escapes carriage returns in generated fallback names", () => {
    const result = generateCharacterDefinitionsFile([
      { renpyTag: "e", name: "A\rB", color: "#abcdef", nameType: "literal" },
    ]);
    expect(result).toContain("A\\rB");
    expect(result).not.toContain("\r");
  });
});
