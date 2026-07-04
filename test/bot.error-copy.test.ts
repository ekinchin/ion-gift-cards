import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AppError,
  CardAlreadyLinkedError,
  CardAlreadyLinkedToCustomerError,
  CardHistoryAccessDeniedError,
  CardNotFoundError,
  CustomerAlreadyHasCardError,
  DuplicateCardError,
  InsufficientBalanceError,
  InvalidAmountError,
  MultipleOwnedCardsError,
  NoOwnedCardsError,
  TransferToSameCustomerError,
  TransferTokenExpiredError,
  TransferTokenInvalidError,
  TransferTokenUsedError,
} from '../src/application/errors.ts';
import { formatBotErrorMessage } from '../src/bot/error-copy.ts';

test('formatBotErrorMessage translates application errors for chat replies', () => {
  const cases = [
    [new CardNotFoundError(), 'Карта не найдена'],
    [new DuplicateCardError(), 'Карта с таким кодом уже существует'],
    [new InvalidAmountError(), 'Сумма должна быть больше нуля'],
    [new CardAlreadyLinkedError(), 'Карта уже привязана к другому пользователю'],
    [new CardAlreadyLinkedToCustomerError(), 'Карта уже привязана к вам'],
    [new CardHistoryAccessDeniedError(), 'История карты доступна только владельцу или оператору'],
    [new NoOwnedCardsError(), 'У вас пока нет привязанной карты'],
    [new MultipleOwnedCardsError(), 'У вас несколько привязанных карт. Укажите код карты'],
    [new CustomerAlreadyHasCardError(), 'У вас уже есть привязанная карта'],
    [new TransferTokenInvalidError(), 'Код передачи недействителен'],
    [new TransferTokenExpiredError(), 'Срок действия кода передачи истек'],
    [new TransferTokenUsedError(), 'Код передачи уже использован'],
    [new TransferToSameCustomerError(), 'Карта уже принадлежит вам'],
  ] as const;

  for (const [error, expected] of cases) {
    assert.equal(formatBotErrorMessage(error), expected);
    assert.doesNotMatch(formatBotErrorMessage(error), /[A-Za-z]/);
  }
});

test('formatBotErrorMessage translates insufficient balance with amounts', () => {
  assert.equal(
    formatBotErrorMessage(new InsufficientBalanceError(100, 250)),
    'Недостаточно средств. Текущий баланс: 100 ₽, требуется: 250 ₽'
  );
});

test('formatBotErrorMessage explains duplicate receipt scans', () => {
  assert.equal(
    formatBotErrorMessage(new AppError('Receipt is already attached to another transaction', 'RECEIPT_ALREADY_ATTACHED', 409)),
    'Этот чек уже был отсканирован и привязан к другой операции'
  );
});

test('formatBotErrorMessage explains receipt input errors', () => {
  assert.equal(
    formatBotErrorMessage(new AppError('Invalid fiscal receipt QR', 'INVALID_RECEIPT_QR', 400)),
    'Не удалось прочитать QR чека. Отсканируйте фискальный QR с бумажного или электронного чека'
  );
  assert.equal(
    formatBotErrorMessage(new AppError('Receipt skip reason other requires a comment', 'RECEIPT_SKIP_COMMENT_REQUIRED', 400)),
    'Для причины "другое" добавьте комментарий после слова "другое"'
  );
  assert.equal(
    formatBotErrorMessage(new AppError('Unsupported receipt skip reason', 'RECEIPT_SKIP_REASON_INVALID', 400)),
    'Некорректная причина пропуска чека'
  );
});

test('formatBotErrorMessage keeps a generic fallback for unknown errors', () => {
  assert.equal(formatBotErrorMessage(new Error('Unexpected failure')), 'Ошибка');
  assert.equal(formatBotErrorMessage('not an error'), 'Ошибка');
});
