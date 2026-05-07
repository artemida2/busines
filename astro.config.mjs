import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

// Сайт деплоится на кастомный домен https://delo-delai.ru/
// (CNAME → artemida2.github.io). Если когда-то понадобится откатиться обратно
// на github.io-поддомен — переопредели через переменные окружения.
const SITE_URL = process.env.SITE_URL || "https://delo-delai.ru";
const BASE_PATH = process.env.BASE_PATH || "/";

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
