-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('staff', 'admin');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('issued', 'voided');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('Road', 'Air', 'Train');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('Paid', 'To Pay', 'Credit');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashed_password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'staff',
    "full_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "pin_code" TEXT,
    "phone" TEXT,
    "gstin" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargo_dockets" (
    "id" TEXT NOT NULL,
    "docket_no" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'issued',
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by" TEXT,
    "booking_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transport_mode" "TransportMode" NOT NULL DEFAULT 'Road',
    "is_international" BOOLEAN NOT NULL DEFAULT false,
    "from_city" TEXT NOT NULL,
    "to_city" TEXT NOT NULL,
    "consignor_name" TEXT NOT NULL,
    "consignor_address" TEXT,
    "consignor_pin" TEXT,
    "consignor_phone" TEXT,
    "consignor_gstin" TEXT,
    "consignee_name" TEXT NOT NULL,
    "consignee_address" TEXT,
    "consignee_pin" TEXT,
    "consignee_phone" TEXT,
    "consignee_gstin" TEXT,
    "package_count" INTEGER NOT NULL DEFAULT 1,
    "packing_method" TEXT,
    "invoice_no" TEXT,
    "invoice_value" DECIMAL(12,2),
    "actual_weight_kg" DECIMAL(10,2),
    "charged_weight_kg" DECIMAL(10,2),
    "dimensions_lhb" TEXT,
    "goods_description" TEXT,
    "freight_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "risk_charge" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "handling_charge" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "docket_charge" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "pickup_delivery_charge" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "other_charge" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "gst_percentage" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "gst_amount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "grand_total" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "payment_mode" "PaymentMode" NOT NULL DEFAULT 'To Pay',
    "customer_code" TEXT,
    "tracking_no" TEXT,
    "courier_partner" TEXT,
    "physical_docket_no" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cargo_dockets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cargo_dockets_docket_no_key" ON "cargo_dockets"("docket_no");

-- CreateIndex
CREATE INDEX "cargo_dockets_created_by_created_at_idx" ON "cargo_dockets"("created_by", "created_at" DESC);

-- CreateIndex
CREATE INDEX "cargo_dockets_created_at_idx" ON "cargo_dockets"("created_at" DESC);

-- CreateIndex
CREATE INDEX "cargo_dockets_status_idx" ON "cargo_dockets"("status");

-- CreateIndex
CREATE INDEX "cargo_dockets_tracking_no_idx" ON "cargo_dockets"("tracking_no");

-- CreateIndex
CREATE INDEX "cargo_dockets_physical_docket_no_idx" ON "cargo_dockets"("physical_docket_no");

-- AddForeignKey
ALTER TABLE "cargo_dockets" ADD CONSTRAINT "cargo_dockets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargo_dockets" ADD CONSTRAINT "cargo_dockets_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Custom objects below are not derivable from schema.prisma and must be kept
-- in this migration by hand.
-- ---------------------------------------------------------------------------

-- Sequential, human-readable LR numbers (LR-2026-01001, ...).
-- Called explicitly by the docket INSERT rather than used as a column DEFAULT,
-- so that the application controls when a number is consumed.
CREATE SEQUENCE IF NOT EXISTS docket_number_seq START WITH 1001 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION generate_docket_number()
RETURNS text AS $$
DECLARE
  seq_num bigint;
BEGIN
  SELECT nextval('docket_number_seq') INTO seq_num;
  RETURN 'LR-' || to_char(now(), 'YYYY') || '-' || lpad(seq_num::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Defense in depth: dockets are financial records and may never be deleted.
CREATE OR REPLACE FUNCTION prevent_docket_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PERMANENT RECORD BAN: Cargo dockets can never be deleted from the database.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_docket_delete
BEFORE DELETE ON cargo_dockets
FOR EACH ROW EXECUTE PROCEDURE prevent_docket_delete();

-- Strict UPDATE protection: core financial/route/party fields are immutable.
-- Tracking details and the void transition remain editable.
CREATE OR REPLACE FUNCTION prevent_docket_unauthorized_update()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'IMMUTABLE RECORD: Voided dockets cannot be altered.';
  END IF;

  IF NEW.status = 'voided' THEN
    IF (OLD.docket_no IS DISTINCT FROM NEW.docket_no) OR
       (OLD.created_by IS DISTINCT FROM NEW.created_by) OR
       (OLD.booking_date IS DISTINCT FROM NEW.booking_date) OR
       (OLD.from_city IS DISTINCT FROM NEW.from_city) OR
       (OLD.to_city IS DISTINCT FROM NEW.to_city) OR
       (OLD.consignor_name IS DISTINCT FROM NEW.consignor_name) OR
       (OLD.consignee_name IS DISTINCT FROM NEW.consignee_name) OR
       (OLD.grand_total IS DISTINCT FROM NEW.grand_total) THEN
      RAISE EXCEPTION 'UNAUTHORIZED ALTERATION: Only status and void audit fields can be updated when voiding a docket.';
    END IF;
  ELSE
    IF (OLD.docket_no IS DISTINCT FROM NEW.docket_no) OR
       (OLD.created_by IS DISTINCT FROM NEW.created_by) OR
       (OLD.booking_date IS DISTINCT FROM NEW.booking_date) OR
       (OLD.from_city IS DISTINCT FROM NEW.from_city) OR
       (OLD.to_city IS DISTINCT FROM NEW.to_city) OR
       (OLD.consignor_name IS DISTINCT FROM NEW.consignor_name) OR
       (OLD.consignee_name IS DISTINCT FROM NEW.consignee_name) OR
       (OLD.grand_total IS DISTINCT FROM NEW.grand_total) OR
       (OLD.freight_amount IS DISTINCT FROM NEW.freight_amount) OR
       (OLD.subtotal IS DISTINCT FROM NEW.subtotal) THEN
      RAISE EXCEPTION 'IMMUTABLE RECORD: Core financial and shipment fields cannot be edited. Only tracking details and status can be updated.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_docket_unauthorized_update
BEFORE UPDATE ON cargo_dockets
FOR EACH ROW EXECUTE PROCEDURE prevent_docket_unauthorized_update();

