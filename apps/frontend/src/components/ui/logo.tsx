import { APP_NAME, APP_NAME_ABBREVIATED } from "../../lib/version";

interface LogoProps {
  className?: string;
  compact?: boolean;
}

export function Logo({ className = "", compact = false }: LogoProps) {
  return (
    <h1
      className={`font-display tracking-wide leading-tight pb-2 ${className} ${
        compact ? "text-4xl" : "text-6xl"
      }`}
      style={{
        background:
          "linear-gradient(135deg, var(--theme-color) 0%, white 50%, var(--theme-color) 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
      title={compact ? APP_NAME : ""}
    >
      {compact ? APP_NAME_ABBREVIATED : APP_NAME}
    </h1>
  );
}
