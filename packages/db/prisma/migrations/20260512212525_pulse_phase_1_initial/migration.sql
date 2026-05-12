-- CreateEnum
CREATE TYPE "AgencyPlan" AS ENUM ('basic', 'pro', 'elite', 'founder');

-- CreateEnum
CREATE TYPE "AgencyMemberRole" AS ENUM ('owner', 'agent', 'admin');

-- CreateEnum
CREATE TYPE "CaptureStatus" AS ENUM ('new', 'contacted', 'meeting', 'signed', 'lost');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('draft', 'live', 'sold', 'withdrawn');

-- CreateEnum
CREATE TYPE "ListingLeadStatus" AS ENUM ('new', 'contacted', 'qualified', 'lost', 'closed');

-- CreateTable
CREATE TABLE "agencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "plan" "AgencyPlan" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_members" (
    "agency_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "AgencyMemberRole" NOT NULL,

    CONSTRAINT "agency_members_pkey" PRIMARY KEY ("agency_id","user_id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_url" TEXT,
    "type" TEXT,
    "address" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "province" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "cadastral_ref" TEXT,
    "m2" INTEGER,
    "rooms" INTEGER,
    "bathrooms" INTEGER,
    "year_built" INTEGER,
    "price" DECIMAL(12,2),
    "price_per_m2" DECIMAL(10,2),
    "zone_avg_price_per_m2" DECIMAL(10,2),
    "opportunity_score" DECIMAL(5,2),
    "status" TEXT,
    "description" TEXT,
    "description_hash" TEXT,
    "has_terrace" BOOLEAN,
    "has_elevator" BOOLEAN,
    "floor" TEXT,
    "orientation" TEXT,
    "condition" TEXT,
    "is_bank_owned" BOOLEAN,
    "is_auction" BOOLEAN,
    "auction_starting_price" DECIMAL(12,2),
    "red_flags" TEXT[],
    "raw_data" JSONB,
    "first_seen" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "name" TEXT,
    "geometry" JSONB,
    "postal_codes" TEXT[],
    "filters" JSONB,
    "alert_channels" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "captures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "property_id" UUID,
    "status" "CaptureStatus",
    "notes" TEXT,
    "owner_name" TEXT,
    "owner_phone" TEXT,
    "owner_email" TEXT,
    "proposal_pdf_url" TEXT,
    "contacted_at" TIMESTAMPTZ,
    "signed_at" TIMESTAMPTZ,
    "deal_value" DECIMAL(12,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "captures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "capture_id" UUID,
    "agency_id" UUID NOT NULL,
    "ficha_seo_text" TEXT,
    "photos" JSONB,
    "staging_photos" JSONB,
    "price" DECIMAL(12,2),
    "status" "ListingStatus",
    "distributed_to" TEXT[],
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "leads_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID,
    "agency_id" UUID,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "message" TEXT,
    "status" "ListingLeadStatus",
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawler_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL,
    "status" TEXT,
    "properties_found" INTEGER,
    "properties_new" INTEGER,
    "properties_updated" INTEGER,
    "errors" JSONB,
    "started_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,

    CONSTRAINT "crawler_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "properties_postal_code_idx" ON "properties"("postal_code");

-- CreateIndex
CREATE INDEX "properties_opportunity_score_idx" ON "properties"("opportunity_score" DESC);

-- CreateIndex
CREATE INDEX "properties_lat_lng_idx" ON "properties"("lat", "lng");

-- CreateIndex
CREATE INDEX "properties_is_auction_idx" ON "properties"("is_auction");

-- CreateIndex
CREATE INDEX "properties_is_bank_owned_idx" ON "properties"("is_bank_owned");

-- CreateIndex
CREATE UNIQUE INDEX "properties_source_source_id_key" ON "properties"("source", "source_id");

-- AddForeignKey
ALTER TABLE "agency_members" ADD CONSTRAINT "agency_members_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_members" ADD CONSTRAINT "agency_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captures" ADD CONSTRAINT "captures_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captures" ADD CONSTRAINT "captures_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_leads" ADD CONSTRAINT "listing_leads_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_leads" ADD CONSTRAINT "listing_leads_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
