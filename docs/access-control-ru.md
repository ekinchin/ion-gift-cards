# Контроль доступа

Приложение использует actor-based авторизацию для доступа к картам.

Этот слой намеренно отделён от адаптеров. Адаптеры определяют, кто делает запрос, а application-код решает, может ли этот actor выполнить действие над ресурсом.

## Термины

`Actor` — прикладная идентичность текущего запроса:

```ts
interface Actor {
  customerId?: string;
  operatorId?: string;
}
```

Actor может быть без идентичности, с customer identity, с operator identity или с обеими сразу. Telegram users — это adapter-specific ввод; перед проверками доступа они должны быть преобразованы в `Actor`.

`operator` — глобальный источник прав. Текущие операторы могут выполнять cash-register операции с картами: debit, credit, создание gift card и просмотр истории owned card.

`owner` — не глобальная роль. Владение — это отношение между customer и конкретной card, которое хранится в `card_owners`. Customer может быть owner для одной card и non-owner для другой.

## Поток

1. Adapter разбирает и валидирует внешний ввод.
2. Adapter преобразует идентичность в `Actor`.
3. Use case загружает ресурс или отношение ресурса, нужное для решения.
4. Policy function проверяет `actor + action + resource`.
5. Use case продолжает бизнес-логику или выбрасывает application error.

Для Telegram bot requests `src/bot/handlers/access.ts` определяет operator identity и предоставляет helpers вроде `requireBotOperator`.

Текущий HTTP API карт публикует только публичную проверку баланса и не преобразует запросы в `Actor`.

Resource decisions живут в `src/application/card-access-policy.ts`.

## Текущие правила

`canOperateCards(actor)` разрешает actors с `operatorId`. Bot handlers используют это для operator-only commands и menu actions перед запуском debit, credit или gift-card creation flows.

`canReadCardHistory(actor, owner)` разрешает:

- кому угодно, если у card нет owner;
- текущему owner, если card owned;
- любому operator, если card owned.

Assertion-форма `assertCanReadCardHistory` выбрасывает `CardHistoryAccessDeniedError`, чтобы use cases сохраняли единые application errors.

## Границы

Adapters могут аутентифицировать внешние identities, резолвить customers, находить operators и выбирать user-facing error messages.

Adapters не должны дублировать resource authorization rules вроде "owner or operator can read owned-card history".

Use cases владеют границами транзакций, загрузкой ресурсов, бизнес-инвариантами и вызовами policy functions.

Repositories только загружают и сохраняют данные. Они не должны решать, разрешено ли actor выполнить действие.

Database constraints защищают инварианты, которые должны выполняться независимо от caller: foreign keys, balance constraints и ownership uniqueness. Они не заменяют application authorization.

## Расширение

Когда добавляется новое право:

1. Добавьте или переиспользуйте поле `Actor` только если идентичность является частью application domain.
2. Добавьте policy function с именем по действию, например `canRefundCard` или `assertCanTransferCardOwnership`.
3. Relation-based проверки держите resource-specific. Не моделируйте `owner` как глобальную роль.
4. Используйте policy из use case, который владеет бизнес-операцией.
5. Добавьте focused policy tests и хотя бы один adapter/use-case regression test для user-facing path.

Если роли станут богаче текущего `operator` flag, введите явные capabilities на стороне operator вместо scattered role checks в handlers.
