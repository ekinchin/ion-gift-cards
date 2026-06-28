CREATE UNIQUE INDEX IF NOT EXISTS idx_card_owners_customer_id_unique
ON card_owners (customer_id);

COMMENT ON INDEX idx_card_owners_customer_id_unique IS 'Ограничивает модель: один клиент может владеть не более одной текущей картой.';
