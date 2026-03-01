export function Logo({ className = "" }: { className?: string }) {
  return (
    <h1
      className={`font-display text-6xl tracking-wide leading-tight pb-2 ${className}`}
      style={{
        background:
          "linear-gradient(135deg, var(--theme-color) 0%, white 50%, var(--theme-color) 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    >
      BranchForge
    </h1>
  );
}
