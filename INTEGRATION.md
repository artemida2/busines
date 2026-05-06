# Связка ЮKassa → n8n → Google Drive

Этот документ описывает, как подключить оплату на сайте **Делай Дело**: принимать
платежи через ЮKassa, автоматически выдавать файл из Google Drive (или ссылку
на Notion / Google Sheets) и присылать чек 54‑ФЗ на e‑mail покупателя. Всё работает
с GitHub Pages — у которого нет своего бэкенда — через self‑hosted **n8n** как
посредник.

> Никаких секретов в репозитории. Все ключи живут в credentials вашего n8n.

## Архитектура

```
[GitHub Pages: статичный сайт]
        │
        │  1) клик «Перейти к оплате» → POST на n8n webhook
        │     payload: { project, guide_slug, email, idempotence_key, price_kopeks_check, source_url }
        ▼
[n8n: webhook /delaydelo-create-payment]
        │
        │  2) валидируем slug по белому списку, берём цену из каталога
        │  3) ЮKassa API: создаём платёж + receipt 54‑ФЗ
        │     получаем confirmation_url
        │
        │  4) возвращаем confirmation_url → редирект на ЮKassa
        ▼
[ЮKassa: оплата]
        │
        │  5) после оплаты ЮKassa дёргает webhook успеха
        ▼
[n8n: webhook /delaydelo-yukassa]
        │
        │  6) проверяем event=payment.succeeded и metadata.project=delaydelo
        │  7) находим товар по metadata.guide_slug
        │  8) ветвление по deliveryType:
        │      • file → Google Drive download → Gmail с вложением
        │      • link → Gmail с ссылкой (Notion duplicate / Sheets копия / Pro доступ)
        ▼
[Покупатель: получает файл/ссылку и чек 54‑ФЗ от ЮKassa]
```

## Готовые workflow

В каталоге [`n8n/`](./n8n/) лежат два готовых workflow в формате n8n JSON. Импортируйте оба:

- [`delaydelo-create-payment.json`](./n8n/delaydelo-create-payment.json) — создаёт платёж в ЮKassa, возвращает confirmation_url. Путь webhook: `/webhook/delaydelo-create-payment`.
- [`delaydelo-yukassa-receiver.json`](./n8n/delaydelo-yukassa-receiver.json) — принимает уведомление об успешной оплате, скачивает файл из Drive (или формирует письмо со ссылкой) и шлёт письмо. Путь webhook: `/webhook/delaydelo-yukassa`.

Оба workflow помечают payload `metadata.project = "delaydelo"`, чтобы один и тот же n8n мог обслуживать несколько сайтов параллельно (например, Special English и Делай Дело — каждый со своим receiver, который фильтрует по project).

## Шаг 1 — Подготовить ЮKassa

1. Зарегистрируйтесь как **самозанятый/ИП** в [ЮKassa](https://yookassa.ru/) или используйте существующий магазин.
2. В кабинете → **Интеграция → Ключи API**: создайте `shopId` и `secretKey`.
3. Включите **квитанцию 54‑ФЗ** (для самозанятых ЮKassa автоматически отправит чек в «Мой налог»).
4. Раздел **«Уведомления»** → добавьте webhook URL и события:
   - URL: `https://<ваш-n8n>/webhook/delaydelo-yukassa`
   - События: `payment.succeeded`, `payment.canceled`, `refund.succeeded`
   - Если у вас уже есть второй проект (например, Special English) — оставьте старый webhook на месте, ЮKassa поддерживает несколько URL одновременно.
5. **Лимиты для НПД (самозанятого):**
   - 500 000 ₽/мес на приём по картам через ЮKassa.
   - 2 400 000 ₽/год — общий лимит дохода НПД.
   - При приближении к лимиту — переключение на ИП на УСН 6%, в ЮKassa достаточно поменять реквизиты магазина.

## Шаг 2 — Импортировать workflow в n8n

1. В UI n8n → **Workflows → Import from File** → загрузите оба JSON из `n8n/`.
2. После импорта откройте каждый workflow и **подставьте credentials**:

   | Узел | Тип credentials | Что подставить |
   |---|---|---|
   | `YooKassa: POST /v3/payments` | HTTP Basic Auth | `username = shopId`, `password = secretKey` (создайте credential с именем «ЮKassa shopId:secretKey» — на него ссылается JSON) |
   | `Google Drive: download` | Google Drive OAuth2 | OAuth от того аккаунта, в Drive которого лежат файлы продуктов |
   | `Gmail: send file` / `Gmail: send link` | Gmail OAuth2 | Тот же или отдельный почтовый аккаунт; от его адреса будет уходить письмо покупателю |

   В JSON указаны имена credentials с префиксом `REPLACE_WITH_YOUR_*` — n8n при первом запуске попросит выбрать реальный credential. Сами JSON редактировать не нужно.

3. **Активируйте оба workflow** (тумблер `Active`).

## Шаг 3 — Загрузить файлы продуктов в Google Drive и проставить fileId

В рецепте `n8n/delaydelo-yukassa-receiver.json` есть карта `MAP` — в ней
для каждого slug указан `deliveryType` и либо `fileId` (для file), либо `shareUrl` (для link).
Замените все `REPLACE_FILE_ID_*` и `REPLACE_*_URL` на реальные значения.

| Slug | Тип | Что подставить |
|---|---|---|
| `unit-economy-excel` | file | fileId .xlsx из Drive |
| `wb-launch-30-days` | file | fileId .pdf из Drive |
| `wb-card-templates` | file | fileId .zip с шаблонами |
| `self-employed-checklist` | file | fileId .pdf |
| `raise-price-scripts` | file | fileId .pdf |
| `contract-template` | file | fileId .zip с .docx + инструкцией |
| `ozon-niche-matrix` | link | URL копии Google Sheets (`/copy` ссылка) |
| `notion-crm-master` | link | URL Notion-страницы с кнопкой Duplicate |
| `calc-pro-year` | link | URL страницы активации Pro (пока заглушка) |
| `calc-pro-lifetime` | link | URL страницы активации Pro (пока заглушка) |

**Как получить fileId Google Drive:** откройте файл → правый клик → «Поделиться» → «Скопировать ссылку». В URL вида `https://drive.google.com/file/d/AAAAA-BBBBB/view?usp=sharing` идентификатор — `AAAAA-BBBBB`.

> **Доступ.** Файл должен быть доступен сервисному аккаунту/OAuth, который вы привязали к Drive‑credential в n8n. Сам публичный доступ файла включать НЕ нужно — n8n скачивает файл от своего имени.

## Шаг 4 — Настроить сайт

В файле `src/lib/site.ts` есть объект `PAYMENTS`:

```ts
export const PAYMENTS = {
  n8nBaseUrl: import.meta.env.PUBLIC_N8N_BASE_URL || "https://ai-konfu-u70272.vm.elestio.app",
  createPaymentPath: "/webhook/delaydelo-create-payment",
  projectId: "delaydelo",
  supportEmail: "hello@example.com",
};
```

Базовый URL n8n переопределяется на этапе сборки через переменную окружения `PUBLIC_N8N_BASE_URL`. Если вы держите n8n на отдельном поддомене — пропишите её в **GitHub Actions secrets** как `PUBLIC_N8N_BASE_URL` и добавьте в `.github/workflows/deploy.yml`:

```yaml
- name: Build
  env:
    PUBLIC_N8N_BASE_URL: ${{ secrets.PUBLIC_N8N_BASE_URL }}
  run: npm run build
```

`supportEmail` тоже стоит обновить под реальный — он показывается в форме оплаты, если что‑то пойдёт не так.

## Шаг 5 — Проверка end‑to‑end

1. На сайте откройте любой продукт, например `/products/unit-economy-excel/`.
2. Введите свой e‑mail, поставьте чекбокс согласия с офертой, нажмите «Перейти к оплате».
3. Должен открыться чекаут ЮKassa в режиме `test` (если в shop включён test mode).
4. Оплатите тестовой картой (`5555 5555 5555 4477`).
5. На указанный email должно прийти **два письма**:
   - От вас — с файлом или ссылкой (через workflow `delaydelo-yukassa-receiver`).
   - От ЮKassa — электронный чек 54‑ФЗ.
6. Перейдёте на страницу `/thanks/<slug>/` после оплаты.

Если файл/чек не пришли — проверьте n8n executions у обоих workflow: видны все шаги и любые ошибки валидации (например, неверный slug).

## Безопасность

- **Цена** в каталоге сайта (`src/content/products/*.md`) и в каталоге n8n (`delaydelo-create-payment.json`) **должны совпадать**. Если расходятся, сервер берёт цену из своего каталога (это безопасно — клиент не может подделать цену), но в `metadata.price_mismatch` будет видно расхождение. Это полезно мониторить.
- Webhook сайта → n8n работает по `https://`, никакой ключ туда не передаётся: всё, что нужно, — это slug и email. Цена считается на сервере по slug.
- ЮKassa secretKey хранится только в credentials n8n — не в репозитории и не в коде сайта.
- Idempotence-Key генерится на клиенте через `crypto.randomUUID()` и пробрасывается в ЮKassa — двойной клик не создаёт два платежа.

## Что НЕ делает эта Phase 1‑интеграция

- **Не делает рекуррент** (автосписания каждый месяц для Pro 490 ₽). Это отдельный workflow с `save_payment_method=true` и cron‑узлом, добавим в Phase 3.
- **Не записывает продажи в Google Sheets / Airtable.** При желании — добавьте в receiver workflow ещё один узел Google Sheets append после Gmail.
- **Не отправляет напоминание о возврате**, если письмо ушло в спам. На входе в Phase 2 можно прикрутить `Wait 30m → IF email_open == false → resend`.

## Альтернатива на минимуме (без n8n)

Если по каким‑либо причинам сейчас нельзя поднимать n8n — можно переключиться на **Variant A**: статические ЮKassa‑чекауты на каждый продукт.

1. В кабинете ЮKassa → **«Платежи без интеграции» → создать ссылку**.
2. Полученный URL положить в `paymentUrl` соответствующего продукта в `src/content/products/*.md`.
3. В `PaymentForm.astro` поменять submit‑обработчик на `window.location = data.paymentUrl` без обращения к webhook.

Минус: нет автоматической выдачи файла — придётся отслеживать оплаты в кабинете ЮKassa и слать вручную, либо настраивать webhook ЮKassa напрямую на простой n8n‑узел из 2 нод (Webhook + Gmail).
