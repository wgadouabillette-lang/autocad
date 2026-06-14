/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "var(--ink-900)",
          850: "var(--ink-850)",
          800: "var(--ink-800)",
          750: "var(--ink-750)",
          700: "var(--ink-700)",
          divider: "var(--ink-divider)",
          600: "var(--ink-600)",
          500: "var(--ink-500)",
          chrome: "var(--ink-chrome)",
          "left-panel": "var(--ink-left-panel)",
        },
        brand: {
          200: "#f0f0f0",
          300: "#e0e0e0",
          400: "#b3b3b3",
          500: "#999999",
          600: "#737373",
        },
        forma: {
          bg: "var(--forma-bg)",
          panel: "var(--forma-panel)",
          border: "var(--forma-border)",
          stroke: "var(--forma-stroke)",
          chrome: "var(--forma-chrome)",
          "chrome-active": "var(--forma-chrome-active)",
          control: "var(--forma-control-bg)",
          "control-border": "var(--forma-control-border)",
          "control-hover": "var(--forma-control-hover-bg)",
          text: "var(--forma-text)",
          "user-bubble": "var(--forma-user-bubble-bg)",
          overlay: "var(--forma-overlay)",
        },
        muted: {
          100: "var(--muted-100)",
          200: "var(--muted-200)",
          300: "var(--muted-300)",
          400: "var(--muted-400)",
          500: "var(--muted-500)",
        },
        composer: {
          surface: "var(--forma-chat-composer-bg)",
          stroke: "var(--forma-chat-composer-stroke)",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
