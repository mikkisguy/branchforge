import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UndoRedoControls } from "../UndoRedoControls";

describe("UndoRedoControls", () => {
  const mockHandlers = {
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("button states", () => {
    it("should enable undo button when undo is available", () => {
      render(
        <UndoRedoControls canUndo={true} canRedo={false} {...mockHandlers} />
      );

      const undoButton = screen.getByLabelText("Undo");
      expect(undoButton).not.toBeDisabled();
    });

    it("should disable undo button when undo is not available", () => {
      render(
        <UndoRedoControls canUndo={false} canRedo={false} {...mockHandlers} />
      );

      const undoButton = screen.getByLabelText("Undo");
      expect(undoButton).toBeDisabled();
    });

    it("should enable redo button when redo is available", () => {
      render(
        <UndoRedoControls canUndo={false} canRedo={true} {...mockHandlers} />
      );

      const redoButton = screen.getByLabelText("Redo");
      expect(redoButton).not.toBeDisabled();
    });

    it("should disable redo button when redo is not available", () => {
      render(
        <UndoRedoControls canUndo={false} canRedo={false} {...mockHandlers} />
      );

      const redoButton = screen.getByLabelText("Redo");
      expect(redoButton).toBeDisabled();
    });
  });

  describe("click handlers", () => {
    it("should call onUndo when undo button is clicked", () => {
      render(
        <UndoRedoControls canUndo={true} canRedo={false} {...mockHandlers} />
      );

      const undoButton = screen.getByLabelText("Undo");
      fireEvent.click(undoButton);

      expect(mockHandlers.onUndo).toHaveBeenCalledOnce();
    });

    it("should call onRedo when redo button is clicked", () => {
      render(
        <UndoRedoControls canUndo={false} canRedo={true} {...mockHandlers} />
      );

      const redoButton = screen.getByLabelText("Redo");
      fireEvent.click(redoButton);

      expect(mockHandlers.onRedo).toHaveBeenCalledOnce();
    });

    it("should not call onUndo when undo button is clicked but disabled", () => {
      render(
        <UndoRedoControls canUndo={false} canRedo={false} {...mockHandlers} />
      );

      const undoButton = screen.getByLabelText("Undo");
      fireEvent.click(undoButton);

      expect(mockHandlers.onUndo).not.toHaveBeenCalled();
    });

    it("should not call onRedo when redo button is clicked but disabled", () => {
      render(
        <UndoRedoControls canUndo={false} canRedo={false} {...mockHandlers} />
      );

      const redoButton = screen.getByLabelText("Redo");
      fireEvent.click(redoButton);

      expect(mockHandlers.onRedo).not.toHaveBeenCalled();
    });
  });

  describe("keyboard shortcuts", () => {
    it("should call onUndo when Ctrl+Z is pressed", () => {
      render(
        <UndoRedoControls canUndo={true} canRedo={false} {...mockHandlers} />
      );

      fireEvent.keyDown(document, { key: "z", code: "KeyZ", ctrlKey: true });

      expect(mockHandlers.onUndo).toHaveBeenCalledOnce();
    });

    it("should call onUndo when Cmd+Z is pressed (Mac)", () => {
      render(
        <UndoRedoControls canUndo={true} canRedo={false} {...mockHandlers} />
      );

      fireEvent.keyDown(document, { key: "z", code: "KeyZ", metaKey: true });

      expect(mockHandlers.onUndo).toHaveBeenCalledOnce();
    });

    it("should not call onUndo when Ctrl+Z is pressed but disabled", () => {
      render(
        <UndoRedoControls canUndo={false} canRedo={false} {...mockHandlers} />
      );

      fireEvent.keyDown(document, { key: "z", code: "KeyZ", ctrlKey: true });

      expect(mockHandlers.onUndo).not.toHaveBeenCalled();
    });

    it("should not call onRedo when Ctrl+Shift+Z is pressed but canRedo is false", () => {
      render(
        <UndoRedoControls canUndo={false} canRedo={false} {...mockHandlers} />
      );

      fireEvent.keyDown(document, {
        key: "z",
        code: "KeyZ",
        ctrlKey: true,
        shiftKey: true,
      });

      expect(mockHandlers.onRedo).not.toHaveBeenCalled();
    });

    it("should call onRedo when Ctrl+Y is pressed", () => {
      render(
        <UndoRedoControls canUndo={false} canRedo={true} {...mockHandlers} />
      );

      fireEvent.keyDown(document, { key: "y", code: "KeyY", ctrlKey: true });

      expect(mockHandlers.onRedo).toHaveBeenCalledOnce();
    });

    it("should call onRedo when Cmd+Y is pressed (Mac)", () => {
      render(
        <UndoRedoControls canUndo={false} canRedo={true} {...mockHandlers} />
      );

      fireEvent.keyDown(document, { key: "y", code: "KeyY", metaKey: true });

      expect(mockHandlers.onRedo).toHaveBeenCalledOnce();
    });

    it("should not call onRedo when Ctrl+Y is pressed but disabled", () => {
      render(
        <UndoRedoControls canUndo={false} canRedo={false} {...mockHandlers} />
      );

      fireEvent.keyDown(document, { key: "y", code: "KeyY", ctrlKey: true });

      expect(mockHandlers.onRedo).not.toHaveBeenCalled();
    });

    it("should not trigger undo when typing in an input element", () => {
      render(
        <UndoRedoControls canUndo={true} canRedo={false} {...mockHandlers} />
      );

      const input = document.createElement("input");
      document.body.appendChild(input);

      try {
        fireEvent.keyDown(input, { key: "z", code: "KeyZ", ctrlKey: true });

        expect(mockHandlers.onUndo).not.toHaveBeenCalled();
      } finally {
        document.body.removeChild(input);
      }
    });

    it("should not trigger undo when typing in a textarea", () => {
      render(
        <UndoRedoControls canUndo={true} canRedo={false} {...mockHandlers} />
      );

      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);

      try {
        fireEvent.keyDown(textarea, { key: "z", code: "KeyZ", ctrlKey: true });

        expect(mockHandlers.onUndo).not.toHaveBeenCalled();
      } finally {
        document.body.removeChild(textarea);
      }
    });

    it("should not trigger undo when typing in a contenteditable element", () => {
      render(
        <UndoRedoControls canUndo={true} canRedo={false} {...mockHandlers} />
      );

      const div = document.createElement("div");
      Object.defineProperty(div, "isContentEditable", {
        value: true,
        writable: false,
      });
      document.body.appendChild(div);

      try {
        fireEvent.keyDown(div, { key: "z", code: "KeyZ", ctrlKey: true });

        expect(mockHandlers.onUndo).not.toHaveBeenCalled();
      } finally {
        document.body.removeChild(div);
      }
    });
  });

  describe("accessibility", () => {
    it("should have proper ARIA labels", () => {
      render(
        <UndoRedoControls canUndo={true} canRedo={true} {...mockHandlers} />
      );

      expect(screen.getByLabelText("Undo")).toBeInTheDocument();
      expect(screen.getByLabelText("Redo")).toBeInTheDocument();
    });

    it("should have aria-disabled attribute when button is disabled", () => {
      render(
        <UndoRedoControls canUndo={false} canRedo={false} {...mockHandlers} />
      );

      const undoButton = screen.getByLabelText("Undo");
      expect(undoButton).toHaveAttribute("aria-disabled", "true");

      const redoButton = screen.getByLabelText("Redo");
      expect(redoButton).toHaveAttribute("aria-disabled", "true");
    });

    it("should have proper title attributes for tooltips", () => {
      render(
        <UndoRedoControls canUndo={true} canRedo={true} {...mockHandlers} />
      );

      expect(
        screen.getByTitle(/Undo \(Ctrl\+Z \/ Cmd\+Z\)/)
      ).toBeInTheDocument();
      expect(
        screen.getByTitle(/Redo \(Ctrl\+Y \/ Cmd\+Shift\+Z\)/)
      ).toBeInTheDocument();
    });
  });
});
