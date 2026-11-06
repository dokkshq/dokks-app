-- Groq is no longer a provider. Job and UsageEntry both used JobProvider.
-- This script finishes a database that stopped after Job was converted,
-- and it also applies cleanly on a database that still has the old enum.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'JobProvider_old') THEN
    UPDATE "UsageEntry" SET "provider" = 'XAI' WHERE "provider"::text = 'GROQ';
    ALTER TABLE "UsageEntry" ALTER COLUMN "provider" DROP DEFAULT;
    ALTER TABLE "UsageEntry" ALTER COLUMN "provider" TYPE "JobProvider" USING ("provider"::text::"JobProvider");
    DROP TYPE "JobProvider_old";
  ELSE
    UPDATE "Job" SET "provider" = 'XAI' WHERE "provider"::text = 'GROQ';
    UPDATE "UsageEntry" SET "provider" = 'XAI' WHERE "provider"::text = 'GROQ';
    ALTER TYPE "JobProvider" RENAME TO "JobProvider_old";
    CREATE TYPE "JobProvider" AS ENUM ('XAI', 'FAKE');
    ALTER TABLE "Job" ALTER COLUMN "provider" DROP DEFAULT;
    ALTER TABLE "UsageEntry" ALTER COLUMN "provider" DROP DEFAULT;
    ALTER TABLE "Job" ALTER COLUMN "provider" TYPE "JobProvider" USING ("provider"::text::"JobProvider");
    ALTER TABLE "UsageEntry" ALTER COLUMN "provider" TYPE "JobProvider" USING ("provider"::text::"JobProvider");
    DROP TYPE "JobProvider_old";
  END IF;
END $$;
