-- ═══════════════════════════════════════════════════════════════════════════
--  Meridian Mutual — system-of-record schema (PostgreSQL 16)
--  Mounted automatically by docker-compose into /docker-entrypoint-initdb.d/
--  The db_extractor pulls incremental changes from these tables into bronze.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS customers (
    customer_id     VARCHAR(12) PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    age             SMALLINT     NOT NULL CHECK (age BETWEEN 18 AND 100),
    region          VARCHAR(16)  NOT NULL,
    customer_since  DATE         NOT NULL,
    credit_band     CHAR(1)      NOT NULL DEFAULT 'B',
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policies (
    policy_id            VARCHAR(12) PRIMARY KEY,
    customer_id          VARCHAR(12) NOT NULL REFERENCES customers(customer_id),
    product              VARCHAR(12) NOT NULL CHECK (product IN ('Motor','Home','Health')),
    sub_product          VARCHAR(24) NOT NULL,
    region               VARCHAR(16) NOT NULL,
    distribution_channel VARCHAR(12) NOT NULL,
    effective_date       DATE        NOT NULL,
    expiry_date          DATE        NOT NULL,
    annual_premium       NUMERIC(12,2) NOT NULL CHECK (annual_premium > 0),
    sum_insured          NUMERIC(14,2) NOT NULL CHECK (sum_insured > 0),
    status               VARCHAR(12) NOT NULL DEFAULT 'Active'
                         CHECK (status IN ('Active','Renewed','Lapsed','Cancelled')),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS premium_payments (
    payment_id  VARCHAR(16) PRIMARY KEY,
    policy_id   VARCHAR(12) NOT NULL REFERENCES policies(policy_id),
    due_date    DATE        NOT NULL,
    amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    status      VARCHAR(10) NOT NULL CHECK (status IN ('Paid','Failed','Returned')),
    method      VARCHAR(16) NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims (
    claim_id       VARCHAR(12) PRIMARY KEY,
    policy_id      VARCHAR(12) NOT NULL REFERENCES policies(policy_id),
    loss_date      DATE   NOT NULL,
    report_date    DATE   NOT NULL,
    reported_lag_days INT NOT NULL DEFAULT 0,
    peril          VARCHAR(24) NOT NULL,
    claim_amount   NUMERIC(12,2) NOT NULL CHECK (claim_amount > 0),
    paid_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    reserve_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status         VARCHAR(8) NOT NULL CHECK (status IN ('Open','Closed','Reopened')),
    closed_date    DATE,
    night_indicator BOOLEAN NOT NULL DEFAULT FALSE,
    fraud_flag     BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fraud_alerts (
    alert_id    VARCHAR(12) PRIMARY KEY,
    claim_id    VARCHAR(12) NOT NULL REFERENCES claims(claim_id),
    alert_date  DATE   NOT NULL,
    alert_score NUMERIC(5,4) NOT NULL,
    siu_outcome VARCHAR(24) NOT NULL
);

-- Incremental-extraction helper columns -------------------------------
CREATE INDEX IF NOT EXISTS idx_policies_updated    ON policies (updated_at);
CREATE INDEX IF NOT EXISTS idx_customers_updated   ON customers (updated_at);
CREATE INDEX IF NOT EXISTS idx_payments_updated    ON premium_payments (updated_at);
CREATE INDEX IF NOT EXISTS idx_claims_updated      ON claims (updated_at);
CREATE INDEX IF NOT EXISTS idx_claims_policy       ON claims (policy_id);
CREATE INDEX IF NOT EXISTS idx_payments_policy     ON premium_payments (policy_id);
