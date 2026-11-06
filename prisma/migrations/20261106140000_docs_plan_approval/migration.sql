-- Plan approval pauses a job without publishing, and later repo spend defaults to $6.
ALTER TYPE "JobStatus" ADD VALUE 'WAITING';
ALTER TYPE "JobPhase" ADD VALUE 'AWAITING_APPROVAL';

UPDATE "Plan"
SET "dailyRepoCapUsd" = 6
WHERE "tier" = 'FREE' AND "dailyRepoCapUsd" = 2;
