import { cn } from "@/lib/utils";

type AmbientBackdropProps = {
  className?: string;
};

function AmbientBackdrop({ className }: AmbientBackdropProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden",
        className
      )}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(
              ellipse 62% 52% at 50% 42%,
              rgba(var(--theme-color-rgb), 0.09) 0%,
              transparent 72%
            ),
            linear-gradient(
              135deg,
              transparent 20%,
              rgba(var(--theme-color-rgb), 0.025) 50%,
              transparent 80%
            )
          `,
        }}
      />
      <div
        className="ambient-backdrop-glow absolute -inset-[12%]"
        style={{
          background: `
            radial-gradient(
              circle at 20% 22%,
              rgba(var(--theme-color-rgb), 0.12) 0%,
              transparent 25%
            ),
            radial-gradient(
              circle at 82% 76%,
              rgba(var(--theme-color-rgb), 0.08) 0%,
              transparent 28%
            ),
            radial-gradient(
              circle at 72% 16%,
              rgba(var(--theme-color-rgb), 0.045) 0%,
              transparent 19%
            )
          `,
        }}
      />
    </div>
  );
}

export { AmbientBackdrop };
