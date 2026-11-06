import { describe, expect, it, vi } from "vitest";
import {
  importRepo,
  type ImportRepoInput,
  type ImportStore,
} from "@/lib/import/repo-import";

function store(overrides: Partial<ImportStore> = {}): ImportStore {
  return {
    findRepoForUser: vi.fn(async () => ({
      id: "repo_1",
      githubRepoId: "987654321",
      owner: "ada",
      name: "docs",
      fullName: "ada/docs",
      siteId: null,
      siteSubdomain: null,
      archived: false,
      removed: false,
    })),
    subdomainTaken: vi.fn(async () => false),
    createSiteAndJob: vi.fn(async () => ({
      siteId: "site_1",
      jobId: "job_1",
      subdomain: "ada-docs",
    })),
    ...overrides,
  };
}

function mockStore(overrides: Partial<ImportStore> = {}) {
  return store(overrides);
}

function input(overrides: Partial<ImportRepoInput> = {}): ImportRepoInput {
  return {
    repoId: "repo_1",
    userId: "user_1",
    name: "Ada Docs",
    subdomain: "ada-docs",
    description: "API docs",
    theme: "LEDGER",
    primaryColor: "#1122AA",
    reviewMode: "AUTO_PUBLISH",
    ...overrides,
  };
}

describe("repo import", () => {
  it("creates one pending site and one first-build job with the chosen fields", async () => {
    const mock = store();
    const result = await importRepo(mock, input());
    expect(result).toEqual({
      status: "imported",
      siteId: "site_1",
      jobId: "job_1",
      subdomain: "ada-docs",
    });
    expect(mock.createSiteAndJob).toHaveBeenCalledWith({
      repoId: "repo_1",
      userId: "user_1",
      name: "Ada Docs",
      subdomain: "ada-docs",
      description: "API docs",
      theme: "LEDGER",
      primaryColor: "#1122aa",
      reviewMode: "AUTO_PUBLISH",
      idempotencyKey: "first-build:repo_1",
    });
  });

  it("validates and normalizes the review mode", async () => {
    const rejected = await importRepo(mockStore(), input({ reviewMode: "sometimes" }));
    expect(rejected).toEqual({
      status: "invalid",
      field: "reviewMode",
      message: "Choose auto-publish or review first.",
    });
    const accepted = mockStore();
    await importRepo(accepted, input({ reviewMode: "review" }));
    expect(accepted.createSiteAndJob).toHaveBeenCalledWith(
      expect.objectContaining({ reviewMode: "REVIEW" }),
    );
  });

  it("stores an empty description as null", async () => {
    const mock = store();
    await importRepo(mock, input({ description: "   " }));
    expect(mock.createSiteAndJob).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );
  });

  it("is idempotent for an already imported repo", async () => {
    const create = vi.fn();
    const mock = store({
      findRepoForUser: async () => ({
        id: "repo_1",
        githubRepoId: "987654321",
        owner: "ada",
        name: "docs",
        fullName: "ada/docs",
        siteId: "site_existing",
        siteSubdomain: "existing",
        archived: false,
        removed: false,
      }),
      createSiteAndJob: create,
    });
    await expect(importRepo(mock, input())).resolves.toEqual({
      status: "already-imported",
      siteId: "site_existing",
      subdomain: "existing",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a repo outside the user's installations", async () => {
    const mock = store({ findRepoForUser: async () => null });
    await expect(importRepo(mock, input({ userId: "user_2" }))).resolves.toEqual({
      status: "not-found",
    });
    expect(mock.createSiteAndJob).not.toHaveBeenCalled();
  });

  it("refuses archived and removed repos", async () => {
    const mock = store({
      findRepoForUser: async () => ({
        id: "repo_1",
        githubRepoId: "987654321",
        owner: "ada",
        name: "docs",
        fullName: "ada/docs",
        siteId: null,
        siteSubdomain: null,
        archived: true,
        removed: false,
      }),
    });
    await expect(importRepo(mock, input())).resolves.toEqual({ status: "unavailable" });
    expect(mock.createSiteAndJob).not.toHaveBeenCalled();
  });

  it("validates the site name", async () => {
    const mock = store();
    await expect(importRepo(mock, input({ name: "  " }))).resolves.toEqual({
      status: "invalid",
      field: "name",
      message: "Enter a site name.",
    });
    expect(mock.createSiteAndJob).not.toHaveBeenCalled();
  });

  it("validates the subdomain format and reserved names", async () => {
    const mock = store();
    await expect(importRepo(mock, input({ subdomain: "Ada_Docs" }))).resolves.toMatchObject({
      status: "invalid",
      field: "subdomain",
    });
    await expect(importRepo(mock, input({ subdomain: "docs" }))).resolves.toEqual({
      status: "invalid",
      field: "subdomain",
      message: "That subdomain is reserved. Choose another.",
    });
    expect(mock.createSiteAndJob).not.toHaveBeenCalled();
  });

  it("validates the description, theme, and color", async () => {
    const mock = store();
    await expect(
      importRepo(mock, input({ description: "x".repeat(281) })),
    ).resolves.toMatchObject({ status: "invalid", field: "description" });
    await expect(importRepo(mock, input({ theme: "FANCY" }))).resolves.toEqual({
      status: "invalid",
      field: "theme",
      message: "Choose the Ledger or Minimal theme.",
    });
    await expect(importRepo(mock, input({ primaryColor: "blue" }))).resolves.toEqual({
      status: "invalid",
      field: "primaryColor",
      message: "Choose a six-digit hex color.",
    });
    expect(mock.createSiteAndJob).not.toHaveBeenCalled();
  });

  it("refuses a taken subdomain", async () => {
    const mock = store({ subdomainTaken: async () => true });
    await expect(importRepo(mock, input())).resolves.toEqual({ status: "subdomain-taken" });
    expect(mock.createSiteAndJob).not.toHaveBeenCalled();
  });

  it("maps a unique collision to a taken subdomain", async () => {
    const subdomainTaken = vi.fn(async () => false);
    subdomainTaken.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const mock = store({
      subdomainTaken,
      createSiteAndJob: vi.fn(async () => {
        throw new Error("unique constraint");
      }),
    });
    await expect(importRepo(mock, input())).resolves.toEqual({ status: "subdomain-taken" });
  });

  it("rethrows unexpected write failures", async () => {
    const mock = store({
      createSiteAndJob: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    await expect(importRepo(mock, input())).rejects.toThrow("database unavailable");
  });
});
