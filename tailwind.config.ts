import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // semantic spread colors used by SpreadTable
        good: "#22c55e",
        warn: "#eab308",
        bad: "#ef4444",
      },
    },
  },
  plugins: [],
};

export default config;
