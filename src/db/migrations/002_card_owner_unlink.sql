ALTER TABLE card_owner_transfers
    ALTER COLUMN to_customer_id DROP NOT NULL;

ALTER TABLE card_owner_transfers
    DROP CONSTRAINT IF EXISTS card_owner_transfers_type_check;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'card_owner_transfers_type_check'
          AND conrelid = 'card_owner_transfers'::regclass
    ) THEN
        ALTER TABLE card_owner_transfers
            ADD CONSTRAINT card_owner_transfers_type_check
            CHECK (type IN ('INITIAL_LINK', 'OWNER_TRANSFER', 'OWNER_UNLINK'));
    END IF;
END $$;

COMMENT ON TABLE card_owner_transfers IS 'Журнал событий владения сертификатами: первичная привязка, передача владельца и отвязка.';
COMMENT ON COLUMN card_owner_transfers.to_customer_id IS 'Новый владелец сертификата; NULL для отвязки.';
COMMENT ON COLUMN card_owner_transfers.type IS 'Тип события владения: первичная привязка, передача владельца или отвязка.';
