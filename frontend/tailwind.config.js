/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "hsl(var(--ink) / <alpha-value>)",
        ivory: "hsl(var(--ivory) / <alpha-value>)",
        cream: "hsl(var(--cream) / <alpha-value>)",
        parchment: "hsl(var(--parchment) / <alpha-value>)",
        burgundy: "hsl(var(--burgundy) / <alpha-value>)",
        gold: "hsl(var(--gold) / <alpha-value>)",
        here: "hsl(var(--here) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        "muted-foreground": "hsl(var(--muted-foreground) / <alpha-value>)",
        card: "hsl(var(--card) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Libre Baskerville", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: { lg: "0.25rem", md: "0.1875rem", sm: "0.125rem" },
      boxShadow: {
        editorial: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
        "editorial-md": "0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)",
      },
    },
  },
  plugins: [],
}
