-- AlterTable
ALTER TABLE "cargo_dockets" ALTER COLUMN "docket_no" DROP DEFAULT,
ALTER COLUMN "booking_date" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "updated_at" DROP DEFAULT;
