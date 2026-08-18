-- CreateTable
CREATE TABLE "docket_tracking_events" (
    "id" TEXT NOT NULL,
    "docket_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "event_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "docket_tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "docket_tracking_events_docket_id_event_at_idx" ON "docket_tracking_events"("docket_id", "event_at" DESC);

-- AddForeignKey
ALTER TABLE "docket_tracking_events" ADD CONSTRAINT "docket_tracking_events_docket_id_fkey" FOREIGN KEY ("docket_id") REFERENCES "cargo_dockets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docket_tracking_events" ADD CONSTRAINT "docket_tracking_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
