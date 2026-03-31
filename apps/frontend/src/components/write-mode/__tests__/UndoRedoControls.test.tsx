import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UndoRedoControls } from "../UndoRedoControls";

describe("UndoRedoControls", () => {
  const mockHandlers = {
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onUndoImmediate: vi.fn(),
    onRedoImmediate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("button states", () => {
    it("should enable undo button when immediate undo is available", () => {
      render(
        <UndoRedoControls
          canUndo={false}
          canRedo={false}
          canUndoImmediate={true}
          canRedoImmediate={false}
          {...mockHandlers}
        />
      );

      const undoButton = screen.getByLabelText("Undo");
      expect(undoButton).not.toBeDisabled();
    });

    it("should enable undo button when server undo is available", () => {
      render(
        <UndoRedoControls
          canUndo={true}
          canRedo={false}
          canUndoImmediate={false}
          canRedoImmediate={false}
          {...mockHandlers}
        />
      );

      const undoButton = screen.getByLabelText("Undo");
      expect(undoButton).not.toBeDisabled();
    });

    it("should disable undo button when neither undo is available", () => {
      render(
        <UndoRedoControls
          canUndo={false}
          canRedo={false}
          canUndoImmediate={false}
          canRedoImmediate={false}
          {...mockHandlers}
        />
      );

      const undoButton = screen.getByLabelText("Undo");
      expect(undoButton).toBeDisabled();
    });

    it("should disable undo button when undoing", () => {
      render(
        <UndoRedoControls
          canUndo={true}
          canRedo={false}
          canUndoImmediate={false}
          canRedoImmediate={false}
          isUndoing={true}
          {...mockHandlers}
        />
      );

      const undoButton = screen.getByLabelText("Undo");
      expect(undoButton).toBeDisabled();
    });

    it("should enable redo button when immediate redo is available", () => {
      render(
        <UndoRedoControls
          canUndo={false}
          canRedo={false}
          canUndoImmediate={false}
          canRedoImmediate={true}
          {...mockHandlers}
        />
      );

      const redoButton = screen.getByLabelText("Redo");
      expect(redoButton).not.toBeDisabled();
    });

    it("should enable redo button when server redo is available", () => {
      render(
        <UndoRedoControls
          canUndo={false}
          canRedo={true}
          canUndoImmediate={false}
          canRedoImmediate={false}
          {...mockHandlers}
        />
      );

      const redoButton = screen.getByLabelText("Redo");
      expect(redoButton).not.toBeDisabled();
    });

    it("should disable redo button when neither redo is available", () => {
      render(
        <UndoRedoControls
          canUndo={false}
          canRedo={false}
          canUndoImmediate={false}
          canRedoImmediate={false}
          {...mockHandlers}
        />
      );

      const redoButton = screen.getByLabelText("Redo");
      expect(redoButton).toBeDisabled();
    });

    it("should disable redo button when undoing", () => {
      render(
        <UndoRedoControls
          canUndo={false}
          canRedo={true}
          canUndoImmediate={false}
          canRedoImmediate={false}
          isUndoing={true}
          {...mockHandlers}
        />
      );

      const redoButton = screen.getByLabelText("Redo");
      expect(redoButton).toBeDisabled();
    });
  });

  describe("click handlers", () => {
    it("should call onUndoImmediate when immediate undo is available", () => {
      render(
        <UndoRedoControls
          canUndo={false}
          canRedo={false}
          canUndoImmediate={true}
          canRedoImmediate={false}
          {...mockHandlers}
        />
      );

      const undoButton = screen.getByLabelText("Undo");
      fireEvent.click(undoButton);

      expect(mockHandlers.onUndoImmediate).toHaveBeenCalled();
      expect(mockHandlers.onUndo).not.toHaveBeenCalled();
    });

    it("should call onUndo when server undo is available and immediate is not", () => {
      render(
        <UndoRedoControls
          canUndo={true}
          canRedo={false}
          canUndoImmediate={false}
          canRedoImmediate={false}
          {...mockHandlers}
        />
      );

      const undoButton = screen.getByLabelText("Undo");
      fireEvent.click(undoButton);

      expect(mockHandlers.onUndo).toHaveBeenCalled();
      expect(mockHandlers.onUndoImmediate).not.toHaveBeenCalled();
    });

    it("should call onRedoImmediate when immediate redo is available", () => {
      render(
        <UndoRedoControls
          canUndo={false}
          canRedo={false}
          canUndoImmediate={false}
          canRedoImmediate={true}
          {...mockHandlers}
        />
      );

      const redoButton = screen.getByLabelText("Redo");
      fireEvent.click(redoButton);

      expect(mockHandlers.onRedoImmediate).toHaveBeenCalled();
      expect(mockHandlers.onRedo).not.toHaveBeenCalled();
    });

    it("should call onRedo when server redo is available and immediate is not", () => {
      render(
        <UndoRedoControls
          canUndo={false}
          canRedo={true}
          canUndoImmediate={false}
          canRedoImmediate={false}
          {...mockHandlers}
        />
      );

      const redoButton = screen.getByLabelText("Redo");
      fireEvent.click(redoButton);

      expect(mockHandlers.onRedo).toHaveBeenCalled();
      expect(mockHandlers.onRedoImmediate).not.toHaveBeenCalled();
    });

    it("should prioritize onUndo when both immediate and server undo are available", () => {
      render(
        <UndoRedoControls
          canUndo={true}
          canRedo={false}
          canUndoImmediate={true}
          canRedoImmediate={false}
          {...mockHandlers}
        />
      );

      const undoButton = screen.getByLabelText("Undo");
      fireEvent.click(undoButton);

      expect(mockHandlers.onUndo).toHaveBeenCalled();
      expect(mockHandlers.onUndoImmediate).not.toHaveBeenCalled();
    });

    it("should prioritize onRedo when both immediate and server redo are available", () => {
      render(
        <UndoRedoControls
          canUndo={false}
          canRedo={true}
          canUndoImmediate={false}
          canRedoImmediate={true}
          {...mockHandlers}
        />
      );

      const redoButton = screen.getByLabelText("Redo");
      fireEvent.click(redoButton);

      expect(mockHandlers.onRedo).toHaveBeenCalled();
      expect(mockHandlers.onRedoImmediate).not.toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("should have proper ARIA labels", () => {
      render(
        <UndoRedoControls
          canUndo={true}
          canRedo={true}
          canUndoImmediate={false}
          canRedoImmediate={false}
          {...mockHandlers}
        />
      );

      expect(screen.getByLabelText("Undo")).toBeInTheDocument();
      expect(screen.getByLabelText("Redo")).toBeInTheDocument();
    });

    it("should have aria-disabled attribute when button is disabled", () => {
      render(
        <UndoRedoControls
          canUndo={false}
          canRedo={false}
          canUndoImmediate={false}
          canRedoImmediate={false}
          {...mockHandlers}
        />
      );

      const undoButton = screen.getByLabelText("Undo");
      expect(undoButton).toHaveAttribute("aria-disabled", "true");

      const redoButton = screen.getByLabelText("Redo");
      expect(redoButton).toHaveAttribute("aria-disabled", "true");
    });

    it("should have proper title attributes for tooltips", () => {
      render(
        <UndoRedoControls
          canUndo={true}
          canRedo={true}
          canUndoImmediate={false}
          canRedoImmediate={false}
          {...mockHandlers}
        />
      );

      expect(screen.getByTitle(/Undo \((Ctrl|Cmd)\+Z\)/)).toBeInTheDocument();
      expect(
        screen.getByTitle(/Redo \((Ctrl|Cmd)\+Shift\+Z\)/)
      ).toBeInTheDocument();
    });
  });
});
