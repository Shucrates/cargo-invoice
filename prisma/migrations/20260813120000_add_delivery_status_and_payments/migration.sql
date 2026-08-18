-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('Booked', 'Picked Up', 'In Transit', 'Arrived at Hub', 'Out for Delivery', 'Delivered', 'Delayed', 'Exception');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('Cash', 'UPI', 'Bank Transfer');

-- AlterTable
ALTER TABLE "cargo_dockets" ADD COLUMN "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'Booked';

-- CreateTable
CREATE TABLE "docket_payments" (
    "id" TEXT NOT NULL,
    "docket_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paid_at" DATE NOT NULL DEFAULT CURRENT_DATE,
    "notes" TEXT,
    "recorded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "docket_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "docket_payments_docket_id_idx" ON "docket_payments"("docket_id");

-- CreateIndex
CREATE INDEX "docket_payments_method_paid_at_idx" ON "docket_payments"("method", "paid_at");

-- AddForeignKey
ALTER TABLE "docket_payments" ADD CONSTRAINT "docket_payments_docket_id_fkey" FOREIGN KEY ("docket_id") REFERENCES "cargo_dockets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docket_payments" ADD CONSTRAINT "docket_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
