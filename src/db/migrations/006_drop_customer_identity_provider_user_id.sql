ALTER TABLE customer_identities
    DROP CONSTRAINT IF EXISTS customer_identities_provider_provider_user_id_key;

ALTER TABLE customer_identities
    DROP COLUMN IF EXISTS provider_user_id;
