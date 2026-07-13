/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  safelist: [
    "bg-[#6c9385]",
    "bg-[#4e95b1]",
    "bg-[#5b6ae0]",
    "bg-[#9549b6]",
    "bg-[#6a6d95]",
    // Dynamic theme swatch classes
    "bg-forest-500",
    "bg-periwinkle-500",
    "bg-dark-amethyst-500",
    "bg-graphite-500",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Kanit", "sans-serif"],
        display: ["Sirin Stencil", "cursive"],
        code: ["Fira Code", "monospace"],
      },
      letterSpacing: {
        tighter: "-0.05em",
      },
      utilities: {
        "scrollbar-hide": {
          "&::-webkit-scrollbar": {
            display: "none",
          },
          "-ms-overflow-style": "none",
          "scrollbar-width": "none",
        },
      },
      colors: {
        border: "var(--theme-border)",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        theme: {
          DEFAULT: "var(--theme-primary)",
          hover: "var(--theme-primary-hover)",
          accent: "var(--theme-accent)",
          "accent-hover": "var(--theme-accent-hover)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          muted: "hsl(var(--destructive-muted))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // BranchForge custom palettes
        forest: {
          50: "#f0f9f4",
          100: "#dcf2e8",
          200: "#b5e5cf",
          300: "#8ed7b5",
          400: "#67c99b",
          500: "#40bb82",
          600: "#339668",
          700: "#26714e",
          800: "#194c34",
          900: "#0c271a",
          950: "#06140d",
        },
        periwinkle: {
          50: "#ecedf9",
          100: "#d8d3",
          200: "#b1b7e7",
          300: "#8b93da",
          400: "#646fce",
          500: "#3d4ac2",
          600: "#313c9b",
          700: "#252d74",
          800: "#181e4e",
          900: "#0c0f27",
          950: "#090a1b",
        },
        "dark-amethyst": {
          50: "#f4edf8",
          100: "#ead0",
          200: "#d5b6e2",
          300: "#c092d3",
          400: "#ab6dc5",
          500: "#9549b6",
          600: "#783a92",
          700: "#5a2c6d",
          800: "#3c1d49",
          900: "#1e0f24",
          950: "#150a1a",
        },
        graphite: {
          50: "#f8f8f8",
          100: "#e8e8e8",
          200: "#d0d0d0",
          300: "#b8b8b8",
          400: "#a0a0a0",
          500: "#888888",
          600: "#6d6d6d",
          700: "#525252",
          800: "#373737",
          900: "#1c1c1c",
          950: "#0e0e0e",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
