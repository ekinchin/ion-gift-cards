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
