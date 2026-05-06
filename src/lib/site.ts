export const SITE = {
  name: "Делай Дело",
  tagline:
    "Цифровые инструменты для самозанятых, ИП на услугах и продавцов на маркетплейсах",
  description:
    "Готовые шаблоны, чек‑листы и гайды без воды. Для тех, кто запускается на WB / Ozon и для тех, кто работает с клиентами как самозанятый или ИП.",
  url: "https://artemida2.github.io/busines",
  email: "hello@example.com",
  telegram: "https://t.me/your_channel",
  vk: "",
  inn: "000000000000",
  legalName: "ИП / Самозанятый «Делай Дело»",
} as const;

export const TRACKS = {
  marketplace: {
    slug: "marketplace",
    title: "Маркетплейсы",
    short: "WB · Ozon · Я.Маркет",
    description:
      "Запуск, юнит‑экономика, карточки и SEO. Готовые таблицы и чек‑листы — собирали под себя и продавцов в работе.",
    pattern: "sky" as const,
    accent: "brand" as const,
  },
  services: {
    slug: "services",
    title: "Самозанятые / ИП на услугах",
    short: "Услуги · Договоры · Налоги",
    description:
      "Договоры, чек‑листы регистрации, налоговые калькуляторы, скрипты переписки и личный бренд для эксперта.",
    pattern: "lime" as const,
    accent: "money" as const,
  },
} as const;

export type TrackKey = keyof typeof TRACKS;

export const formatPrice = (rub: number) =>
  new Intl.NumberFormat("ru-RU").format(rub) + " ₽";
