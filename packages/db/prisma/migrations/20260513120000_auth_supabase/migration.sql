-- CreateEnum
CREATE TYPE "PulseRole" AS ENUM ('inmobiliaria', 'buying_agent', 'inversor_directo', 'flipper');

-- AlterTable: agencies — añadir pulse_role
ALTER TABLE "agencies" ADD COLUMN "pulse_role" "PulseRole";

-- AlterTable: users — vincular con auth.users de Supabase
ALTER TABLE "users" ADD COLUMN "supabase_user_id" UUID;
CREATE UNIQUE INDEX "users_supabase_user_id_key" ON "users"("supabase_user_id");
