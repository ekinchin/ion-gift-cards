import { AppError } from '../application/errors.ts';
import { userCopy } from '../copy.ts';

const appErrorCopy: Record<string, string | ((error: AppError) => string)> = {
  CARD_NOT_FOUND: userCopy.bot.errors.cardNotFound,
  DUPLICATE_CARD: userCopy.bot.errors.duplicateCard,
  INVALID_AMOUNT: userCopy.bot.errors.invalidAmount,
  CARD_ALREADY_LINKED: userCopy.bot.errors.cardAlreadyLinked,
  CARD_ALREADY_LINKED_TO_CUSTOMER: userCopy.bot.errors.cardAlreadyLinkedToCustomer,
  CARD_OWNERSHIP_REQUIRED: userCopy.bot.errors.cardOwnershipRequired,
  CARD_HISTORY_ACCESS_DENIED: userCopy.bot.errors.cardHistoryAccessDenied,
  NO_OWNED_CARDS: userCopy.bot.errors.noOwnedCards,
  MULTIPLE_OWNED_CARDS: userCopy.bot.errors.multipleOwnedCards,
  CUSTOMER_ALREADY_HAS_CARD: userCopy.bot.errors.customerAlreadyHasCard,
  TRANSFER_TOKEN_INVALID: userCopy.bot.errors.transferTokenInvalid,
  TRANSFER_TOKEN_EXPIRED: userCopy.bot.errors.transferTokenExpired,
  TRANSFER_TOKEN_USED: userCopy.bot.errors.transferTokenUsed,
  TRANSFER_TO_SAME_CUSTOMER: userCopy.bot.errors.transferToSameCustomer,
  RECEIPT_ALREADY_ATTACHED: userCopy.bot.errors.receiptAlreadyAttached,
  INSUFFICIENT_BALANCE: (error) => {
    const match = /^Insufficient balance\. Current: ([^,]+), Required: (.+)$/.exec(error.message);
    if (!match) {
      return userCopy.bot.errors.insufficientBalance;
    }
    return userCopy.bot.errors.insufficientBalanceWithAmounts
      .replace('{current}', match[1]!)
      .replace('{required}', match[2]!);
  },
};

export function formatBotErrorMessage(error: unknown) {
  if (error instanceof AppError) {
    const copy = appErrorCopy[error.code];
    if (typeof copy === 'function') {
      return copy(error);
    }
    if (copy) {
      return copy;
    }
  }

  return userCopy.bot.errors.generic;
}
