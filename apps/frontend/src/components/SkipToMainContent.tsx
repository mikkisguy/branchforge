export function SkipToMainContent() {
  return (
    <a
      href="#main-content"
      onClick={(event) => {
        event.preventDefault();
        document.getElementById("main-content")?.focus();
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-card focus:text-foreground focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-[3px] focus:ring-[hsl(var(--focus-ring-color))] focus:ring-offset-2"
    >
      Skip to main content
    </a>
  );
}
