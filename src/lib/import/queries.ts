import { getPrisma } from "@/lib/db";
import { installationVisibleWhere } from "@/lib/github/installation-access";
import { subdomainCandidates } from "@/lib/github/subdomain";
import { IMPORT_PAGE_SIZE, type ImportAccount, type ImportView } from "@/lib/import/types";

export { IMPORT_PAGE_SIZE } from "@/lib/import/types";
export type { ImportAccount, ImportRepo, ImportView } from "@/lib/import/types";

export async function loadImportView(args: {
  userId: string;
  accountId?: string;
  query?: string;
  page?: number;
}): Promise<ImportView> {
  const query = (args.query ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(args.page ?? 1, 1000));
  const prisma = getPrisma();
  if (!prisma) {
    return {
      connected: false,
      accounts: [],
      selectedAccountId: null,
      repos: [],
      total: 0,
      page,
      query,
      hasNext: false,
      isFirstSite: false,
    };
  }

  const installations = await prisma.installation.findMany({
    where: installationVisibleWhere(args.userId),
    include: { _count: { select: { repos: { where: { removed: false } } } } },
    orderBy: [{ accountType: "asc" }, { accountLogin: "asc" }],
  });
  const accounts: ImportAccount[] = installations.map((row) => ({
    id: row.id,
    login: row.accountLogin,
    type: row.accountType,
    avatarUrl: row.accountAvatarUrl,
    repoCount: row._count.repos,
  }));
  const selected = accounts.find((row) => row.id === args.accountId) ?? accounts[0] ?? null;
  if (!selected) {
    return {
      connected: true,
      accounts,
      selectedAccountId: null,
      repos: [],
      total: 0,
      page,
      query,
      hasNext: false,
      isFirstSite: false,
    };
  }

  const where = {
    installationId: selected.id,
    removed: false,
    archived: false,
    ...(query
      ? {
          OR: [
            { fullName: { contains: query, mode: "insensitive" as const } },
            { name: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.repo.count({ where }),
    prisma.repo.findMany({
      where,
      include: { site: { select: { id: true } } },
      orderBy: [{ pushedAt: "desc" }, { fullName: "asc" }],
      skip: (page - 1) * IMPORT_PAGE_SIZE,
      take: IMPORT_PAGE_SIZE,
    }),
  ]);

  return {
    connected: true,
    accounts,
    selectedAccountId: selected.id,
    total,
    page,
    query,
    hasNext: page * IMPORT_PAGE_SIZE < total,
    isFirstSite: (await prisma.site.count({ where: { ownerId: args.userId } })) === 0,
    repos: rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      name: row.name,
      suggestedSubdomain:
        subdomainCandidates(row.owner, row.name, row.githubRepoId)[0] ?? "docs",
      private: row.private,
      pushedAt: row.pushedAt?.toISOString() ?? null,
      imported: Boolean(row.site),
      archived: row.archived,
    })),
  };
}
