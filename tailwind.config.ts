import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#fdf8f2",
        "warm-sand": "#f0e6d9",
        "deep-charcoal": "#2c3e4f",
        sage: "#8ba88b",
        terracotta: "#d18b7c",
        "dusty-blue": "#7c9eb2",
      },
      spacing: {
        xs: "0.5rem",
        sm: "1rem",
        md: "1.5rem",
        lg: "2rem",
        xl: "3rem",
      },
      borderRadius: {
        card: "1rem",
        button: "0.75rem",
        input: "0.75rem",
      },
      boxShadow: {
        subtle: "0 4px 12px rgba(44, 62, 79, 0.05)",
        hover: "0 8px 24px rgba(44, 62, 79, 0.08)",
      },
      fontFamily: {
        sans: ["var(--font-quicksand)", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        slogan: "0.02em",
        "slogan-wide": "0.04em",
      },
      lineHeight: {
        body: "1.6",
        heading: "1.3",
      },
      keyframes: {
        "gentle-fade": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "gentle-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "gentle-bounce": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.05)" },
        },
      },
      animation: {
        "fade-in": "gentle-fade 0.4s ease",
        pulse: "gentle-pulse 2s infinite",
        celebration: "gentle-bounce 0.5s ease",
      },
    },
  },
  plugins: [],
};

export default config;
