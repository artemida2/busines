import { defineCollection, z } from "astro:content";

const productPattern = z.enum([
  "lime",
  "coral",
  "mint",
  "sand",
  "graphite",
  "sky",
]);

const productTrack = z.enum(["marketplace", "services"]);

const productFormat = z.enum([
  "PDF",
  "Notion",
  "Excel",
  "GoogleSheets",
  "Video",
  "Bundle",
  "Template",
  "Access",
]);

const products = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    track: productTrack,
    pattern: productPattern,
    summary: z.string(),
    description: z.string().optional(),
    price: z.number().int().positive(),
    oldPrice: z.number().int().positive().optional(),
    currency: z.literal("RUB").default("RUB"),
    format: productFormat,
    pages: z.number().int().positive().optional(),
    bullets: z.array(z.string()).default([]),
    forWhom: z.array(z.string()).default([]),
    inside: z.array(z.string()).default([]),
    // Ссылка на оплату: ЮKassa hosted page или вебхук n8n,
    // который возвращает confirmation_url. Для MVP — прямой URL.
    paymentUrl: z.string().url().optional(),
    // Ссылка на скачивание после оплаты (выдаёт n8n письмом или
    // редиректом на /thanks/<slug>/). Здесь — fallback для теста.
    downloadUrl: z.string().url().optional(),
    featured: z.boolean().default(false),
    publishedAt: z.coerce.date().optional(),
    updatedAt: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    track: z.enum(["marketplace", "services", "general"]).default("general"),
    pattern: productPattern.default("sand"),
    tags: z.array(z.string()).default([]),
    relatedProducts: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const freebies = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    track: z.enum(["marketplace", "services", "general"]).default("general"),
    pattern: productPattern.default("mint"),
    format: productFormat,
    pages: z.number().int().positive().optional(),
    // Ссылка на форму подписки (n8n webhook / Tally),
    // куда позже будет уходить email для сохранения в базу.
    optinUrl: z.string().url().optional(),
    downloadUrl: z.string().optional(),
  }),
});

export const collections = { products, blog, freebies };
