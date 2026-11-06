import type { ImportRepoRow } from "@/lib/import/repo-import";

export type AttachRepoInput = {
  siteId: string;
  repoId: string;
  userId: string;
};

export type AttachRepoStore = {
  findOwnedEmptySite(siteId: string, userId: string): Promise<{
    id: string;
    subdomain: string;
    repoId: string | null;
  } | null>;
  findRepoForUser(repoId: string, userId: string): Promise<ImportRepoRow | null>;
  attachRepoAndQueueBuild(input: {
    siteId: string;
    repoId: string;
    idempotencyKey: string;
  }): Promise<{ siteId: string; jobId: string; subdomain: string }>;
};

export type AttachRepoResult =
  | { status: "attached"; siteId: string; jobId: string; subdomain: string }
  | { status: "already-attached"; siteId: string; subdomain: string }
  | { status: "repo-imported"; siteId: string }
  | { status: "not-found" }
  | { status: "unavailable" }
  | { status: "site-has-repo"; siteId: string; subdomain: string };

export async function attachRepoToWorkspace(
  store: AttachRepoStore,
  args: AttachRepoInput,
): Promise<AttachRepoResult> {
  const site = await store.findOwnedEmptySite(args.siteId, args.userId);
  if (!site) return { status: "not-found" };
  if (site.repoId) {
    return { status: "site-has-repo", siteId: site.id, subdomain: site.subdomain };
  }

  const repo = await store.findRepoForUser(args.repoId, args.userId);
  if (!repo) return { status: "not-found" };
  if (repo.siteId) return { status: "repo-imported", siteId: repo.siteId };
  if (repo.archived || repo.removed) return { status: "unavailable" };

  try {
    const attached = await store.attachRepoAndQueueBuild({
      siteId: site.id,
      repoId: repo.id,
      idempotencyKey: `first-build:${repo.id}`,
    });
    return { status: "attached", ...attached };
  } catch (error) {
    const again = await store.findRepoForUser(args.repoId, args.userId);
    if (again?.siteId) return { status: "repo-imported", siteId: again.siteId };
    const siteAgain = await store.findOwnedEmptySite(args.siteId, args.userId);
    if (siteAgain?.repoId) {
      return {
        status: "already-attached",
        siteId: siteAgain.id,
        subdomain: siteAgain.subdomain,
      };
    }
    throw error;
  }
}
