import { createContext } from "react";

export const ScriptEditorToolbarPlacementContext = createContext<
  "editor" | "workspace"
>("editor");
