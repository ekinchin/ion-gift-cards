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
