-- CreateTable
CREATE TABLE "quotation_sheets" (
    "id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sheet_type" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "min_qty_kg" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "rates" JSONB NOT NULL,
    "notes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotation_sheets_created_by_updated_at_idx" ON "quotation_sheets"("created_by", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "quotation_sheets_sheet_type_is_default_idx" ON "quotation_sheets"("sheet_type", "is_default");

-- AddForeignKey
ALTER TABLE "quotation_sheets" ADD CONSTRAINT "quotation_sheets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
