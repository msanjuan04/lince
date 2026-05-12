-- CreateEnum
CREATE TYPE "PropertyTrackStatus" AS ENUM ('watching', 'interested', 'contacted', 'viewed', 'offering', 'rejected', 'bought');

-- CreateTable
CREATE TABLE "property_tracks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "status" "PropertyTrackStatus" NOT NULL DEFAULT 'watching',
    "notes" TEXT,
    "target_price_eur" DECIMAL(12,2),
    "contacted_at" TIMESTAMPTZ,
    "viewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "property_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_tracks_agency_id_status_idx" ON "property_tracks"("agency_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "property_tracks_agency_id_property_id_key" ON "property_tracks"("agency_id", "property_id");

-- AddForeignKey
ALTER TABLE "property_tracks" ADD CONSTRAINT "property_tracks_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_tracks" ADD CONSTRAINT "property_tracks_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
