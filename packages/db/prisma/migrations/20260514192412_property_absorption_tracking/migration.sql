-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "days_on_market_observed" INTEGER,
ADD COLUMN     "disappeared_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "properties_disappeared_at_idx" ON "properties"("disappeared_at");
