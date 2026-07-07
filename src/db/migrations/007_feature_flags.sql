CREATE TABLE IF NOT EXISTS feature_flags (
    key TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    audience TEXT NOT NULL DEFAULT 'off',
    allowlist JSONB NOT NULL DEFAULT '[]'::JSONB,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT feature_flags_audience_check CHECK (audience IN ('off', 'allowlist', 'operators', 'all')),
    CONSTRAINT feature_flags_allowlist_array_check CHECK (jsonb_typeof(allowlist) = 'array')
);

COMMENT ON TABLE feature_flags IS 'Runtime feature toggles for staged production rollout.';
COMMENT ON COLUMN feature_flags.key IS 'Stable application feature key.';
COMMENT ON COLUMN feature_flags.enabled IS 'Global kill switch for the feature.';
COMMENT ON COLUMN feature_flags.audience IS 'Rollout audience: off, allowlist, operators, or all.';
COMMENT ON COLUMN feature_flags.allowlist IS 'JSON array of allowed Telegram user HMAC values.';
