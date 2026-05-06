import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        // Hybrid Editorial + Bold Cards palette
        ink: {
          DEFAULT: "#0B0B0F",
          soft: "#1F2937",
          muted: "#52525B",
          line: "#E4E4E7",
        },
        paper: {
          DEFAULT: "#FFFFFF",
          tint: "#FAFAF9",
        },
        brand: {
          // Доверие/бизнес
          DEFAULT: "#0F62FE",
          dark: "#0043CE",
        },
        money: {
          // Деньги/CTA
          DEFAULT: "#22C55E",
          dark: "#15803D",
        },
        // Категорные паттерны для карточек
        pattern: {
          lime: "#D4F462",
          coral: "#FFB4A2",
          mint: "#A6F0C6",
          sand: "#F5E6C8",
          graphite: "#1F2937",
          sky: "#BAE6FD",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Onest", "Manrope", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      maxWidth: {
        prose: "68ch",
      },
      borderRadius: {
        card: "20px",
      },
      boxShadow: {
        card: "0 1px 0 rgba(11,11,15,0.04), 0 8px 24px -12px rgba(11,11,15,0.10)",
      },
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            "--tw-prose-body": theme("colors.ink.DEFAULT"),
            "--tw-prose-headings": theme("colors.ink.DEFAULT"),
            "--tw-prose-links": theme("colors.brand.DEFAULT"),
            "--tw-prose-bold": theme("colors.ink.DEFAULT"),
            "--tw-prose-quotes": theme("colors.ink.soft"),
            "--tw-prose-quote-borders": theme("colors.brand.DEFAULT"),
            "--tw-prose-bullets": theme("colors.ink.muted"),
            "--tw-prose-counters": theme("colors.ink.muted"),
            maxWidth: "68ch",
            h1: { fontFamily: theme("fontFamily.display").join(",") },
            h2: { fontFamily: theme("fontFamily.display").join(",") },
            h3: { fontFamily: theme("fontFamily.display").join(",") },
          },
        },
      }),
    },
  },
  plugins: [typography],
};
