import { useEffect } from "react";
import { useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function RootRouteError() {
  const error = useRouteError();
  useEffect(() => {
    console.error("Workspace route failed to load:", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-4 text-center text-foreground">
      <h1 className="text-xl font-semibold">BranchForge couldn’t load</h1>
      <p className="text-sm text-muted-foreground">
        Reload the page to try again.
      </p>
      <Button type="button" onClick={() => window.location.reload()}>
        Reload page
      </Button>
    </main>
  );
}
