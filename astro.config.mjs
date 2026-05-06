import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

// Замените SITE_URL после привязки своего домена.
// Пока сайт деплоится по адресу https://artemida2.github.io/busines/
const SITE_URL = process.env.SITE_URL || "https://artemida2.github.io";
const BASE_PATH = process.env.BASE_PATH || "/busines";

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  trailingSlash: "ignore",
  integrations: [
    tailwind({ applyBaseStyles: false }),
    mdx(),
    sitemap(),
  ],
  build: {
    format: "directory",
  },
});
