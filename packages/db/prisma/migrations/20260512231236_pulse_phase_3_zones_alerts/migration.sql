-- CreateEnum
CREATE TYPE "ZoneAlertTrigger" AS ENUM ('new_property', 'price_drop', 'high_score');

-- CreateEnum
CREATE TYPE "ZoneAlertStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- AlterTable
ALTER TABLE "zones" ADD COLUMN     "alert_email" TEXT,
ADD COLUMN     "alert_phone_e164" TEXT;

-- CreateTable
CREATE TABLE "zone_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zone_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "trigger" "ZoneAlertTrigger" NOT NULL,
    "channel" TEXT NOT NULL,
    "status" "ZoneAlertStatus" NOT NULL DEFAULT 'pending',
    "payload" JSONB,
    "error" TEXT,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zone_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zone_alerts_status_created_at_idx" ON "zone_alerts"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "zone_alerts_zone_id_property_id_trigger_key" ON "zone_alerts"("zone_id", "property_id", "trigger");

-- CreateIndex
CREATE INDEX "zones_agency_id_active_idx" ON "zones"("agency_id", "active");

-- AddForeignKey
ALTER TABLE "zone_alerts" ADD CONSTRAINT "zone_alerts_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
