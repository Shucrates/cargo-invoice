-- 1. Create Enums
CREATE TYPE "Role" AS ENUM ('staff', 'admin');
CREATE TYPE "Status" AS ENUM ('issued', 'voided');
CREATE TYPE "TransportMode" AS ENUM ('Road', 'Air', 'Train');
CREATE TYPE "PaymentMode" AS ENUM ('Paid', 'To Pay', 'Credit');

-- 2. Create Sequence for Sequential Docket Numbers
CREATE SEQUENCE IF NOT EXISTS docket_number_seq START WITH 1001 INCREMENT BY 1;

-- 3. Create Docket Number Generator Function
CREATE OR REPLACE FUNCTION generate_docket_number()
RETURNS text AS $$
DECLARE
  seq_num bigint;
BEGIN
  SELECT nextval('docket_number_seq') INTO seq_num;
  RETURN 'LR-' || to_char(now(), 'YYYY') || '-' || lpad(seq_num::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- 4. Create Users Table
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashed_password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'staff',
    "full_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- 5. Create Cargo Dockets Table
CREATE TABLE "cargo_dockets" (
    "id" TEXT NOT NULL,
    "docket_no" TEXT NOT NULL DEFAULT generate_docket_number(),
    "created_by" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'issued',
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by" TEXT,
    "booking_date" DATE NOT NULL DEFAULT CURRENT_DATE,
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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cargo_dockets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cargo_dockets_docket_no_key" ON "cargo_dockets"("docket_no");

-- Foreign Keys
ALTER TABLE "cargo_dockets" ADD CONSTRAINT "cargo_dockets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cargo_dockets" ADD CONSTRAINT "cargo_dockets_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. PHASE 5 DATABASE DEFENSE-IN-DEPTH TRIGGERS
-- Trigger A: Hard ban on DELETE queries
CREATE OR REPLACE FUNCTION prevent_docket_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PERMANENT RECORD BAN: Cargo dockets can never be deleted from the database.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_docket_delete
BEFORE DELETE ON cargo_dockets
FOR EACH ROW EXECUTE PROCEDURE prevent_docket_delete();

-- Trigger B: Strict UPDATE protection (protects core financials/route/names, permits tracking_no & courier_partner updates)
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
    -- Issued Dockets: Protect core business & financial fields, but permit updating courier_partner and tracking_no
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
