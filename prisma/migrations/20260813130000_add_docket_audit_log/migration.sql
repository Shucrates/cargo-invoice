-- CreateTable
CREATE TABLE "docket_audit_logs" (
    "id" TEXT NOT NULL,
    "docket_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "performed_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "docket_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "docket_audit_logs_docket_id_created_at_idx" ON "docket_audit_logs"("docket_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "docket_audit_logs" ADD CONSTRAINT "docket_audit_logs_docket_id_fkey" FOREIGN KEY ("docket_id") REFERENCES "cargo_dockets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docket_audit_logs" ADD CONSTRAINT "docket_audit_logs_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
