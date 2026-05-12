-- CreateTable
CREATE TABLE "price_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id" UUID NOT NULL,
    "old_price" DECIMAL(12,2),
    "new_price" DECIMAL(12,2) NOT NULL,
    "delta_pct" DECIMAL(6,2),
    "observed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "description_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id" UUID NOT NULL,
    "old_hash" TEXT,
    "new_hash" TEXT NOT NULL,
    "snippet" TEXT,
    "observed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "description_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_history_property_id_observed_at_idx" ON "price_history"("property_id", "observed_at" DESC);

-- CreateIndex
CREATE INDEX "price_history_observed_at_idx" ON "price_history"("observed_at");

-- CreateIndex
CREATE INDEX "description_history_property_id_observed_at_idx" ON "description_history"("property_id", "observed_at" DESC);

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "description_history" ADD CONSTRAINT "description_history_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
