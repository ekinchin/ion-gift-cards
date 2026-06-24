-- Таблица операторов (бариста)
CREATE TABLE IF NOT EXISTS operators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE operators IS 'Операторы системы: сотрудники, которым разрешены операции с сертификатами.';
COMMENT ON COLUMN operators.id IS 'Внутренний идентификатор оператора, используется для связей внутри БД.';
COMMENT ON COLUMN operators.telegram_id IS 'Telegram user id оператора, используется текущим Telegram-адаптером для авторизации.';
COMMENT ON COLUMN operators.name IS 'Отображаемое имя оператора.';
COMMENT ON COLUMN operators.is_active IS 'Признак активного оператора; неактивные операторы не могут выполнять операции.';
COMMENT ON COLUMN operators.created_at IS 'Дата и время создания записи оператора.';

-- Таблица сертификатов
CREATE TABLE IF NOT EXISTS cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    balance DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    initial_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (initial_amount >= 0),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE cards IS 'Подарочные сертификаты и их текущий баланс.';
COMMENT ON COLUMN cards.id IS 'Внутренний идентификатор сертификата, используется для связей и транзакций.';
COMMENT ON COLUMN cards.code IS 'Публичный код сертификата для QR, ручного ввода и API-запросов.';
COMMENT ON COLUMN cards.balance IS 'Текущий доступный баланс сертификата.';
COMMENT ON COLUMN cards.initial_amount IS 'Начальная сумма сертификата на момент создания.';
COMMENT ON COLUMN cards.is_active IS 'Признак активного сертификата; неактивные сертификаты не участвуют в поиске по коду.';
COMMENT ON COLUMN cards.created_at IS 'Дата и время создания сертификата.';

-- Таблица клиентов
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE customers IS 'Внутренние клиенты, не зависящие от конкретного мессенджера или провайдера идентичности.';
COMMENT ON COLUMN customers.id IS 'Внутренний идентификатор клиента.';
COMMENT ON COLUMN customers.created_at IS 'Дата и время создания клиента.';

-- Таблица внешних идентификаторов клиентов
CREATE TABLE IF NOT EXISTS customer_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('telegram')),
    provider_user_id TEXT NOT NULL,
    username TEXT,
    display_name TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (provider, provider_user_id)
);

COMMENT ON TABLE customer_identities IS 'Связь внутреннего клиента с внешним аккаунтом в мессенджере или другом провайдере.';
COMMENT ON COLUMN customer_identities.id IS 'Внутренний идентификатор внешней идентичности.';
COMMENT ON COLUMN customer_identities.customer_id IS 'Ссылка на внутреннего клиента customers.id.';
COMMENT ON COLUMN customer_identities.provider IS 'Провайдер внешней идентичности; сейчас поддерживается telegram.';
COMMENT ON COLUMN customer_identities.provider_user_id IS 'Идентификатор пользователя внутри внешнего провайдера.';
COMMENT ON COLUMN customer_identities.username IS 'Необязательный username внешнего аккаунта.';
COMMENT ON COLUMN customer_identities.display_name IS 'Необязательное отображаемое имя внешнего аккаунта.';
COMMENT ON COLUMN customer_identities.created_at IS 'Дата и время создания внешней идентичности.';

-- Таблица текущих владельцев сертификатов
CREATE TABLE IF NOT EXISTS card_owners (
    card_id UUID PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    linked_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE card_owners IS 'Текущий владелец сертификата; одна карта может иметь не более одного владельца.';
COMMENT ON COLUMN card_owners.card_id IS 'Ссылка на внутренний идентификатор сертификата cards.id; одновременно первичный ключ владения.';
COMMENT ON COLUMN card_owners.customer_id IS 'Ссылка на текущего владельца сертификата customers.id.';
COMMENT ON COLUMN card_owners.linked_at IS 'Дата и время установки текущего владельца.';

-- Таблица ожидающих передач сертификатов
CREATE TABLE IF NOT EXISTS card_transfer_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    from_customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE card_transfer_tokens IS 'Короткоживущие одноразовые токены для передачи сертификата другому клиенту.';
COMMENT ON COLUMN card_transfer_tokens.id IS 'Внутренний идентификатор токена передачи.';
COMMENT ON COLUMN card_transfer_tokens.token IS 'Уникальный секрет передачи, который получает новый владелец.';
COMMENT ON COLUMN card_transfer_tokens.card_id IS 'Сертификат, который ожидает передачу.';
COMMENT ON COLUMN card_transfer_tokens.from_customer_id IS 'Текущий владелец, который инициировал передачу.';
COMMENT ON COLUMN card_transfer_tokens.expires_at IS 'Дата и время истечения токена передачи.';
COMMENT ON COLUMN card_transfer_tokens.used_at IS 'Дата и время использования токена; NULL означает, что токен еще не использован.';
COMMENT ON COLUMN card_transfer_tokens.created_at IS 'Дата и время создания токена передачи.';

-- Таблица аудита владения сертификатами
CREATE TABLE IF NOT EXISTS card_owner_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    from_customer_id UUID REFERENCES customers(id),
    to_customer_id UUID NOT NULL REFERENCES customers(id),
    initiated_by_customer_id UUID REFERENCES customers(id),
    type TEXT NOT NULL CHECK (type IN ('INITIAL_LINK', 'OWNER_TRANSFER')),
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE card_owner_transfers IS 'Журнал событий владения сертификатами: первичная привязка и передача владельца.';
COMMENT ON COLUMN card_owner_transfers.id IS 'Внутренний идентификатор события владения.';
COMMENT ON COLUMN card_owner_transfers.card_id IS 'Сертификат, для которого изменилось владение.';
COMMENT ON COLUMN card_owner_transfers.from_customer_id IS 'Предыдущий владелец; NULL для первичной привязки.';
COMMENT ON COLUMN card_owner_transfers.to_customer_id IS 'Новый владелец сертификата.';
COMMENT ON COLUMN card_owner_transfers.initiated_by_customer_id IS 'Клиент, инициировавший событие владения.';
COMMENT ON COLUMN card_owner_transfers.type IS 'Тип события владения: первичная привязка или передача владельца.';
COMMENT ON COLUMN card_owner_transfers.created_at IS 'Дата и время события владения.';

-- Таблица транзакций
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('CREATE', 'DEBIT', 'CREDIT')),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    balance_after DECIMAL(10,2) NOT NULL CHECK (balance_after >= 0),
    description TEXT,
    operator_id UUID REFERENCES operators(id),
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE transactions IS 'Журнал операций по сертификатам.';
COMMENT ON COLUMN transactions.id IS 'Внутренний идентификатор операции.';
COMMENT ON COLUMN transactions.card_id IS 'Ссылка на внутренний идентификатор сертификата cards.id.';
COMMENT ON COLUMN transactions.type IS 'Тип операции: создание, списание или пополнение.';
COMMENT ON COLUMN transactions.amount IS 'Сумма операции.';
COMMENT ON COLUMN transactions.balance_after IS 'Баланс сертификата после применения операции.';
COMMENT ON COLUMN transactions.description IS 'Необязательное описание операции.';
COMMENT ON COLUMN transactions.operator_id IS 'Оператор, выполнивший операцию; может быть пустым для системных операций.';
COMMENT ON COLUMN transactions.created_at IS 'Дата и время создания операции.';

-- Индексы
CREATE INDEX IF NOT EXISTS idx_cards_code ON cards(code);
CREATE INDEX IF NOT EXISTS idx_customer_identities_customer_id ON customer_identities(customer_id);
CREATE INDEX IF NOT EXISTS idx_card_owners_customer_id ON card_owners(customer_id);
CREATE INDEX IF NOT EXISTS idx_card_transfer_tokens_card_id ON card_transfer_tokens(card_id);
CREATE INDEX IF NOT EXISTS idx_card_transfer_tokens_from_customer_id ON card_transfer_tokens(from_customer_id);
CREATE INDEX IF NOT EXISTS idx_card_owner_transfers_card_id ON card_owner_transfers(card_id);
CREATE INDEX IF NOT EXISTS idx_transactions_card_id ON transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
