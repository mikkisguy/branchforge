import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ProseEditor } from "../ProseEditor";

const { mockState } = vi.hoisted(() => ({
  mockState: {
    wordCount: 12,
    lineCount: 3,
  },
}));

vi.mock("../useProseEditorState", () => ({
  useProseEditorState: () => ({
    activeLabel: undefined,
    entries: [],
    characters: [],
    wordCount: mockState.wordCount,
    lineCount: mockState.lineCount,
    handleCreateFirstEntry: vi.fn(),
  }),
}));

describe("ProseEditor editor metrics", () => {
  beforeEach(() => {
    mockState.wordCount = 12;
    mockState.lineCount = 3;
  });

  it("resets parent metrics when the editor instance is replaced", () => {
    const onEditorMetricsChange = vi.fn();

    const { rerender } = render(
      <ProseEditor
        key="label-a"
        activeLabel={undefined}
        characters={[]}
        onChange={vi.fn()}
        onEditorMetricsChange={onEditorMetricsChange}
      />
    );

    expect(onEditorMetricsChange).toHaveBeenLastCalledWith({
      wordCount: 12,
      lineCount: 3,
    });

    mockState.wordCount = 5;
    mockState.lineCount = 1;
    onEditorMetricsChange.mockClear();

    rerender(
      <ProseEditor
        key="label-b"
        activeLabel={undefined}
        characters={[]}
        onChange={vi.fn()}
        onEditorMetricsChange={onEditorMetricsChange}
      />
    );

    expect(onEditorMetricsChange.mock.calls).toEqual([
      [{ wordCount: 0, lineCount: 0 }],
      [{ wordCount: 5, lineCount: 1 }],
    ]);
  });
});
