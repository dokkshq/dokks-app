-- Empty workspaces can exist before a GitHub repo is attached.
ALTER TABLE "Site" ALTER COLUMN "repoId" DROP NOT NULL;
