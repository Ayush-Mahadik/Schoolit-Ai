import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#e8f1ff",
          100: "#d4e5ff",
          200: "#b0cfff",
          300: "#7eb4ff",
          400: "#4a93ff",
          500: "#2d7aff",
          600: "#1b5fd4",
          700: "#154bab",
          800: "#123d8a",
          900: "#0e2f6b",
          950: "#081c42",
        },
        surface: {
          0: "#050a18",
          1: "#0a1228",
          2: "#101b38",
          3: "#182848",
          4: "#1f3358",
        },
        glass: {
          light: "rgba(255, 255, 255, 0.04)",
          medium: "rgba(255, 255, 255, 0.07)",
          heavy: "rgba(255, 255, 255, 0.12)",
          border: "rgba(255, 255, 255, 0.08)",
          "border-hover": "rgba(255, 255, 255, 0.15)",
          accent: "rgba(45, 122, 255, 0.12)",
          "accent-strong": "rgba(45, 122, 255, 0.2)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "Fira Code", "monospace"],
      },
      backdropBlur: {
        xs: "2px",
        "2xl": "40px",
        "3xl": "64px",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-glow": "pulseGlow 2s infinite",
        "shimmer": "shimmer 2.5s ease-in-out infinite",
        "liquid": "liquid 6s ease-in-out infinite",
        "glass-shine": "glassShine 3s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 5px rgba(45, 122, 255, 0.4)" },
          "50%": { boxShadow: "0 0 25px rgba(45, 122, 255, 0.7)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% center" },
          "100%": { backgroundPosition: "200% center" },
        },
        liquid: {
          "0%, 100%": { borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%" },
          "25%": { borderRadius: "58% 42% 75% 25% / 76% 46% 54% 24%" },
          "50%": { borderRadius: "50% 50% 33% 67% / 55% 27% 73% 45%" },
          "75%": { borderRadius: "33% 67% 58% 42% / 63% 68% 32% 37%" },
        },
        glassShine: {
          "0%": { opacity: "0.3" },
          "50%": { opacity: "0.6" },
          "100%": { opacity: "0.3" },
        },
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
        "glass-lg": "0 16px 48px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
        "glass-glow": "0 0 40px rgba(45, 122, 255, 0.15), 0 8px 32px rgba(0, 0, 0, 0.3)",
        "neon": "0 0 15px rgba(45, 122, 255, 0.3), 0 0 45px rgba(45, 122, 255, 0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
