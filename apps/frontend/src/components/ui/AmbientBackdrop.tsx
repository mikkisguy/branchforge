import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type AmbientBackdropProps = {
  className?: string;
};

function getPrefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    getPrefersReducedMotion
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    setPrefersReducedMotion(getPrefersReducedMotion());
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

function AmbientBackdrop({ className }: AmbientBackdropProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  const orbs = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i) => ({
        id: i,
        size: Math.random() * 120 + 80,
        x: Math.random() * 80 + 10,
        y: Math.random() * 80 + 10,
        delay: Math.random() * 4,
        duration: Math.random() * 12 + 18,
      })),
    []
  );

  return (
    <div
      aria-hidden="true"
      data-reduced-motion={prefersReducedMotion ? "true" : "false"}
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
              ellipse 80% 60% at 50% 40%,
              rgba(var(--theme-color-rgb), 0.12) 0%,
              transparent 70%
            ),
            radial-gradient(
              ellipse 50% 40% at 80% 80%,
              rgba(var(--theme-color-rgb), 0.06) 0%,
              transparent 60%
            )
          `,
        }}
      />
      {!prefersReducedMotion &&
        orbs.map((orb) => (
          <div
            key={orb.id}
            className="ambient-backdrop-orb absolute rounded-full"
            style={{
              width: orb.size,
              height: orb.size,
              left: `${orb.x}%`,
              top: `${orb.y}%`,
              background: "rgba(var(--theme-color-rgb), 0.1)",
              animation: `ambient-drift ${orb.duration}s ease-in-out ${orb.delay}s infinite`,
            }}
          />
        ))}
      {!prefersReducedMotion && (
        <style>{`
          @keyframes ambient-drift {
            0%, 100% {
              transform: translate(0, 0) scale(1);
              opacity: 0.05;
            }
            50% {
              transform: translate(12px, -18px) scale(1.04);
              opacity: 0.09;
            }
          }
        `}</style>
      )}
    </div>
  );
}

export { AmbientBackdrop };
