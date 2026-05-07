# Делай Дело — магазин цифровых продуктов

Многостраничный сайт на **Astro + Tailwind**, который продаёт цифровые продукты в двух направлениях:

- **Маркетплейсы** — гайды, шаблоны и таблицы для продавцов на WB / Ozon / Я.Маркете.
- **Самозанятые / ИП на услугах** — договоры, чек‑листы, налоговые калькуляторы, скрипты.

Стиль — **Hybrid Editorial + Bold Cards**: минимализм базы, жирные карточки‑«арт‑объекты»
и журнальный блог. Полный разбор концепции — в [docs/concept.md](./docs/concept.md), интеграции
платежа и доставки — в [INTEGRATION.md](./INTEGRATION.md).

## Стек

- [Astro 4](https://astro.build/) — статический генератор.
- [Tailwind CSS 3](https://tailwindcss.com/) — утилитарные стили.
- [MDX](https://mdxjs.com/) — поддержка JSX внутри Markdown.
- Content Collections с типобезопасной валидацией Zod.
- Хостинг — **GitHub Pages**, деплой через GitHub Actions.
- Платежи — **ЮKassa**, оркестрация — **n8n**, хранилище файлов — **Google Drive**
  (см. [INTEGRATION.md](./INTEGRATION.md)).

## Структура

```text
src/
├── components/      # Hero, ProductCard, BlogCard, Header, Footer и т. п.
├── content/
│   ├── products/    # карточки цифровых продуктов (Markdown + frontmatter)
│   ├── blog/        # статьи блога
│   └── freebies/    # бесплатные материалы для лидов
├── layouts/         # BaseLayout + слоты SEO/og
├── lib/             # site.ts с настройками магазина
├── pages/
│   ├── index.astro
│   ├── marketplace/{index,catalog}.astro
│   ├── services/{index,catalog}.astro
│   ├── products/{index,[slug]}.astro
│   ├── blog/{index,[slug]}.astro
│   ├── freebies/{index,[slug]}.astro
│   ├── thanks/{index,[slug]}.astro
│   ├── legal/{offer,privacy}.astro
│   ├── about.astro · faq.astro · contacts.astro · 404.astro
└── styles/global.css
```

## Локально

```bash
npm install
npm run dev      # http://localhost:4321/
npm run build    # сборка в dist/
npm run preview  # локальный просмотр build
```

> Сайт деплоится на GitHub Pages под кастомным доменом
> `https://delo-delai.ru/` (CNAME → artemida2.github.io). `SITE_URL` и
> `BASE_PATH` задаются в [astro.config.mjs](./astro.config.mjs)
> или прокиньте их через переменные окружения.

## Добавить новый продукт

1. Создайте файл `src/content/products/<slug>.md`.
2. Заполните frontmatter — поля валидируются [`src/content/config.ts`](./src/content/config.ts).
3. Поставьте `paymentUrl` (см. [INTEGRATION.md](./INTEGRATION.md), секция «ЮKassa»).
4. Закоммитьте — деплой автоматический.

Минимальный пример:

```yaml
---
title: "Название продукта"
track: "marketplace"      # или "services"
pattern: "sky"            # lime | coral | mint | sand | graphite | sky
summary: "Короткое описание для карточки."
price: 690
format: "PDF"             # PDF | Excel | GoogleSheets | Notion | Video | Bundle | Template
featured: true
publishedAt: 2026-05-06
bullets: ["Пункт 1", "Пункт 2"]
forWhom: ["Кому 1", "Кому 2"]
inside:  ["Что внутри 1", "Что внутри 2"]
paymentUrl: "https://yookassa.ru/your-link"
---

Текст с разбором продукта в Markdown.
```

## Юр. обвязка

Шаблоны оферты и политики конфиденциальности — в `src/pages/legal/`. Перед публикацией
**обязательно**:

- замените реквизиты в [`src/lib/site.ts`](./src/lib/site.ts);
- согласуйте текст с юристом;
- проверьте наличие согласия на рассылку в формах.

## Деплой

Любой пуш в `main` поднимает workflow [`deploy.yml`](.github/workflows/deploy.yml). При первом
деплое включите GitHub Pages:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Дождитесь успешного workflow.
3. Откройте `https://delo-delai.ru/`.
