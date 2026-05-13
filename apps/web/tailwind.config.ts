import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Space Grotesk", "sans-serif"],
        syne: ["var(--font-display)", "Space Grotesk", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "monospace"],
        code: ["JetBrains Mono", "var(--font-mono)", "monospace"]
      },
      colors: {
        brand: {
          orange: "#fb923c",
          glow: "#f97316"
        },
        proof: {
          DEFAULT: "#22c55e",
          green: "#22c55e",
          blue: "#60a5fa",
          red: "#ef4444"
        },
        fail: "#ef4444",
        link: "#60a5fa",
        base: "#060608",
        surface: "#0c0c10",
        panel: "#101014"
      },
      backgroundImage: {
        "orange-glow": "radial-gradient(ellipse, rgba(251,146,60,0.15) 0%, transparent 70%)"
      },
      boxShadow: {
        orange: "0 0 24px rgba(251, 146, 60, 0.16)",
        green: "0 0 24px rgba(34, 197, 94, 0.16)",
        red: "0 0 24px rgba(239, 68, 68, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;
