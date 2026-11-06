import { describe, expect, it, vi } from "vitest";
import { createWorkspace, type CreateWorkspaceStore } from "@/lib/workspace/create";

function store(overrides: Partial<CreateWorkspaceStore> = {}): CreateWorkspaceStore {
  return {
    subdomainTaken: vi.fn(async () => false),
    createEmptySite: vi.fn(async () => ({ siteId: "site_1", subdomain: "ada-docs" })),
    ...overrides,
  };
}

describe("createWorkspace", () => {
  it("creates an empty pending workspace", async () => {
    const mock = store();
    await expect(
      createWorkspace(mock, {
        userId: "user_1",
        name: "Ada Docs",
        subdomain: "ada-docs",
        description: "",
        theme: "MINIMAL",
        primaryColor: "#2A2AD6",
        reviewMode: "AUTO_PUBLISH",
      }),
    ).resolves.toEqual({ status: "created", siteId: "site_1", subdomain: "ada-docs" });
    expect(mock.createEmptySite).toHaveBeenCalledWith({
      userId: "user_1",
      name: "Ada Docs",
      subdomain: "ada-docs",
      description: null,
      theme: "MINIMAL",
      primaryColor: "#2a2ad6",
      reviewMode: "AUTO_PUBLISH",
    });
  });

  it("rejects taken subdomains", async () => {
    const mock = store({ subdomainTaken: async () => true });
    await expect(
      createWorkspace(mock, {
        userId: "user_1",
        name: "Ada Docs",
        subdomain: "ada-docs",
        theme: "MINIMAL",
        primaryColor: "#2A2AD6",
        reviewMode: "AUTO_PUBLISH",
      }),
    ).resolves.toEqual({ status: "subdomain-taken" });
  });
});
