# План реализации согласия на обработку персональных данных в Telegram

> **Для agentic workers:** ОБЯЗАТЕЛЬНЫЙ ПОДНАВЫК: используйте `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`, чтобы выполнять этот план по задачам. Шаги используют синтаксис чекбоксов (`- [ ]`) для отслеживания.

**Цель:** сделать привязку Telegram-аккаунта к карте явной с точки зрения обработки персональных данных, минимизировать хранение Telegram-идентификаторов и сделать отвязку карты пользовательским способом отказа от дальнейшей обработки, с удалением истории операций по карте.

**Архитектура:** владение картой остается привязанным к внутренним `customer_id` / `operator_id`, а не к сырым Telegram-идентификаторам. Для поиска идентичности хранится детерминированный `HMAC-SHA256(secret, telegram_user_id)`, а обратимые Telegram-контакты хранятся только там, где они действительно нужны для прямых уведомлений. Проверка согласия находится на границе Telegram-адаптера перед персональными действиями с картой, а очистка истории при отвязке находится в application use case, чтобы правило выполнялось для любого caller.

**Технологии:** Node.js 24, TypeScript, grammY, Knex, PostgreSQL, `node:test`.

---

## Системный анализ

### Текущее состояние

- `customers.id` уже является независимой от провайдера внутренней идентичностью и подходит для доменной связи с владением картой.
- `customer_identities.provider_user_id` сейчас хранит сырой Telegram user id как текст.
- `operators.telegram_id` сейчас хранит сырой Telegram user id как `BIGINT`.
- Production БД уже существует, а миграции применяются вперед по числовым SQL-файлам в `src/db/migrations`; `001_initial.sql` для этой доработки не переписываем.
- Текущее владение картой хранится в `card_owners`; события владения фиксируются в `card_owner_transfers`.
- История операций хранится в `transactions`; данные чеков по операциям хранятся в `transaction_receipts`.
- `CardOwnershipUseCases.unlinkCard` и `unlinkCurrentCard` сейчас удаляют только строку из `card_owners` и добавляют событие `OWNER_UNLINK`.
- Пользовательские тексты бота централизованы в `src/copy.ts`, поэтому согласие и предупреждения о destructive-действиях должны добавляться туда и переиспользоваться обработчиками.

### Продуктовые требования

- Перед созданием или привязкой личной карты бот должен явно запросить у пользователя разрешение на хранение и обработку персональных данных.
- Текст согласия должен быть виден прямо в сценарии бота, а не только в отдельном документе.
- Текст согласия должен явно говорить, что бот хранит и обрабатывает идентификаторы Telegram-аккаунта, чтобы привязать карту к Telegram-аккаунту и выполнять персональные функции карты.
- Текст согласия должен явно говорить, что отказ означает невозможность создать или привязать личную карту в Telegram.
- Если пользователь ранее дал согласие, а теперь хочет отказаться от дальнейшего хранения/обработки для привязанной карты, пользовательский способ отказа - отвязать карту.
- Подтверждение отвязки должно явно говорить, что отвязка считается отказом от согласия для этой привязки карты.
- Подтверждение отвязки должно явно говорить, что история операций по карте будет удалена.
- При отвязке нужно удалить историю операций по карте, а не только скрыть ее от пользователя.
- После отвязки бот все равно должен вернуть код/QR/баланс карты, чтобы пользователь мог сохранить доступ по предъявительской модели, если карта остается активной.

### Позиция по защите данных

План считает Telegram user id и private chat id персональными данными в этой системе, потому что после связи с владением картой и действиями бота они позволяют определить или адресно связаться с конкретным Telegram-аккаунтом.

Реализация должна минимизировать сырые Telegram-идентификаторы:

- использовать внутренние `customers.id` и `operators.id` для всех доменных связей;
- использовать `telegram_user_id_hmac` для детерминированного поиска customer/operator;
- хранить HMAC-секрет в Yandex Cloud Lockbox и передавать его runtime containers через env `TELEGRAM_ID_HMAC_SECRET`;
- не хранить plain `telegram_user_id` в строках customer identity;
- не логировать сырые Telegram-идентификаторы;
- хранить `encrypted_private_chat_id` только если реализуются прямые уведомления пользователям;
- хранить опциональные display-поля только если продукт явно требует этого; иначе перестать сохранять `username` и `display_name`.

HMAC снижает риск и дает механизм поиска, но не является утверждением, что данные полностью анонимны для оператора системы.

### Модель согласия

Согласие требуется перед персональными действиями, которые привязывают Telegram-аккаунт к карте:

- `/create_my_card`;
- `/link`;
- привязка через reply-клавиатуру;
- QR/web-app сценарий привязки;
- `/accept_transfer`.

Согласие не требуется для публичных предъявительских операций, которые не привязывают Telegram-аккаунт к карте:

- `/balance <код>`;
- проверка баланса по QR/ручному публичному коду;
- операторские сценарии списания, пополнения и создания подарочной карты.

Согласие нужно хранить на уровне customer identity, а не на уровне карты, потому что персональные данные - это идентичность Telegram-аккаунта. Текущее продуктовое требование делает отвязку карты пользовательским способом отзыва согласия для существующей привязки, поэтому реализация должна также удалять или деактивировать identity/contact данные, когда у customer не осталось связанных карт и нет другой активной причины хранить идентичность.

### Модель отвязки и удаления истории

Отвязка становится destructive privacy operation:

1. Подтвердить, что пользователь хочет отвязать карту.
2. Показать, что отвязка считается отказом от дальнейшей обработки персональных данных для этой привязки.
3. Показать, что история операций по карте будет удалена.
4. После подтверждения удалить текущего владельца.
5. Удалить строки чеков для операций этой карты.
6. Удалить строки операций этой карты.
7. Удалить или деактивировать customer identity/contact данные, если не осталось активной привязки карты.
8. Вернуть QR/код/баланс уже отвязанной карты.

Строки чеков нужно удалять до строк операций, чтобы не нарушить foreign keys. Если в будущей миграции для чеков появится `ON DELETE CASCADE`, repository cleanup все равно может явно удалять чеки первым шагом для понятности и совместимости.

### Требования к пользовательским текстам

Запрос согласия должен включать эти пункты простым русским языком:

- бот будет хранить и обрабатывать данные Telegram-аккаунта для привязки карты к аккаунту;
- бот будет использовать эти данные, чтобы показывать карту пользователя, баланс, QR и приватную историю операций;
- если будут реализованы contact data для уведомлений, текст должен также говорить, что бот может использовать Telegram-контакт для сервисных сообщений по карте;
- пользователь может отказаться отрицательной кнопкой; в таком случае персональная привязка карты не будет создана;
- если согласие уже было дано, пользователь может позже отказаться от дальнейшего хранения/обработки через отвязку карты.

Подтверждение отвязки должно включать эти пункты простым русским языком:

- карта будет отвязана от этого Telegram-аккаунта;
- это считается отказом от дальнейшего хранения/обработки персональных данных для этой привязки;
- история операций по карте будет удалена и не сможет быть восстановлена в боте;
- бот покажет QR/код/баланс после отвязки, чтобы пользователь мог сохранить предъявительский доступ.

### Вне рамок

- Готовая к публикации юридическая политика.
- Полный административный интерфейс для запросов субъектов персональных данных.
- Прямой маркетинг или промо-рассылки.
- Реализация розыгрышей.
- Обновление Figma-карточек и PNG-экспортов; карточки Telegram-инструкции нужно обновлять отдельным документационным проходом, если новый UX бота будет выпущен.

---

### Задача 1: Forward migration, конфигурация и Lockbox secret

**Файлы:**
- Создать: `src/db/migrations/005_telegram_personal_data_consent.sql`
- Изменить: `src/types/index.ts`
- Изменить: `src/configuration/configuration-service.ts`
- Изменить: `.github/workflows/release-polling-vm.yml`
- Изменить: `.github/scripts/deploy-yc-polling-vm.sh`
- Изменить: `.github/workflows/release.yml`
- Изменить: `docs/deployment-yandex-cloud.md`
- Изменить: `docs/yandex-cloud-github-setup.ru.md`
- Тест: `test/migrations.run.test.ts`
- Тест: `test/configuration-service.test.ts`

- [ ] **Шаг 1: написать тесты forward schema migration**

Добавить assertions в schema/migration tests, которые доказывают, что модель customer identity содержит:

```sql
telegram_user_id_hmac TEXT
personal_data_consent_at TIMESTAMP
personal_data_consent_revoked_at TIMESTAMP
```

и модель operator содержит:

```sql
telegram_user_id_hmac TEXT
```

Тест должен также доказать, что `src/db/migrations/001_initial.sql` не меняется для этой доработки, а новая миграция применяется после `004_transaction_receipts.sql`.

Запуск: `npm test -- test/migrations.run.test.ts`

Ожидание: FAIL, потому что миграции `005_telegram_personal_data_consent.sql` еще нет.

- [ ] **Шаг 2: написать тесты конфигурации для HMAC-секрета**

Добавить тесты, которые доказывают, что production-like Telegram identity lookup требует секрет из env:

```ts
TELEGRAM_ID_HMAC_SECRET=at-least-32-random-bytes
```

Ожидаемое поведение:

- отсутствие секрета в активном Telegram mode ломает валидацию конфигурации;
- слишком короткий секрет ломает валидацию конфигурации;
- валидный секрет доступен коду хэширования identity.

Запуск: `npm test -- test/configuration-service.test.ts`

Ожидание: FAIL, потому что конфигурация пока не определяет этот секрет.

- [ ] **Шаг 3: добавить forward-only migration**

Создать `src/db/migrations/005_telegram_personal_data_consent.sql`. Эта миграция должна изменять существующую БД вперед; `001_initial.sql` переписывать нельзя.

Добавить переходные колонки и оставить raw-колонки до проверки backfill:

```sql
ALTER TABLE customer_identities
    ADD COLUMN IF NOT EXISTS telegram_user_id_hmac TEXT,
    ADD COLUMN IF NOT EXISTS personal_data_consent_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS personal_data_consent_revoked_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_identities_provider_telegram_hmac
    ON customer_identities(provider, telegram_user_id_hmac)
    WHERE telegram_user_id_hmac IS NOT NULL;

ALTER TABLE operators
    ADD COLUMN IF NOT EXISTS telegram_user_id_hmac TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_operators_telegram_user_id_hmac
    ON operators(telegram_user_id_hmac)
    WHERE telegram_user_id_hmac IS NOT NULL;
```

В этой миграции не добавлять `NOT NULL` и не удалять `customer_identities.provider_user_id` или `operators.telegram_id`. Эти raw-колонки удаляются только после проверки backfill.

- [ ] **Шаг 4: обновить TypeScript-типы**

Обновить `CustomerIdentity` и `Operator` в `src/types/index.ts`: добавить HMAC/consent поля. Raw identifier поля оставить только в DB row types, пока переходные колонки нужны для backfill.

- [ ] **Шаг 5: обновить конфигурацию**

Добавить валидируемое значение `telegram.identityHmacSecret`. Его нужно считать секретом и никогда не логировать.

- [ ] **Шаг 6: добавить Lockbox и runtime env plumbing**

Production-значение хранить в Yandex Cloud Lockbox под ключом `TELEGRAM_ID_HMAC_SECRET`. Генерировать его локально во время setup/deploy:

```bash
openssl rand -hex 32
```

Сгенерированное значение не коммитить в репозиторий и не печатать в release logs.

Обновить release/runtime wiring:

- `.github/workflows/release-polling-vm.yml` читает `TELEGRAM_ID_HMAC_SECRET` из Lockbox, маскирует его, передает migrations container через `-e TELEGRAM_ID_HMAC_SECRET` и добавляет его в API `revision-secrets`.
- `.github/scripts/deploy-yc-polling-vm.sh` читает `TELEGRAM_ID_HMAC_SECRET` из Lockbox и пишет его в root-only env file бота.
- `.github/workflows/release.yml` получает тот же ключ для legacy manual webhook workflow, если workflow остается рабочим.
- `docs/deployment-yandex-cloud.md` и `docs/yandex-cloud-github-setup.ru.md` перечисляют новый Lockbox key и команду генерации `openssl rand -hex 32`.

- [ ] **Шаг 7: запустить focused tests**

Запуск:

```bash
npm test -- test/migrations.run.test.ts test/configuration-service.test.ts
```

Ожидание: PASS.

---

### Задача 2: Telegram identity hashing и repositories

**Файлы:**
- Создать: `src/telegram/telegram-identity.ts`
- Создать: `src/scripts/backfill-telegram-identity-hmac.ts`
- Изменить: `src/repositories/customer.repository.ts`
- Изменить: `src/repositories/operator.repository.ts`
- Изменить: `src/bot/handlers/operators.ts`
- Изменить: `src/bot/handlers/card-replies.ts`
- Создать: `test/telegram-identity.test.ts`
- Создать: `test/telegram-identity-backfill.test.ts`
- Тест: `test/customer.repository.test.ts`
- Создать: `test/operator.repository.test.ts`

- [ ] **Шаг 1: написать тесты identity hashing**

Создать тесты для:

```ts
hashTelegramUserId(1001, 'secret-secret-secret-secret-secret-1')
```

Ожидаемое поведение:

- возвращает одну и ту же hex-строку для одинакового user id и секрета;
- возвращает разные строки для разных user id;
- возвращает разные строки для разных секретов;
- не содержит `1001` в output.

Запуск: `npm test -- test/telegram-identity.test.ts`

Ожидание: FAIL, потому что helper пока не существует.

- [ ] **Шаг 2: реализовать HMAC helper**

Создать `src/telegram/telegram-identity.ts`:

```ts
import { createHmac } from 'node:crypto';

export function hashTelegramUserId(telegramUserId: number | string, secret: string): string {
  return createHmac('sha256', secret)
    .update(String(telegramUserId), 'utf8')
    .digest('hex');
}
```

- [ ] **Шаг 3: написать backfill tests**

Добавить тесты, доказывающие, что backfill command:

- требует `TELEGRAM_ID_HMAC_SECRET`;
- заполняет `customer_identities.telegram_user_id_hmac` из существующего `provider_user_id`;
- заполняет `operators.telegram_user_id_hmac` из существующего `telegram_id`;
- является idempotent при повторном запуске;
- никогда не логирует raw Telegram ids или secret.

Запуск: `npm test -- test/telegram-identity.test.ts test/telegram-identity-backfill.test.ts test/customer.repository.test.ts test/operator.repository.test.ts`

Ожидание: FAIL, пока helper/backfill behavior не существует.

- [ ] **Шаг 4: реализовать backfill command**

Создать `src/scripts/backfill-telegram-identity-hmac.ts`. Команда должна:

1. загрузить конфигурацию через `ConfigurationService`;
2. вычислить HMAC через `hashTelegramUserId`;
3. обновлять только строки, где `telegram_user_id_hmac IS NULL`;
4. выполняться внутри database transaction;
5. печатать только counts, без raw ids и secret values.

Release workflow должен запускать ее после SQL migrations и до deploy runtime containers:

```bash
node --experimental-strip-types src/scripts/backfill-telegram-identity-hmac.ts
```

- [ ] **Шаг 5: написать repository tests для HMAC lookup и состояния согласия**

Обновить customer repository tests, чтобы доказать:

- identity resolve использует `telegram_user_id_hmac`;
- повторный resolve возвращает того же customer;
- согласие можно записать;
- согласие можно отозвать;
- revoked identity не считается consented для personal-card operations.

Обновить operator repository tests, чтобы доказать: активные операторы находятся по HMAC, а не по raw Telegram id.

- [ ] **Шаг 6: обновить repositories и bot adapters**

Изменить repository APIs так, чтобы bot handlers передавали либо уже вычисленный HMAC, либо dependency, который вычисляет его на границе adapter.

Целевой adapter flow:

```ts
const telegramUserIdHash = hashTelegramUserId(ctx.from.id, config.identityHmacSecret);
const customer = await resolveOrCreateIdentity({
  provider: 'telegram',
  telegramUserIdHash,
});
```

Для новых записей не сохранять `ctx.from.id`, `username` или display name, если отдельное продуктовое решение не потребует этого позже. Существующие raw rows остаются только на время migration transition и удаляются будущей cleanup migration после проверки.

- [ ] **Шаг 7: запустить focused tests**

Запуск:

```bash
npm test -- test/telegram-identity.test.ts test/telegram-identity-backfill.test.ts test/customer.repository.test.ts test/operator.repository.test.ts
```

Ожидание: PASS.

---

### Задача 3: Consent gate в персональных сценариях карты

**Файлы:**
- Изменить: `src/copy.ts`
- Изменить: `src/bot/handlers/card-replies.ts`
- Изменить: `src/bot/handlers/menu-handlers.ts`
- Изменить: `src/bot/handlers/commands/create-my-card.ts`
- Изменить: `src/bot/handlers/commands/link.ts`
- Изменить: `src/bot/handlers/commands/accept-transfer.ts`
- Изменить: `src/bot/context.ts`
- Создать: `test/bot.personal-data-consent.test.ts`
- Тест: `test/bot.owned-card-actions.test.ts`

- [ ] **Шаг 1: написать bot tests для запроса согласия**

Добавить тесты, доказывающие:

- `/create_my_card` без существующего согласия отвечает явным запросом согласия и не создает карту;
- `/link <код>` без существующего согласия отвечает тем же запросом и не привязывает карту;
- привязка из reply-клавиатуры спрашивает согласие до запуска QR/manual link;
- `/accept_transfer <код>` спрашивает согласие до принятия передачи;
- отказ оставляет пользователя без привязанной карты.

Запуск: `npm test -- test/bot.personal-data-consent.test.ts`

Ожидание: FAIL, потому что согласие пока не реализовано.

- [ ] **Шаг 2: добавить пользовательские тексты**

Добавить русские тексты в `userCopy.bot.personalDataConsent`:

```ts
prompt: [
  'Для привязки карты бот хранит и обрабатывает данные вашего Telegram-аккаунта.',
  'Это нужно, чтобы связать карту с аккаунтом, показывать вашу карту, баланс, QR и приватную историю операций.',
  'Если вы не согласны, личную карту в Telegram создать или привязать нельзя.',
  'Если согласие уже было дано, отказаться от дальнейшего хранения и обработки можно через отвязку карты.',
].join('\n\n'),
acceptButton: '✅ Согласен',
declineButton: '❌ Не согласен',
accepted: '✅ Согласие сохранено. Продолжаю действие.',
declined: 'Без согласия карта не будет привязана к Telegram-аккаунту.',
```

Если в этом же релизе реализуется хранение contact data для уведомлений, перед выпуском добавить предложение про сервисные сообщения.

- [ ] **Шаг 3: добавить pending consent action в session**

Расширить bot session state, чтобы бот мог помнить операцию, ожидающую согласия:

```ts
pendingConsentAction:
  | { action: 'createPersonalCard' }
  | { action: 'linkCard'; code?: string }
  | { action: 'acceptTransfer'; token: string }
  | undefined;
```

- [ ] **Шаг 4: реализовать consent helper**

Добавить helper на уровне bot adapter:

```ts
async function requirePersonalDataConsent(ctx: MyContext, action: PendingConsentAction): Promise<boolean> {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return false;
  const consent = await customerRepository.findActiveConsent(customer.id, 'telegram');
  if (consent) return true;
  ctx.session.pendingConsentAction = action;
  await ctx.reply(userCopy.bot.personalDataConsent.prompt, {
    reply_markup: {
      keyboard: [[
        { text: userCopy.bot.personalDataConsent.acceptButton },
        { text: userCopy.bot.personalDataConsent.declineButton },
      ]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
  return false;
}
```

Точную реализацию согласовать с существующими grammY keyboard patterns в проекте.

- [ ] **Шаг 5: обработать кнопки согласия и отказа**

Когда пользователь соглашается:

- записать `personal_data_consent_at`;
- очистить `personal_data_consent_revoked_at`;
- продолжить pending action.

Когда пользователь отказывается:

- очистить pending action;
- не создавать/не привязывать/не принимать карту;
- ответить `userCopy.bot.personalDataConsent.declined`;
- вернуть обычную клиентскую клавиатуру.

- [ ] **Шаг 6: запустить focused tests**

Запуск:

```bash
npm test -- test/bot.personal-data-consent.test.ts test/bot.owned-card-actions.test.ts
```

Ожидание: PASS.

---

### Задача 4: Подтверждение отвязки, отзыв согласия и удаление истории

**Файлы:**
- Изменить: `src/copy.ts`
- Изменить: `src/application/card-ownership.use-cases.ts`
- Изменить: `src/repositories/transaction.repository.ts`
- Изменить: `src/repositories/transaction-receipt.repository.ts`
- Изменить: `src/repositories/customer.repository.ts`
- Изменить: `src/bot/handlers/card-replies.ts`
- Изменить: `src/bot/handlers/commands/unlink.ts`
- Изменить: `src/bot/handlers/menu-handlers.ts`
- Изменить: `src/bot/context.ts`
- Тест: `test/card-ownership.use-cases.test.ts`
- Создать: `test/transaction.repository.test.ts`
- Создать: `test/bot.unlink-privacy.test.ts`

- [ ] **Шаг 1: написать application tests для destructive unlink**

Добавить тесты, доказывающие, что `unlinkCard` / `unlinkCurrentCard`:

- удаляют текущую строку owner;
- создают transfer event `OWNER_UNLINK`;
- удаляют все `transaction_receipts` для операций карты;
- удаляют все `transactions` для карты;
- отзывают согласие на обработку персональных данных для customer identity, если не осталось других активных привязанных карт.

Запуск: `npm test -- test/card-ownership.use-cases.test.ts`

Ожидание: FAIL, потому что unlink сейчас не удаляет историю и не отзывает согласие.

- [ ] **Шаг 2: написать bot tests для явного подтверждения отвязки**

Добавить тесты, доказывающие:

- `/unlink` отвечает подтверждением до изменения данных;
- текст подтверждения говорит, что история операций по карте будет удалена;
- текст подтверждения говорит, что отвязка является способом отказаться от дальнейшего хранения/обработки для этой привязки;
- отмена сохраняет ownership и историю;
- подтверждение выполняет unlink и возвращает QR/код/баланс.

Запуск: `npm test -- test/bot.unlink-privacy.test.ts`

Ожидание: FAIL, потому что unlink сейчас выполняется сразу.

- [ ] **Шаг 3: добавить repository cleanup methods**

Добавить методы:

```ts
TransactionReceiptRepository.deleteByTransactionIds(transactionIds: string[], trx?: Knex.Transaction): Promise<void>
TransactionRepository.deleteByCardId(cardId: string, trx?: Knex.Transaction): Promise<void>
CustomerRepository.revokeConsent(customerId: string, provider: 'telegram', trx?: Knex.Transaction): Promise<void>
```

Использовать существующую transaction boundary в `CardOwnershipUseCases`.

- [ ] **Шаг 4: обновить unlink use case**

Внутри одной database transaction:

1. lock card owner row;
2. получить transaction ids для карты;
3. удалить receipts для этих transaction ids;
4. удалить transactions для карты;
5. удалить owner row;
6. создать event `OWNER_UNLINK`;
7. отозвать consent / деактивировать contact data, если у customer больше нет активных привязанных карт.

Вернуть карту, чтобы бот мог показать QR/код/баланс после cleanup.

- [ ] **Шаг 5: добавить текст подтверждения отвязки**

Добавить русские тексты в `userCopy.bot.unlinkPrivacy`:

```ts
confirm: [
  'Вы отвязываете карту от этого Telegram-аккаунта.',
  'Это будет считаться отказом от дальнейшего хранения и обработки персональных данных для этой привязки.',
  'История операций по этой карте будет удалена и не сможет быть восстановлена в боте.',
  'После отвязки бот покажет QR, код и баланс карты. Сохраните их, если хотите пользоваться картой как картой предъявителя.',
].join('\n\n'),
confirmButton: '✅ Отвязать и удалить историю',
cancelButton: 'Отмена',
cancelled: 'Отвязка отменена. Карта осталась привязанной.',
```

- [ ] **Шаг 6: добавить pending unlink state**

Расширить session state:

```ts
pendingUnlinkConfirmation:
  | { code?: string }
  | undefined;
```

`/unlink` и reply-keyboard unlink action должны устанавливать это состояние и показывать подтверждение. Только confirm button вызывает unlink use case.

- [ ] **Шаг 7: запустить focused tests**

Запуск:

```bash
npm test -- test/card-ownership.use-cases.test.ts test/transaction.repository.test.ts test/bot.unlink-privacy.test.ts
```

Ожидание: PASS.

---

### Задача 5: Документация и видимость для пользователя

**Файлы:**
- Изменить: `docs/telegram-bot-ru.md`
- Изменить: `docs/terms-of-use-ru.md`
- Изменить: `docs/access-control-ru.md`
- Изменить: `README.md`
- Проверка: manual review

- [ ] **Шаг 1: обновить документацию бота**

Документировать в `docs/telegram-bot-ru.md`:

- персональные функции карты требуют явного согласия на обработку персональных данных;
- `/link`, `/create_my_card`, `/accept_transfer` спрашивают согласие перед привязкой;
- отказ блокирует только персональную привязку карты, но не публичную проверку баланса по коду;
- `/unlink` является видимым способом отозвать согласие для существующей привязки карты;
- `/unlink` удаляет историю операций по карте и затем возвращает QR/код/баланс.

- [ ] **Шаг 2: обновить условия использования**

Документировать в `docs/terms-of-use-ru.md`:

- какие данные Telegram-аккаунта хранятся/обрабатываются для привязки карты;
- для каких функций эти данные нужны;
- что пользователь теряет при отказе от согласия;
- что именно происходит при отвязке.

- [ ] **Шаг 3: обновить документацию контроля доступа**

Документировать, что Telegram identifiers являются adapter-specific inputs и должны преобразовываться во внутренние actor identities через HMAC lookup до application authorization.

- [ ] **Шаг 4: решить scope обновления карточек/manual assets**

Не обновлять Figma/PNG карточки Telegram manual в рамках этого implementation plan, если product owner явно не добавит этот scope. Если добавит, использовать навык `telegram-bot-doc-cards` и Figma-first workflow.

- [ ] **Шаг 5: проверить документацию**

Вручную убедиться, что документация фиксирует все видимые пользователю последствия:

- согласие требуется до персональной привязки карты;
- отказ запрещает персональную привязку;
- последующий отказ выполняется через отвязку карты;
- отвязка удаляет историю операций по карте;
- отвязка возвращает QR/код/баланс для предъявительского доступа.

---

### Задача 6: Полная проверка и release notes

**Файлы:**
- Изменить: release notes или PR description

- [ ] **Шаг 1: запустить full typecheck**

Запуск:

```bash
npm run typecheck
```

Ожидание: PASS.

- [ ] **Шаг 2: запустить полный test suite**

Запуск:

```bash
npm test
```

Ожидание: PASS.

- [ ] **Шаг 3: проверить migration risk для данных**

Перед deploy задокументировать миграцию существующих строк:

- `TELEGRAM_ID_HMAC_SECRET` должен существовать в Yandex Cloud Lockbox до старта release;
- значение секрета генерируется случайно, например через `openssl rand -hex 32`, и не должно коммититься или печататься в логах;
- SQL migration `005_telegram_personal_data_consent.sql` добавляет переходные колонки и сохраняет raw columns;
- release workflow запускает `src/scripts/backfill-telegram-identity-hmac.ts` с `TELEGRAM_ID_HMAC_SECRET` из env после SQL migrations;
- существующие raw `provider_user_id` values преобразуются в `telegram_user_id_hmac` backfill-командой;
- существующие `operators.telegram_id` values преобразуются в `telegram_user_id_hmac` backfill-командой;
- будущая cleanup migration может добавить `NOT NULL` constraints и удалить raw Telegram identifier columns только после conversion и verification;
- backups с raw identifiers остаются personal-data artifacts и требуют отдельного решения по срокам хранения.

- [ ] **Шаг 4: подготовить release note**

Указать user-visible changes:

- бот спрашивает согласие на обработку персональных данных перед привязкой карты;
- отказ от согласия оставляет доступными публичные code/QR balance flows;
- отвязка карты отзывает согласие для card binding и удаляет историю операций;
- пользователю нужно сохранить QR/код, показанные после отвязки, если он хочет сохранить предъявительский доступ.
