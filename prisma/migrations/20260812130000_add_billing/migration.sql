-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "bill_no" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "invoice_date" DATE NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'B2B',
    "doc_type" TEXT NOT NULL DEFAULT 'INV',
    "is_services" BOOLEAN NOT NULL DEFAULT true,
    "customer_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "customer_gstin" TEXT,
    "customer_address" TEXT,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "docket_ids" TEXT[],
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "gst_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "round_off" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "grand_total" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_drafts" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "label" TEXT,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bills_bill_no_key" ON "bills"("bill_no");

-- CreateIndex
CREATE INDEX "bills_created_by_created_at_idx" ON "bills"("created_by", "created_at" DESC);

-- CreateIndex
CREATE INDEX "bills_created_at_idx" ON "bills"("created_at" DESC);

-- CreateIndex
CREATE INDEX "bill_drafts_created_by_updated_at_idx" ON "bill_drafts"("created_by", "updated_at" DESC);

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_drafts" ADD CONSTRAINT "bill_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Custom objects below are not derivable from schema.prisma and must be kept
-- in this migration by hand.
-- ---------------------------------------------------------------------------

-- Sequential, human-readable bill numbers (RCT/26-27/00001, ...), reset by
-- Indian financial year (Apr-Mar). Called explicitly by the bill INSERT
-- rather than used as a column DEFAULT, so the application controls when a
-- number is consumed.
CREATE SEQUENCE IF NOT EXISTS bill_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION generate_bill_number()
RETURNS text AS $$
DECLARE
  seq_num bigint;
  fy_start int;
  fy_label text;
BEGIN
  SELECT nextval('bill_number_seq') INTO seq_num;

  IF EXTRACT(MONTH FROM now()) >= 4 THEN
    fy_start := EXTRACT(YEAR FROM now())::int;
  ELSE
    fy_start := EXTRACT(YEAR FROM now())::int - 1;
  END IF;

  fy_label := lpad((fy_start % 100)::text, 2, '0') || '-' || lpad(((fy_start + 1) % 100)::text, 2, '0');

  RETURN 'RCT/' || fy_label || '/' || lpad(seq_num::text, 5, '0');
END;
$$ LANGUAGE plpgsql;
