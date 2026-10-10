-- Add passwordVersion column to users table
ALTER TABLE "users" ADD COLUMN "passwordVersion" INTEGER NOT NULL DEFAULT 0;