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
CREATE INDEX IF NOT EXISTS idx_transactions_card_id ON transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
