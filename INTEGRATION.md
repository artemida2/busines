# Связка ЮKassa → n8n → Google Drive

Этот документ описывает, как подключить оплату на сайте **Делай Дело**: принимать
платежи через ЮKassa, автоматически выдавать файл из Google Drive (или ссылку
на Notion / Google Sheets) и присылать чек 54‑ФЗ на e‑mail покупателя. Всё работает
с GitHub Pages — у которого нет своего бэкенда — через self‑hosted **n8n** как
посредник.

> Никаких секретов в репозитории. Все ключи живут в credentials вашего n8n.

## Архитектура

```
[GitHub Pages: статичный сайт delo-delai.ru]
        │
        │  1) клик «Перейти к оплате» → POST на n8n webhook
        │     payload: { project: "delaydelo", guide_slug, email, idempotence_key, price_kopeks_check, source_url }
        ▼
[n8n: webhook /delaydelo-create-payment]   (CORS под delo-delai.ru)
        │
        │  2) валидируем slug по белому списку, берём цену из каталога
        │  3) ЮKassa API: создаём платёж + receipt 54‑ФЗ + metadata.project = "delaydelo"
        │     получаем confirmation_url
        │
        │  4) возвращаем confirmation_url → редирект на ЮKassa
        ▼
[ЮKassa: оплата]
        │
        │  5) ЮKassa дёргает собственный webhook магазина «Делай Дело»:
        │     https://hooks.neirolanding.ru/webhook/delaydelo-yukassa
        ▼
[n8n: receiver Делай Дело] /webhook/delaydelo-yukassa
        │
        │  6) Webhook сразу отвечает 200 (responseMode: onReceived).
        │  7) IF event === "payment.succeeded" → Resolve slug → delivery.
        │  8) ветвление по deliveryType:
        │      • file → Google Drive download → Gmail с вложением
        │      • link → Gmail с ссылкой на Drive .zip
        ▼
[Покупатель: получает файл/ссылку и чек 54‑ФЗ от ЮKassa]
```

## Готовые workflow

В каталоге [`n8n/`](./n8n/) лежат два готовых workflow в формате n8n JSON. Импортируйте оба:

- [`delaydelo-create-payment.json`](./n8n/delaydelo-create-payment.json) — создаёт платёж в ЮKassa, возвращает confirmation_url. Путь webhook: `/webhook/delaydelo-create-payment`. CORS под `delo-delai.ru`.
- [`delaydelo-yukassa-receiver.json`](./n8n/delaydelo-yukassa-receiver.json) — принимает уведомления ЮKassa о платеже, скачивает файл из Drive (или формирует письмо со ссылкой) и шлёт письмо. Путь webhook: `/webhook/delaydelo-yukassa`.

Оба workflow полностью изолированы от Special English — у них свои webhook URL, свои credentials и свой магазин ЮKassa.

## Шаг 1 — Настроить ЮKassa

У «Делай Дело» — **отдельный магазин ЮKassa**, не пересекается с другими проектами. Что нужно настроить в кабинете ЮKassa:

1. **Интеграция → Ключи API** → создайте `shopId` и `secretKey`. Сохраните эти два значения — они пойдут в credential `ЮKassa shopId:secretKey` в n8n.
2. **Квитанции 54‑ФЗ** включены. Для самозанятых ЮKassa сама отправляет чеки в «Мой налог».
3. **Интеграция → HTTP-уведомления** → добавьте один webhook на события платежа:
   - **URL:** `https://hooks.neirolanding.ru/webhook/delaydelo-yukassa`
   - **События:** `payment.succeeded` (обязательно), плюс желательно `payment.canceled`, `refund.succeeded` — воркфлоу их игнорирует, но в ЮKassa-логах будет видно, что уведомление доходит.
4. **Тест-режим магазина.** Новые магазины ЮKassa по умолчанию в test mode — это и нужно для первых тестовых платежей картой `5555 5555 5555 4477`. После успешных тестов переключите магазин в production.
5. **Лимиты НПД (самозанятый):**
   - 500 000 ₽/мес на приём по картам через ЮKassa.
   - 2 400 000 ₽/год — общий лимит дохода НПД.
   - При приближении к лимиту — переключение на ИП на УСН 6%, в ЮKassa достаточно поменять реквизиты магазина.

## Шаг 2 — Импортировать workflow в n8n

1. В UI n8n → **Workflows → Import from File** → загрузите оба JSON из `n8n/`.
2. После импорта откройте каждый workflow и **подставьте credentials**:

   | Workflow → узел | Тип credentials | Что подставить |
   |---|---|---|
   | `delaydelo-create-payment` → `YooKassa: POST /v3/payments` | HTTP Basic Auth | `username = shopId`, `password = secretKey` из кабинета ЮKassa «Делай Дело» |
   | `delaydelo-yukassa-receiver` → `Google Drive: download` | Google Drive OAuth2 | OAuth от того аккаунта, в Drive которого лежат файлы продуктов |
   | `delaydelo-yukassa-receiver` → `Gmail: send file` / `Gmail: send link` | Gmail OAuth2 | Почтовый аккаунт, от имени которого письмо уходит покупателю |

   В JSON имена credentials имеют префикс `REPLACE_WITH_YOUR_*` — n8n при первом открытии выделит узел красным и попросит выбрать реальный credential.

3. **Активируйте оба workflow** (тумблер `Active`). Без активации receiver'а ЮKassa будет получать 404 на свои уведомления.

4. **Проверьте пути webhook'ов.** После активации откройте Webhook-узел в каждом workflow и сверьте «Production URL»:
   - `delaydelo-create-payment`: `https://hooks.neirolanding.ru/webhook/delaydelo-create-payment`
   - `delaydelo-yukassa-receiver`: `https://hooks.neirolanding.ru/webhook/delaydelo-yukassa`

5. **Ручный тест receiver'а (опционально).** Чтобы убедиться, что Drive + Gmail работают без реальной оплаты, отправьте в воркфлоу имитацию уведомления ЮKassa через `curl`:

   ```bash
   curl -X POST https://hooks.neirolanding.ru/webhook/delaydelo-yukassa \
     -H 'Content-Type: application/json' \
     -d '{ "event": "payment.succeeded", "object": { "id": "test-001", "status": "succeeded", "amount": { "value": "690.00", "currency": "RUB" }, "metadata": { "project": "delaydelo", "guide_slug": "unit-economy-excel", "email": "you@example.com" }, "receipt": { "customer": { "email": "you@example.com" } } } }'
   ```

   В ответ должно прийти 200 и `{"ok":true}`. Через пару секунд на указанный email придёт письмо с PDF/zip из Drive.

> Для отладки откройте **Executions** выбранного workflow в n8n — видны входящие payload’ы, ветвление If и выход каждого узла.

## Шаг 3 — Каталог продуктов

В рецепте `n8n/delaydelo-yukassa-receiver.json` в карте `MAP` уже проставлены
fileId из Drive для 12 продуктов (`deliveryType: 'file'`, файл идёт вложением)
и `shareUrl` Drive для 4 продуктов с `.zip` (`deliveryType: 'link'` — Gmail режет zip‑вложения,
поэтому отправляем «Anyone with the link» Drive‑ссылку, по которой покупатель скачивает архив сам).
Итого 16 продуктов = 12 файлов + 4 ссылки. Pro‑тарифы калькулятора не реализованы и в каталоге не присутствуют.

| Slug | Тип | Цена |
|---|---|---:|
| `unit-economy-excel` | link (Drive .zip share) | 690 ₽ |
| `wbozon-zero-to-100k` | file (.pdf) | 1 490 ₽ |
| `wb-ozon-card-seo` | link (Drive .zip share) | 990 ₽ |
| `wb-ozon-reviews` | link (Drive .zip share) | 690 ₽ |
| `wb-card-prompts` | file (.pdf) | 590 ₽ |
| `china-suppliers` | file (.pdf) | 990 ₽ |
| `wb-internal-ads` | file (.pdf) | 990 ₽ |
| `ozon-after-wb` | file (.pdf) | 690 ₽ |
| `yandex-market-launch` | file (.pdf) | 690 ₽ |
| `self-employed-coreguide` | file (.pdf) | 1 290 ₽ |
| `self-employed-finance` | link (Drive .zip share) | 690 ₽ |
| `services-marketplaces` | file (.pdf) | 590 ₽ |
| `raise-price-scripts` | file (.pdf) | 590 ₽ |
| `services-time-planning` | file (.pdf) | 590 ₽ |
| `services-targeted-ads` | file (.pdf) | 990 ₽ |
| `services-word-of-mouth` | file (.pdf) | 490 ₽ |

**Как получить fileId Google Drive (если появится новый продукт):** откройте файл → правый клик → «Поделиться» → «Скопировать ссылку». В URL вида `https://drive.google.com/file/d/AAAAA-BBBBB/view?usp=sharing` идентификатор — `AAAAA-BBBBB`.

> **Доступ.** Файлы должны быть доступны сервисному аккаунту/OAuth, который вы привязали к Drive‑credential в n8n. Публичный доступ файла включать НЕ нужно — n8n скачивает файл от своего имени.

## Шаг 4 — Настроить сайт

В файле `src/lib/site.ts` есть объект `PAYMENTS`:

```ts
export const PAYMENTS = {
  n8nBaseUrl: import.meta.env.PUBLIC_N8N_BASE_URL || "https://hooks.neirolanding.ru",
  createPaymentPath: "/webhook/delaydelo-create-payment",
  projectId: "delaydelo",
  supportEmail: "hello@example.com",
};
```

Базовый URL n8n по умолчанию — `https://hooks.neirolanding.ru` (тот же, что у Special English). Если в будущем понадобится переопределить, переменная `PUBLIC_N8N_BASE_URL` пробрасывается на этапе сборки через **GitHub Actions secrets**:

```yaml
- name: Build
  env:
    PUBLIC_N8N_BASE_URL: ${{ secrets.PUBLIC_N8N_BASE_URL }}
  run: npm run build
```

`supportEmail` тоже стоит обновить под реальный — он показывается в форме оплаты, если что‑то пойдёт не так.

## Шаг 5 — Проверка end‑to‑end

1. На сайте откройте любой продукт, например `/products/wbozon-zero-to-100k/`.
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

- **Не записывает продажи в Google Sheets / Airtable.** При желании — добавьте в receiver workflow ещё один узел Google Sheets append после Gmail.
- **Не отправляет напоминание о возврате**, если письмо ушло в спам. На входе в Phase 2 можно прикрутить `Wait 30m → IF email_open == false → resend`.

## Альтернатива на минимуме (без n8n)

Если по каким‑либо причинам сейчас нельзя поднимать n8n — можно переключиться на **Variant A**: статические ЮKassa‑чекауты на каждый продукт.

1. В кабинете ЮKassa → **«Платежи без интеграции» → создать ссылку**.
2. Полученный URL положить в `paymentUrl` соответствующего продукта в `src/content/products/*.md`.
3. В `PaymentForm.astro` поменять submit‑обработчик на `window.location = data.paymentUrl` без обращения к webhook.

Минус: нет автоматической выдачи файла — придётся отслеживать оплаты в кабинете ЮKassa и слать вручную, либо настраивать webhook ЮKassa напрямую на простой n8n‑узел из 2 нод (Webhook + Gmail).
