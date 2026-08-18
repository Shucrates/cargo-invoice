-- CreateTable
CREATE TABLE "expense_ledgers" (
    "id" TEXT NOT NULL,
    "ledger_no" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_entries" (
    "id" TEXT NOT NULL,
    "ledger_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_mode" TEXT NOT NULL,
    "ref_number" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_ledgers_ledger_no_key" ON "expense_ledgers"("ledger_no");

-- CreateIndex
CREATE INDEX "expense_ledgers_created_by_created_at_idx" ON "expense_ledgers"("created_by", "created_at" DESC);

-- CreateIndex
CREATE INDEX "expense_ledgers_period_start_period_end_idx" ON "expense_ledgers"("period_start", "period_end");

-- CreateIndex
CREATE INDEX "expense_entries_ledger_id_idx" ON "expense_entries"("ledger_id");

-- AddForeignKey
ALTER TABLE "expense_ledgers" ADD CONSTRAINT "expense_ledgers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "expense_ledgers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Expense ledger numbering, mirroring generate_bill_number() in
-- 20260812130000_add_billing/migration.sql
CREATE SEQUENCE IF NOT EXISTS expense_ledger_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_expense_ledger_number()
RETURNS text AS $$
DECLARE
  seq_num bigint;
  fy_start int;
  fy_label text;
BEGIN
  SELECT nextval('expense_ledger_number_seq') INTO seq_num;

  IF EXTRACT(MONTH FROM now()) >= 4 THEN
    fy_start := EXTRACT(YEAR FROM now())::int;
  ELSE
    fy_start := EXTRACT(YEAR FROM now())::int - 1;
  END IF;

  fy_label := lpad((fy_start % 100)::text, 2, '0') || '-' || lpad(((fy_start + 1) % 100)::text, 2, '0');

  RETURN 'EXP/' || fy_label || '/' || lpad(seq_num::text, 5, '0');
END;
$$ LANGUAGE plpgsql;
