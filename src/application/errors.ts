export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(
    message: string,
    code: string,
    statusCode: number
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class CardNotFoundError extends AppError {
  constructor() {
    super('Card not found', 'CARD_NOT_FOUND', 404);
  }
}

export class DuplicateCardError extends AppError {
  constructor() {
    super('Card with this code already exists', 'DUPLICATE_CARD', 409);
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(current: number, required: number) {
    super(
      `Insufficient balance. Current: ${current}, Required: ${required}`,
      'INSUFFICIENT_BALANCE',
      400
    );
  }
}

export class InvalidAmountError extends AppError {
  constructor() {
    super('Amount must be greater than zero', 'INVALID_AMOUNT', 400);
  }
}

export class CardAlreadyLinkedError extends AppError {
  constructor() {
    super('Card is already linked to another customer', 'CARD_ALREADY_LINKED', 409);
  }
}

export class CardAlreadyLinkedToCustomerError extends AppError {
  constructor() {
    super('Card is already linked to this customer', 'CARD_ALREADY_LINKED_TO_CUSTOMER', 409);
  }
}

export class CardOwnershipRequiredError extends AppError {
  constructor() {
    super('Card is not owned by this customer', 'CARD_OWNERSHIP_REQUIRED', 403);
  }
}

export class NoOwnedCardsError extends AppError {
  constructor() {
    super('Customer has no linked cards', 'NO_OWNED_CARDS', 404);
  }
}

export class MultipleOwnedCardsError extends AppError {
  constructor() {
    super('Customer has multiple linked cards; card code is required', 'MULTIPLE_OWNED_CARDS', 400);
  }
}

export class CustomerAlreadyHasCardError extends AppError {
  constructor() {
    super('Customer already has a linked card', 'CUSTOMER_ALREADY_HAS_CARD', 409);
  }
}

export class TransferTokenInvalidError extends AppError {
  constructor() {
    super('Transfer token is invalid', 'TRANSFER_TOKEN_INVALID', 404);
  }
}

export class TransferTokenExpiredError extends AppError {
  constructor() {
    super('Transfer token has expired', 'TRANSFER_TOKEN_EXPIRED', 400);
  }
}

export class TransferTokenUsedError extends AppError {
  constructor() {
    super('Transfer token has already been used', 'TRANSFER_TOKEN_USED', 409);
  }
}

export class TransferToSameCustomerError extends AppError {
  constructor() {
    super('Card is already owned by this customer', 'TRANSFER_TO_SAME_CUSTOMER', 409);
  }
}
