/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "hsl(var(--ink))",
        ivory: "hsl(var(--ivory))",
        cream: "hsl(var(--cream))",
        parchment: "hsl(var(--parchment))",
        burgundy: "hsl(var(--burgundy))",
        gold: "hsl(var(--gold))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        card: "hsl(var(--card))",
        border: "hsl(var(--border))",
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
