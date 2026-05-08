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
        │     payload: { project: "delaydelo", guide_slug, email, idempotence_key, price_kopeks_check, source_url }
        ▼
[n8n: webhook /delaydelo-create-payment]   (отдельный, со своим CORS под delo-delai.ru)
        │
        │  2) валидируем slug по белому списку, берём цену из каталога
        │  3) ЮKassa API: создаём платёж + receipt 54‑ФЗ + metadata.project = "delaydelo"
        │     получаем confirmation_url
        │
        │  4) возвращаем confirmation_url → редирект на ЮKassa
        ▼
[ЮKassa: оплата]
        │
        │  5) ЮKassa дёргает ОДИН общий webhook (тот, что зарегистрирован под shop):
        │     https://hooks.neirolanding.ru/webhook/yukassa
        ▼
[n8n: существующий receiver Special English] /webhook/yukassa
        │
        │  6) сразу после Webhook+IF(payment.succeeded) — Switch по metadata.project:
        │      • "special-english" / пусто  → штатная ветвь Special English (как сейчас)
        │      • "delaydelo"                 → Execute Workflow → sub-workflow Делай Дело
        ▼
[n8n: sub-workflow Делай Дело — delaydelo-yukassa-receiver.json]
        │
        │  7) находим товар по metadata.guide_slug
        │  8) ветвление по deliveryType:
        │      • file → Google Drive download → Gmail с вложением
        │      • link → Gmail с ссылкой (Notion duplicate / Sheets копия / Pro доступ)
        ▼
[Покупатель: получает файл/ссылку и чек 54‑ФЗ от ЮKassa]
```

## Готовые workflow

В каталоге [`n8n/`](./n8n/) лежат два готовых workflow в формате n8n JSON. Импортируйте оба:

- [`delaydelo-create-payment.json`](./n8n/delaydelo-create-payment.json) — создаёт платёж в ЮKassa, возвращает confirmation_url. Путь webhook: `/webhook/delaydelo-create-payment`. **Отдельный URL**, с CORS под `delo-delai.ru`.
- [`delaydelo-yukassa-receiver.json`](./n8n/delaydelo-yukassa-receiver.json) — **sub-workflow**: принимает данные о платеже (через `Execute Workflow Trigger`), скачивает файл из Drive (или формирует письмо со ссылкой) и шлёт письмо. **Своего webhook не имеет** — его вызывает существующий receiver Special English.

Оба workflow помечают payload `metadata.project = "delaydelo"`, чтобы один и тот же n8n мог обслуживать несколько сайтов параллельно. ЮKassa-уведомления приходят на **один общий webhook** Special English `/webhook/yukassa`, оттуда Switch по `metadata.project` направляет события в нужный sub-workflow.

## Шаг 1 — Подготовить ЮKassa

Если у вас уже подключена ЮKassa для другого проекта (например, Special English) и используется тот же магазин — **новый shop регистрировать не нужно**, новый webhook регистрировать тоже не нужно. Действующий `https://hooks.neirolanding.ru/webhook/yukassa` будет работать для обоих проектов; они различаются по `metadata.project` в payload платежа.

Если же вы только подключаете ЮKassa с нуля:

1. Зарегистрируйтесь как **самозанятый/ИП** в [ЮKassa](https://yookassa.ru/).
2. В кабинете → **Интеграция → Ключи API**: создайте `shopId` и `secretKey`.
3. Включите **квитанцию 54‑ФЗ** (для самозанятых ЮKassa автоматически отправит чек в «Мой налог»).
4. Раздел **«Уведомления»** → добавьте один webhook URL и события:
   - URL: `https://hooks.neirolanding.ru/webhook/yukassa`
   - События: `payment.succeeded`, `payment.canceled`, `refund.succeeded`
5. **Лимиты для НПД (самозанятого):**
   - 500 000 ₽/мес на приём по картам через ЮKassa.
   - 2 400 000 ₽/год — общий лимит дохода НПД.
   - При приближении к лимиту — переключение на ИП на УСН 6%, в ЮKassa достаточно поменять реквизиты магазина.

## Шаг 2 — Импортировать workflow в n8n

1. В UI n8n → **Workflows → Import from File** → загрузите оба JSON из `n8n/`.
2. После импорта откройте каждый workflow и **подставьте credentials**:

   | Workflow → узел | Тип credentials | Что подставить |
   |---|---|---|
   | `delaydelo-create-payment` → `YooKassa: POST /v3/payments` | HTTP Basic Auth | `username = shopId`, `password = secretKey` — тот же credential, что в Special English create-payment, или новый, если магазин отдельный |
   | `delaydelo-yukassa-receiver` → `Google Drive: download` | Google Drive OAuth2 | OAuth от того аккаунта, в Drive которого лежат файлы продуктов |
   | `delaydelo-yukassa-receiver` → `Gmail: send file` / `Gmail: send link` | Gmail OAuth2 | Тот же или отдельный почтовый аккаунт; от его адреса будет уходить письмо покупателю |

   В JSON имена credentials имеют префикс `REPLACE_WITH_YOUR_*` — n8n при первом запуске попросит выбрать реальный credential. Сами JSON редактировать не нужно.

3. **Активируйте `delaydelo-create-payment`** (тумблер `Active`). Receiver-subflow `delaydelo-yukassa-receiver` сам ничем не активируется — он вызывается из родительского workflow (см. Шаг 2.5).

## Шаг 2.5 — Подключить subflow к существующему receiver Special English

Идея: ЮKassa шлёт уведомления на ОДИН общий webhook `/webhook/yukassa`, который у вас уже работает в Special English. После проверки `event === "payment.succeeded"` нужно ветвить поток по `metadata.project`: для `"delaydelo"` — вызвать subflow «Делай Дело», для всего остального — оставить штатную логику Special English.

**Шаги в UI n8n:**

1. Откройте существующий workflow Special English receiver (тот, что слушает `/webhook/yukassa`).
2. Сразу **после узла `Only payment.succeeded1`** добавьте узел **`Switch`** (n8n-nodes-base.switch).
3. Настройте Switch:
   - **Mode**: `Rules`
   - **Routing Rule 1**:
     - Value 1 (left): `={{ $json.body.object.metadata.project || 'special-english' }}`
     - Operation: `equals`
     - Value 2 (right): `delaydelo`
     - Output: `0`
   - **Routing Rule 2**:
     - Value 1 (left): `={{ $json.body.object.metadata.project || 'special-english' }}`
     - Operation: `equals`
     - Value 2 (right): `special-english`
     - Output: `1`
   - **Fallback Output**: `1` (на всякий случай — пусть пустой/неизвестный project едет в Special English как раньше)
4. К **Output 0** Switch'а подключите узел **`Execute Workflow`**:
   - **Workflow**: выберите импортированный `Делай Дело — receiver subflow`
   - **Input Data Mode**: `Pass through items` (или `Define manually` с выражением `={{ $json }}`)
5. К **Output 1** Switch'а подключите штатную ветвь Special English (`Resolve slug → file + email1` — то, что было подключено к выходу IF).
6. Сохраните workflow и активируйте (если он уже не активен).

**Проверка:** в существующем pin-data узла Webhook (или живым тестом) вы увидите, что для платежа с `metadata.project = "special-english"` поток идёт по штатной ветке, а с `metadata.project = "delaydelo"` — вызывается subflow и присылает соответствующее письмо.

> Если хотите проверить subflow в изоляции, не дожидаясь реальной оплаты — у subflow есть `Manual Trigger` (узел `Test: Manual Trigger`). В UI выберите его, нажмите `Execute Node`, в pin-data узла подставьте JSON вида:
>
> ```json
> { "body": { "event": "payment.succeeded", "object": { "id": "test-001", "amount": { "value": "2990.00", "currency": "RUB" }, "metadata": { "project": "delaydelo", "guide_slug": "unit-economy-excel", "email": "you@example.com" }, "receipt": { "customer": { "email": "you@example.com" } } } } }
> ```

## Шаг 3 — Каталог продуктов

В рецепте `n8n/delaydelo-yukassa-receiver.json` в карте `MAP` уже проставлены
fileId из Drive для 16 платных продуктов. 2 Pro‑тарифа идут через `deliveryType: 'link'`
и ведут на страницу активации (пока заглушка `https://delo-delai.ru/pro-access/`).

| Slug | Тип | Цена |
|---|---|---:|
| `unit-economy-excel` | file (.zip) | 690 ₽ |
| `wbozon-zero-to-100k` | file (.pdf) | 1 490 ₽ |
| `wb-ozon-card-seo` | file (.zip) | 990 ₽ |
| `wb-ozon-reviews` | file (.zip) | 690 ₽ |
| `wb-card-prompts` | file (.pdf) | 590 ₽ |
| `china-suppliers` | file (.pdf) | 990 ₽ |
| `wb-internal-ads` | file (.pdf) | 990 ₽ |
| `ozon-after-wb` | file (.pdf) | 690 ₽ |
| `yandex-market-launch` | file (.pdf) | 690 ₽ |
| `self-employed-coreguide` | file (.pdf) | 1 290 ₽ |
| `self-employed-finance` | file (.zip) | 690 ₽ |
| `services-marketplaces` | file (.pdf) | 590 ₽ |
| `raise-price-scripts` | file (.pdf) | 590 ₽ |
| `services-time-planning` | file (.pdf) | 590 ₽ |
| `services-targeted-ads` | file (.pdf) | 990 ₽ |
| `services-word-of-mouth` | file (.pdf) | 490 ₽ |
| `calc-pro-year` | link | 2 990 ₽ |
| `calc-pro-lifetime` | link | 9 900 ₽ |

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

- **Не делает рекуррент** (автосписания каждый месяц для Pro 490 ₽). Это отдельный workflow с `save_payment_method=true` и cron‑узлом, добавим в Phase 3.
- **Не записывает продажи в Google Sheets / Airtable.** При желании — добавьте в receiver workflow ещё один узел Google Sheets append после Gmail.
- **Не отправляет напоминание о возврате**, если письмо ушло в спам. На входе в Phase 2 можно прикрутить `Wait 30m → IF email_open == false → resend`.

## Альтернатива на минимуме (без n8n)

Если по каким‑либо причинам сейчас нельзя поднимать n8n — можно переключиться на **Variant A**: статические ЮKassa‑чекауты на каждый продукт.

1. В кабинете ЮKassa → **«Платежи без интеграции» → создать ссылку**.
2. Полученный URL положить в `paymentUrl` соответствующего продукта в `src/content/products/*.md`.
3. В `PaymentForm.astro` поменять submit‑обработчик на `window.location = data.paymentUrl` без обращения к webhook.

Минус: нет автоматической выдачи файла — придётся отслеживать оплаты в кабинете ЮKassa и слать вручную, либо настраивать webhook ЮKassa напрямую на простой n8n‑узел из 2 нод (Webhook + Gmail).
