import type { Config } from "tailwindcss";

/*
 * Design tokens. One accent (amber — the game's gold) so a highlighted number always means the same
 * thing; sky is reserved for links. Text sizes stop at 12px because anything smaller failed the
 * readability audit next to the game client. Radius stays stock: panels rounded-lg, controls rounded-md.
 * The `brand` colours belong to the owl logo and its wordmark only; they are not UI accents, so the
 * single-accent rule above still holds for everything interactive.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        surface: "#171717",
        raised: "rgb(38 38 38 / 0.6)",
        line: "#262626",
        fg: "#f5f5f5",
        muted: "#a3a3a3",
        // neutral-500: the dimmest text that still clears 4.5:1 on the page background
        subtle: "#737373",
        accent: "#fbbf24",
        info: "#38bdf8",
        // semantic spread colors used by SpreadTable
        good: "#22c55e",
        warn: "#eab308",
        bad: "#ef4444",
        // sampled from the owl mascot: its teal plumage and bone-white face
        brand: {
          teal: "#2f7d77",
          "teal-hi": "#5fb5ad",
          bone: "#efe6d2",
        },
      },
      fontSize: {
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "20px" }],
        base: ["14px", { lineHeight: "20px" }],
        lg: ["16px", { lineHeight: "24px" }],
        xl: ["20px", { lineHeight: "28px" }],
      },
      keyframes: {
        // a slow amber glow on the Coach owl, so the helper reads as alive without a badge
        breathe: {
          "0%, 100%": { filter: "drop-shadow(0 0 0 rgb(251 191 36 / 0))" },
          "50%": { filter: "drop-shadow(0 0 6px rgb(251 191 36 / 0.55))" },
        },
      },
      animation: {
        breathe: "breathe 3.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
