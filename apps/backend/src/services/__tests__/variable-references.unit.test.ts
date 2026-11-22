import { describe, expect, it } from "vitest";
import { findVariableReferences } from "../variable-references.js";

function scan(content: string) {
  return findVariableReferences("both_mode", [
    { fileId: "file", filePath: "game/script.rpy", content },
  ]).map(({ line, kind }) => [line, kind]);
}

describe("findVariableReferences", () => {
  it("finds direct conditions and assignments with one-based source locations", () => {
    expect(
      scan(
        [
          "label start:",
          "    if both_mode: # Branch",
          "        $ both_mode = True",
          "    elif not both_mode:",
          "        pass",
          "    elif both_mode == False:",
          "        pass",
          "    elif False != both_mode:",
          "        pass",
          "    elif both_mode is not True:",
          "        $ both_mode = 'quoted # value'",
          "    elif not ((both_mode)):",
          "        pass",
        ].join("\r\n")
      )
    ).toEqual([
      [2, "condition"],
      [3, "assignment"],
      [4, "condition"],
      [6, "condition"],
      [8, "condition"],
      [10, "condition"],
      [11, "assignment"],
      [12, "condition"],
    ]);
  });

  it("ignores qualified names, strings, comments, defaults and different identifiers", () => {
    expect(
      scan(`default both_mode = True
label start:
    # if both_mode:
    "if both_mode: # ordinary dialogue"
    """
    if both_mode:
        $ both_mode = False
    """
    if persistent.both_mode:
        $ persistent.both_mode = True
    elif both_mode_extra:
        $ both_mode_extra = True
    elif Both_mode:
        $ both_mode == True
    elif αboth_mode:
        $ result = "both_mode"
    elif "both_mode" == True:
        pass
    elif both_mode == "True":
        pass`)
    ).toEqual([]);
  });

  it("skips shadowing label parameters and unsupported block scopes", () => {
    expect(
      scan(`label local_check(other=(1, 2), both_mode=False) hide:
    if both_mode:
        $ both_mode = True
    if other:
        pass
    "Quoted text"
    elif both_mode:
        pass
init python in chapter:
    if both_mode:
        both_mode = False
screen other(both_mode):
    if both_mode:
        pass
transform blink(both_mode=True):
    if both_mode:
        pass
label global_check(other="both_mode"):
    if both_mode:
        pass`)
    ).toEqual([[19, "condition"]]);
  });

  it("finds global screen conditions and ignores screen-local bindings", () => {
    expect(
      scan(`screen hud():
    if both_mode:
        text "Enabled"
    for both_mode in [True, False]:
        if both_mode:
            text "Loop value"
    if not both_mode:
        text "Disabled"
screen local_settings():
    default both_mode = False
    if both_mode:
        text "Local value"
screen local_assignment():
    $ both_mode = True
label start:
    $ both_mode = True`)
    ).toEqual([
      [2, "condition"],
      [7, "condition"],
      [16, "assignment"],
    ]);
  });
});
