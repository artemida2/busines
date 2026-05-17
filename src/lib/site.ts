export const SITE = {
  name: "Делай Дело",
  tagline:
    "Цифровые инструменты для самозанятых, ИП на услугах и продавцов на маркетплейсах",
  description:
    "Готовые шаблоны, чек‑листы и гайды без воды. Для тех, кто запускается на WB / Ozon и для тех, кто работает с клиентами как самозанятый или ИП.",
  url: "https://delo-delai.ru",
  email: "aiinformatorbot@gmail.com",
} as const;

/**
 * Конфигурация платёжного шлюза.
 * Все значения можно переопределить через PUBLIC_* env-переменные при сборке —
 * см. astro.config.mjs / GitHub Actions secrets.
 */
export const PAYMENTS = {
  /** Базовый URL n8n. Например: https://hooks.neirolanding.ru */
  n8nBaseUrl:
    import.meta.env.PUBLIC_N8N_BASE_URL || "https://hooks.neirolanding.ru",
  /** Путь webhook'а на n8n, который инициирует платёж в ЮKassa и возвращает confirmation_url */
  createPaymentPath: "/webhook/delaydelo-create-payment",
  /** Идентификатор проекта — кладём в metadata, чтобы единый n8n обслуживал несколько сайтов */
  projectId: "delaydelo",
  /** Контактный email для проблем с оплатой/доставкой (показываем в форме) */
  supportEmail: "aiinformatorbot@gmail.com",
} as const;

export const paymentEndpoint = (): string =>
  PAYMENTS.n8nBaseUrl.replace(/\/$/, "") + PAYMENTS.createPaymentPath;

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
