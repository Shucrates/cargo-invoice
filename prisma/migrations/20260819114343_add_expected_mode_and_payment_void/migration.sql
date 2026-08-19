-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'Cheque';
ALTER TYPE "PaymentMethod" ADD VALUE 'Card';
ALTER TYPE "PaymentMethod" ADD VALUE 'Other';

-- AlterTable
ALTER TABLE "cargo_dockets" ADD COLUMN "expected_mode" "PaymentMethod";

-- AlterTable
ALTER TABLE "docket_payments" ADD COLUMN "voided" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "docket_payments" ADD COLUMN "void_reason" TEXT;
ALTER TABLE "docket_payments" ADD COLUMN "voided_at" TIMESTAMP(3);
ALTER TABLE "docket_payments" ADD COLUMN "voided_by" TEXT;

-- CreateIndex
CREATE INDEX "docket_payments_voided_paid_at_idx" ON "docket_payments"("voided", "paid_at");

-- AddForeignKey
ALTER TABLE "docket_payments" ADD CONSTRAINT "docket_payments_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
