-- KUMA Module: Petite Caisse — Tables autonomes

CREATE TABLE IF NOT EXISTS mod_finance_transactions (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    student_id TEXT,
    type TEXT NOT NULL CHECK(type IN ('tranche', 'examen', 'activite', 'cotisation', 'remboursement')),
    amount REAL NOT NULL CHECK(amount > 0),
    description TEXT,
    payment_method TEXT DEFAULT 'mobile' CHECK(payment_method IN ('mobile', 'espece', 'cheque', 'virement')),
    mobile_operator TEXT CHECK(mobile_operator IN ('ORANGE_MONEY', 'MTN_MOYEKO', 'WAVE', 'AUTRE')),
    transaction_ref TEXT,
    receipt_generated BOOLEAN DEFAULT 0,
    receipt_data TEXT,
    period TEXT,                                    -- 'septembre', 'octobre', etc.
    due_date TEXT,
    paid_at TEXT DEFAULT (datetime('now')),
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_mod_fin_trans_student ON mod_finance_transactions(student_id);
CREATE INDEX idx_mod_fin_trans_period ON mod_finance_transactions(period);
CREATE INDEX idx_mod_fin_trans_type ON mod_finance_transactions(type);
CREATE INDEX idx_mod_fin_trans_due ON mod_finance_transactions(due_date);

CREATE TABLE IF NOT EXISTS mod_finance_receipts (
    id TEXT PRIMARY KEY,
    transaction_id TEXT REFERENCES mod_finance_transactions(id) ON DELETE CASCADE,
    receipt_number TEXT NOT NULL UNIQUE,
    school_name TEXT NOT NULL,
    school_address TEXT,
    recipient_name TEXT NOT NULL,
    recipient_relation TEXT CHECK(recipient_relation IN ('student', 'parent', 'guardian')),
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'XOF',
    description TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    transaction_ref TEXT,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    validated_by TEXT,
    validated_at TEXT
);
CREATE INDEX idx_mod_receipt_number ON mod_finance_receipts(receipt_number);

CREATE TABLE IF NOT EXISTS mod_finance_periods (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    label TEXT NOT NULL,                           -- 'Tranche Septembre-Octobre'
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_mod_period_dates ON mod_finance_periods(school_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS mod_finance_activity_log (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    user_id TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_mod_fin_activity_ts ON mod_finance_activity_log(timestamp);