-- AlterTable: track the vendor an expense was paid to, distinct from the
-- ref_number field (used for vehicle registration numbers on vehicle-cost
-- entries).
ALTER TABLE "expense_entries" ADD COLUMN "vendor_name" TEXT;
