import { describe, expect, it, vi } from "vitest";
import { attachRepoToWorkspace, type AttachRepoStore } from "@/lib/workspace/attach-repo";

function store(overrides: Partial<AttachRepoStore> = {}): AttachRepoStore {
  return {
    findOwnedEmptySite: vi.fn(async () => ({
      id: "site_1",
      subdomain: "ada-docs",
      repoId: null,
    })),
    findRepoForUser: vi.fn(async () => ({
      id: "repo_1",
      githubRepoId: "1",
      owner: "ada",
      name: "docs",
      fullName: "ada/docs",
      siteId: null,
      siteSubdomain: null,
      archived: false,
      removed: false,
    })),
    attachRepoAndQueueBuild: vi.fn(async () => ({
      siteId: "site_1",
      jobId: "job_1",
      subdomain: "ada-docs",
    })),
    ...overrides,
  };
}

describe("attachRepoToWorkspace", () => {
  it("attaches a repo and queues the first build", async () => {
    const mock = store();
    await expect(
      attachRepoToWorkspace(mock, { siteId: "site_1", repoId: "repo_1", userId: "user_1" }),
    ).resolves.toEqual({
      status: "attached",
      siteId: "site_1",
      jobId: "job_1",
      subdomain: "ada-docs",
    });
    expect(mock.attachRepoAndQueueBuild).toHaveBeenCalledWith({
      siteId: "site_1",
      repoId: "repo_1",
      idempotencyKey: "first-build:repo_1",
    });
  });

  it("refuses when the workspace already has a repo", async () => {
    const mock = store({
      findOwnedEmptySite: async () => ({
        id: "site_1",
        subdomain: "ada-docs",
        repoId: "repo_existing",
      }),
    });
    await expect(
      attachRepoToWorkspace(mock, { siteId: "site_1", repoId: "repo_1", userId: "user_1" }),
    ).resolves.toEqual({
      status: "site-has-repo",
      siteId: "site_1",
      subdomain: "ada-docs",
    });
  });

  it("refuses repos that already belong to a site", async () => {
    const mock = store({
      findRepoForUser: async () => ({
        id: "repo_1",
        githubRepoId: "1",
        owner: "ada",
        name: "docs",
        fullName: "ada/docs",
        siteId: "other_site",
        siteSubdomain: "other",
        archived: false,
        removed: false,
      }),
    });
    await expect(
      attachRepoToWorkspace(mock, { siteId: "site_1", repoId: "repo_1", userId: "user_1" }),
    ).resolves.toEqual({ status: "repo-imported", siteId: "other_site" });
  });
});
