CREATE TABLE IF NOT EXISTS transaction_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
    raw_qr_payload TEXT,
    receipt_url TEXT,
    fiscal_fn TEXT,
    fiscal_fd TEXT,
    fiscal_fp TEXT,
    fiscal_operation_type TEXT,
    fiscal_fingerprint TEXT,
    receipt_issued_at TIMESTAMP,
    receipt_total DECIMAL(10,2),
    receipt_inn TEXT,
    verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'pending_verification', 'failed', 'skipped')),
    verification_error TEXT,
    skip_reason TEXT,
    skip_comment TEXT,
    created_by_operator_id UUID REFERENCES operators(id),
    created_at TIMESTAMP DEFAULT NOW(),
    verified_at TIMESTAMP
);

COMMENT ON TABLE transaction_receipts IS 'Подтверждения операций карты фискальными чеками.';
COMMENT ON COLUMN transaction_receipts.transaction_id IS 'Операция ledger-а карты, которую подтверждает чек или пропуск чека.';
COMMENT ON COLUMN transaction_receipts.raw_qr_payload IS 'Исходная строка QR фискального чека.';
COMMENT ON COLUMN transaction_receipts.receipt_url IS 'Кэшированная ссылка для просмотра чека, если её можно построить.';
COMMENT ON COLUMN transaction_receipts.fiscal_fingerprint IS 'Уникальный отпечаток фискальных реквизитов чека.';
COMMENT ON COLUMN transaction_receipts.verification_status IS 'Статус проверки: verified, pending_verification, failed или skipped.';
COMMENT ON COLUMN transaction_receipts.skip_reason IS 'Причина пропуска чека из фиксированного списка.';
COMMENT ON COLUMN transaction_receipts.skip_comment IS 'Комментарий оператора, обязателен для причины other.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_receipts_fingerprint_unique
    ON transaction_receipts(fiscal_fingerprint)
    WHERE fiscal_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transaction_receipts_transaction_id ON transaction_receipts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_receipts_status ON transaction_receipts(verification_status);
