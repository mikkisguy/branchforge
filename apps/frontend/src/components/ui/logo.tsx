import { APP_NAME, APP_NAME_ABBREVIATED } from "../../lib/version";

interface LogoProps {
  className?: string;
  compact?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
}

export function Logo({ className = "", compact = false, size = "lg" }: LogoProps) {
  const sizeClasses = {
    xs: compact ? "text-lg" : "text-xl",
    sm: compact ? "text-xl" : "text-2xl",
    md: compact ? "text-2xl" : "text-3xl",
    lg: compact ? "text-4xl" : "text-6xl",
  };

  return (
    <h1
      className={`font-display tracking-wide leading-tight pb-2 ${className} ${
        sizeClasses[size]
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
