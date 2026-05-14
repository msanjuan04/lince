-- CreateTable
CREATE TABLE "property_visual_analyses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id" UUID NOT NULL,
    "image_url" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "condition_score" INTEGER,
    "condition_label" TEXT,
    "reform_cost_per_m2" DECIMAL(8,2),
    "elements_to_reform" TEXT[],
    "visual_red_flags" TEXT[],
    "photo_quality" TEXT,
    "summary" TEXT,
    "raw_response" JSONB NOT NULL,
    "tokens_in" INTEGER NOT NULL,
    "tokens_out" INTEGER NOT NULL,
    "cost_eur" DECIMAL(8,4) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_visual_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_visual_analyses_property_id_created_at_idx" ON "property_visual_analyses"("property_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "property_visual_analyses" ADD CONSTRAINT "property_visual_analyses_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
