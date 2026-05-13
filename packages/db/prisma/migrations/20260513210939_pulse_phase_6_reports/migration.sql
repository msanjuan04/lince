-- CreateTable
CREATE TABLE "pulse_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agency_id" UUID NOT NULL,
    "week_of" DATE NOT NULL,
    "narrative" TEXT,
    "top_opportunities" JSONB NOT NULL,
    "inventory_snapshot" JSONB,
    "model_id" TEXT,
    "prompt_version" TEXT,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "cost_eur" DECIMAL(8,4),
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pulse_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pulse_reports_agency_id_created_at_idx" ON "pulse_reports"("agency_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "pulse_reports_agency_id_week_of_key" ON "pulse_reports"("agency_id", "week_of");

-- AddForeignKey
ALTER TABLE "pulse_reports" ADD CONSTRAINT "pulse_reports_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
