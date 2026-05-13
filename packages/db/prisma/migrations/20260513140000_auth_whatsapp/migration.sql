-- ─────────────────────────────────────────────────────────────────────
-- Lince Auth — flujo phone-only con verificación por WhatsApp OTP
-- ─────────────────────────────────────────────────────────────────────

-- 1. Email pasa a ser opcional (puede añadirse después)
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- 2. Nueva columna phone_e164 (identificador principal)
ALTER TABLE "users" ADD COLUMN "phone_e164" TEXT;
CREATE UNIQUE INDEX "users_phone_e164_key" ON "users"("phone_e164");

-- 3. Campos para gestionar el OTP de WhatsApp
ALTER TABLE "users" ADD COLUMN "whatsapp_otp_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "whatsapp_otp_expires_at" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN "whatsapp_otp_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "whatsapp_otp_sent_at" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN "whatsapp_verified_at" TIMESTAMPTZ;
