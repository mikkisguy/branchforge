import { act, render, waitFor } from "@testing-library/react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { ScriptEditor } from "../ScriptEditor/ScriptEditor";

let codeMirrorProps: { value: string; extensions: Extension[] } | undefined;

vi.mock("@uiw/react-codemirror", () => ({
  default: (props: { value: string; extensions: Extension[] }) => {
    codeMirrorProps = props;
    return <div data-testid="code-mirror" />;
  },
}));

vi.mock("@/hooks/useVisualPreviewLookup", () => ({
  useVisualPreviewLookup: () => ({
    getImageForTarget: () => undefined,
  }),
}));

vi.mock("@/components/project-images/VisualPreviewModal", () => ({
  VisualPreviewModal: () => null,
}));

describe("ScriptEditor onStatusChange", () => {
  it("reports initial status and a single updated cursor and document status", async () => {
    const onStatusChange = vi.fn();

    render(
      <ScriptEditor
        content={"first line\nsecond line"}
        onStatusChange={onStatusChange}
      />
    );

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledOnce();
    });
    expect(onStatusChange).toHaveBeenLastCalledWith({
      cursorPosition: { line: 1, col: 1 },
      selectionInfo: null,
      totalLines: 2,
    });

    const editorProps = codeMirrorProps;
    if (!editorProps) {
      throw new Error("CodeMirror props were not captured");
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new EditorView({
      state: EditorState.create({
        doc: editorProps.value,
        extensions: editorProps.extensions,
      }),
      parent: container,
    });

    act(() => {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: "\nthird line" },
        selection: { anchor: 0, head: 5 },
      });
    });

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledTimes(2);
    });
    expect(onStatusChange).toHaveBeenLastCalledWith({
      cursorPosition: { line: 1, col: 6 },
      selectionInfo: "5 chars selected",
      totalLines: 3,
    });

    view.destroy();
    container.remove();
  });
});
