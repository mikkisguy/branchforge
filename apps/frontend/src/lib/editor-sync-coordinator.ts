type EditorMode = "write" | "script";

type FlushHandler = () => Promise<boolean>;

const flushHandlers = new Map<EditorMode, FlushHandler>();

export function registerModeFlushHandler(
  mode: EditorMode,
  handler: FlushHandler
): () => void {
  flushHandlers.set(mode, handler);

  return () => {
    const registered = flushHandlers.get(mode);
    if (registered === handler) {
      flushHandlers.delete(mode);
    }
  };
}

export async function flushModeBeforeTransition(
  mode: EditorMode
): Promise<boolean> {
  const handler = flushHandlers.get(mode);
  if (!handler) {
    return true;
  }

  try {
    return await handler();
  } catch (error) {
    console.error(`Flush handler for mode "${mode}" failed:`, error);
    return false;
  }
}
