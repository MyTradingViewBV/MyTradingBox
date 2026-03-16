-- ============================================================
-- Chart State Migration
-- Stores per-user chart drawings and visual settings
-- keyed by (user_id, exchange_id, symbol, timeframe)
-- ============================================================

-- Extension required for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- Table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chart_state (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      VARCHAR(128) NOT NULL,          -- JWT sub / username
    exchange_id  INTEGER      NOT NULL,
    symbol       VARCHAR(32)  NOT NULL,
    drawings     JSONB        NOT NULL DEFAULT '[]',
    settings     JSONB        NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_chart_state_key UNIQUE (user_id, exchange_id, symbol, timeframe)
);

-- Partial index for fast look-ups by user + context
CREATE INDEX IF NOT EXISTS idx_chart_state_user
    ON chart_state (user_id, exchange_id, symbol, timeframe);

-- Trigger: keep updated_at current on every update
CREATE OR REPLACE FUNCTION chart_state_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chart_state_updated_at ON chart_state;
CREATE TRIGGER trg_chart_state_updated_at
    BEFORE UPDATE ON chart_state
    FOR EACH ROW EXECUTE PROCEDURE chart_state_set_updated_at();

-- ============================================================
-- drawings column stores an array of Drawing objects:
-- [
--   {
--     "id":        "uuid-string",
--     "type":      "horizontal-line" | "vertical-line" | "fib-retracement" | "fib-extension",
--     "points":    [{ "x": <timestamp_ms>, "y": <price> }],
--     "color":     "#hex",
--     "lineWidth": 1,
--     "fibLevels": [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]  -- optional
--   }
-- ]
--
-- settings column stores chart visual toggles:
-- {
--   "showBoxes":        true,
--   "showKeyZones":     false,
--   "showOrders":       false,
--   "showIndicators":   true,
--   "showMarketCipher": false,
--   "showDivergences":  false,
--   "boxMode":          "boxes"
-- }
-- ============================================================
