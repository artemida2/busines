# Связка ЮKassa → n8n → Google Drive

Этот документ описывает, как «оживить» сайт: принимать оплату ЮKassa, автоматически
выдавать ссылку на скачивание из Google Drive и присылать чек 54‑ФЗ на e‑mail
покупателя. Всё держится на одном self‑hosted **n8n** и работает с GitHub Pages,
у которого нет своего бэкенда.

> Никаких секретов в репозитории. Все ключи живут в переменных окружения вашего n8n.

## Архитектура

```
[GitHub Pages: статичный сайт]
        │
        │  1) клик «Купить» → POST на n8n webhook
        │     payload: { product, price, email }
        ▼
[n8n: webhook /create-payment]
        │
        │  2) ЮKassa API: создаёт платёж и chequepayment
        │     получаем confirmation_url
        ▼
        │  3) возвращает confirmation_url → редирект на ЮKassa
        ▼
[ЮKassa: оплата]
        │
        │  4) после оплаты ЮKassa вызывает webhook успеха
        ▼
[n8n: webhook /yookassa-success]
        │
        │  5) находит товар по metadata.product
        │  6) генерирует подписанную ссылку Google Drive
        │  7) отправляет e‑mail с ссылкой через SMTP (Yandex / Mail.ru / SendGrid)
        │  8) логирует продажу в Google Sheets / Airtable
        ▼
[Покупатель: получает ссылку и чек]
```

## Шаг 1 — Подготовить ЮKassa

1. Зарегистрируйтесь как **самозанятый/ИП** в [ЮKassa](https://yookassa.ru/).
2. Подключите **shopId** и **secretKey** в кабинете → Интеграция → API.
3. Включите квитанцию для самозанятого (54‑ФЗ).
4. В разделе «Уведомления» добавьте webhook:
   `https://<ваш‑n8n>/webhook/yookassa-success` (включите события
   `payment.succeeded` и `payment.canceled`).

> **Ваш фронт никогда не общается с ЮKassa напрямую.** Создание платежа делает
> n8n с серверным `secretKey` — иначе любой посетитель сайта мог бы видеть ваш ключ.

## Шаг 2 — Workflow n8n: создание платежа

Создайте workflow `create-payment`:

| Узел | Тип | Настройки |
|---|---|---|
| 1. Webhook | `Webhook` | `POST /webhook/create-payment`, response = `Last node` |
| 2. Set | `Set` | вытягиваем `product`, `email`, `price` из тела |
| 3. HTTP Request | `HTTP Request` | см. ниже |
| 4. Respond to Webhook | `Respond to Webhook` | возвращаем `confirmation.confirmation_url` |

Конфигурация HTTP Request к ЮKassa:

- **Method:** `POST`
- **URL:** `https://api.yookassa.ru/v3/payments`
- **Authentication:** Basic Auth, `shopId : secretKey`
- **Headers:**
  - `Idempotence-Key`: `={{$randomUUID}}`
  - `Content-Type: application/json`
- **Body (JSON):**

```json
{
  "amount": { "value": "{{ $json.price }}.00", "currency": "RUB" },
  "capture": true,
  "description": "Цифровой продукт: {{ $json.product }}",
  "confirmation": {
    "type": "redirect",
    "return_url": "https://artemida2.github.io/busines/thanks/{{ $json.product }}/"
  },
  "receipt": {
    "customer": { "email": "{{ $json.email }}" },
    "items": [{
      "description": "{{ $json.product }}",
      "quantity": "1.00",
      "amount": { "value": "{{ $json.price }}.00", "currency": "RUB" },
      "vat_code": 1,
      "payment_subject": "service",
      "payment_mode": "full_payment"
    }]
  },
  "metadata": {
    "product": "{{ $json.product }}",
    "site": "github-pages-busines"
  }
}
```

Возвращаем фронту:

```json
{ "confirmation_url": "{{ $json.confirmation.confirmation_url }}" }
```

## Шаг 3 — Кнопка «Купить» на сайте

В карточке продукта (`src/pages/products/[slug].astro`) кнопка «Купить» использует
`paymentUrl` из frontmatter. Есть два варианта:

### Вариант A — статический ЮKassa‑чекаут (просто, без n8n)

Создайте в кабинете ЮKassa **«Магазин» с страницей оплаты** для каждого продукта,
получите готовый URL и положите его в `paymentUrl` продукта:

```yaml
paymentUrl: "https://yookassa.ru/checkout/payments/v2/contract?orderId=..."
```

Минусы: e‑mail покупателя попадает к вам только через ЮKassa, выдача файла —
в ручном режиме (или через настроенный в ЮKassa redirect и отдельный n8n‑webhook).

### Вариант B — динамический через n8n (рекомендую)

В `paymentUrl` оставляете URL вашего n8n‑webhook:

```yaml
paymentUrl: "https://<ваш-n8n>/webhook/create-payment?product=wb-launch-30-days&price=990"
```

И добавляете в `src/components/ProductCard.astro` (или прямо в `[slug].astro`) JS, который
сначала спрашивает e‑mail, потом дергает webhook и редиректит на confirmation_url.

Минимальный сниппет для кнопки:

```html
<button id="buy" data-webhook="..." data-product="..." data-price="...">Купить</button>
<script type="module">
  document.querySelector("#buy")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const email = window.prompt("Куда отправить файл? Введите e‑mail");
    if (!email) return;
    const res = await fetch(btn.dataset.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: btn.dataset.product,
        price: Number(btn.dataset.price),
        email,
      }),
    });
    const { confirmation_url } = await res.json();
    if (confirmation_url) location.href = confirmation_url;
  });
</script>
```

## Шаг 4 — Workflow n8n: успешная оплата

Создайте workflow `yookassa-success`:

| Узел | Тип | Назначение |
|---|---|---|
| 1. Webhook | `Webhook` | `POST /webhook/yookassa-success`, читаем тело |
| 2. IF | `IF` | `event === payment.succeeded` |
| 3. Set | `Set` | `productSlug = object.metadata.product`, `email = object.receipt.customer.email` |
| 4. Google Drive | `Google Drive` | находим файл по имени `{{$json.productSlug}}.pdf`, генерируем shareable link |
| 5. SMTP | `Send Email` | отправляем письмо «ваш файл готов» с ссылкой |
| 6. Google Sheets | `Append row` | логируем продажу: дата, продукт, сумма, e‑mail |

Шаблон письма:

```text
Тема: Ваш файл «{{$json.productSlug}}» готов

Здравствуйте!

Спасибо за покупку. Ссылка на скачивание (действует 30 дней):

{{$json.driveLink}}

Чек об оплате 54‑ФЗ ЮKassa отправит отдельным письмом.
Если ссылка не открывается — ответьте на это письмо.

— Делай Дело
```

## Шаг 5 — Хранение файлов в Google Drive

1. Создайте отдельную папку `busines-products`.
2. Положите файлы с именами, совпадающими со `slug` продукта (`wb-launch-30-days.pdf`).
3. В n8n используйте Google Drive → **Generate Sharing Link** → `anyone with link can view`.
4. (Опционально) включите истечение срока через скрипт Google Apps Script, чтобы ссылки
   были «одноразовыми».

> Альтернатива: загружать файлы в S3‑совместимое хранилище (Selectel S3, VK Cloud Object Storage)
> и выдавать **pre‑signed URL** на 24–72 часа. Это безопаснее, но требует настройки.

## Шаг 6 — Аналитика

- Подключите **Яндекс.Метрику** (бесплатно): добавьте счётчик в `BaseLayout.astro`,
  включите Вебвизор, настройте цели:
  - `click_buy` — клик на кнопку «Купить» (отслеживаем JS‑событием);
  - `purchase_success` — переход на `/thanks/<slug>/` (URL‑цель);
  - `freebie_optin` — отправка формы лид‑магнита.
- Используйте UTM‑метки на всех внешних ссылках (TikTok, Instagram, Telegram).

## Шаг 7 — Чек‑лист безопасности

- [ ] `secretKey` ЮKassa **только** в переменных n8n, никогда в репозитории.
- [ ] У n8n‑webhooks включён HMAC‑токен / Basic Auth → проверка в первом узле.
- [ ] В оферту добавлены пункты про возврат и срок действия ссылки.
- [ ] В политике конфиденциальности перечислены ЮKassa, n8n, Google как обработчики.
- [ ] В формах есть чек‑бокс согласия на 152‑ФЗ и подписку (отдельным пунктом).
- [ ] Включён лимит запросов на n8n‑webhook (100/мин) — защита от спама.

## Что дальше

- **Tripwire 290 ₽** — настройте «order bump» через дополнительную страницу `/upsell/<slug>/` с
  отдельным n8n flow.
- **Реактивация** — подключите рассылку (UniSender / Mailganer) к Google Sheets с продажами и
  отправляйте письмо «прошёл месяц — оцените» через 30 дней.
- **Telegram‑бот** — n8n умеет работать с Telegram Bot API; можно добавить альтернативную выдачу
  файла прямо в Telegram через `/start <slug>`.
