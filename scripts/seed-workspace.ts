import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { isLocalDatabaseUrl } from "../src/lib/db-guard";
import { MONTHLY_REFILL_CREDITS, usdFromCredits } from "../src/lib/credits/config";
import { sumCredits } from "../src/lib/credits/math";

const url = process.env.DATABASE_URL ?? "";
if (!isLocalDatabaseUrl(url)) {
  console.error("Refusing to run: DATABASE_URL must point at localhost or 127.0.0.1.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const gettingStarted = [
  "Set up Plugr in a new or existing project.",
  "",
  "Install Plugr with your package manager. Requires Node 16.",
  "",
  "```bash",
  "npm install plugr",
  "```",
  "",
  "Then add a config file at the root of your project and run your first command.",
  "",
  "```bash",
  "npx plugr init",
  "```",
].join("\n");

const gettingStartedDraft = [
  "Set up Plugr in a new or existing project.",
  "",
  "## Install",
  "",
  "Install Plugr with your package manager. Requires Node 18 or later.",
  "",
  "```bash",
  "npm install plugr",
  "```",
  "",
  "Then add a config file at the root of your project and run your first command.",
  "",
  "```bash",
  "npx plugr init",
  "```",
  "",
  "## Troubleshooting",
  "",
  "If the install fails, clear your package cache and run the command again.",
].join("\n");

async function main() {
  await prisma.creditEntry.deleteMany({ where: { userId: "dev_preview" } });
  await prisma.creditRequest.deleteMany({ where: { userId: "dev_preview" } });
  await prisma.installation.deleteMany({
    where: { OR: [{ userId: "dev_preview" }, { githubInstallationId: "9000001" }] },
  });
  await prisma.user.upsert({
    where: { id: "dev_preview" },
    update: { login: "dev", name: "Dev preview", role: "ADMIN", email: "dev@localhost" },
    create: {
      id: "dev_preview",
      login: "dev",
      name: "Dev preview",
      role: "ADMIN",
      email: "dev@localhost",
    },
  });

  const installation = await prisma.installation.create({
    data: {
      githubInstallationId: "9000001",
      accountLogin: "OpentipHQ",
      accountType: "Organization",
      userId: "dev_preview",
    },
  });
  await prisma.installationMember.create({
    data: { installationId: installation.id, userId: "dev_preview" },
  });

  const plugrRepo = await prisma.repo.create({
    data: {
      installationId: installation.id,
      githubRepoId: "8000001",
      owner: "OpentipHQ",
      name: "Plugr",
      fullName: "OpentipHQ/Plugr",
      defaultBranch: "main",
    },
  });
  const docsRepo = await prisma.repo.create({
    data: {
      installationId: installation.id,
      githubRepoId: "8000002",
      owner: "OpentipHQ",
      name: "opentip-docs",
      fullName: "OpentipHQ/opentip-docs",
      defaultBranch: "main",
    },
  });

  const plugr = await prisma.site.create({
    data: {
      repoId: plugrRepo.id,
      ownerId: "dev_preview",
      name: "Plugr",
      subdomain: "plugr",
      description: "Plugr",
      status: "ACTIVE",
      reviewMode: "AUTO_PUBLISH",
      theme: "LEDGER",
      appearance: "LIGHT",
      primaryColor: "#2A2AD6",
      tipButton: true,
      tipEth: true,
      tipUsdc: true,
      payoutWallet: "0x3f2a91c4",
    },
  });
  const docs = await prisma.site.create({
    data: {
      repoId: docsRepo.id,
      ownerId: "dev_preview",
      name: "opentip-docs",
      subdomain: "opentip-docs",
      status: "ACTIVE",
      theme: "MINIMAL",
      appearance: "LIGHT",
      primaryColor: "#2A2AD6",
    },
  });

  const home = await prisma.page.create({
    data: {
      siteId: plugr.id,
      slug: "",
      section: "Overview",
      title: "Introduction",
      description: "Plugr",
      navOrder: 0,
      published: true,
      content: "Plugr connects a repo to a docs site.",
    },
  });
  const started = await prisma.page.create({
    data: {
      siteId: plugr.id,
      slug: "getting-started",
      section: "Overview",
      title: "Getting started",
      description: "Set up Plugr in a new or existing project.",
      navOrder: 1,
      published: true,
      content: gettingStarted,
    },
  });
  await prisma.page.createMany({
    data: [
      { siteId: plugr.id, slug: "installation", section: "Guides", title: "Installation", navOrder: 2, published: true, content: "Install Plugr with npm." },
      { siteId: plugr.id, slug: "configuration", section: "Guides", title: "Configuration", navOrder: 3, published: true, content: "Add a config file at the project root." },
      { siteId: plugr.id, slug: "plugins", section: "Guides", title: "Plugins", navOrder: 4, published: true, content: "Plugins run in the order listed in the config file." },
      { siteId: plugr.id, slug: "cli-reference", section: "Guides", title: "CLI reference", navOrder: 5, published: true, content: "npx plugr init" },
      { siteId: plugr.id, slug: "faq", section: "FAQ", title: "FAQ", navOrder: 6, published: true, content: "Node 16 is the current requirement." },
      { siteId: plugr.id, slug: "changelog", section: "More", title: "Changelog", navOrder: 7, published: true, content: "Published notes for Plugr." },
      { siteId: docs.id, slug: "", section: "Overview", title: "opentip-docs", navOrder: 0, published: true, content: "Internal docs." },
    ],
  });

  const chatJob = await prisma.job.create({
    data: {
      repoId: plugrRepo.id,
      kind: "CHAT_EDIT",
      status: "SUCCEEDED",
      phase: "COMPLETE",
      progress: 100,
      provider: "XAI",
      model: "fake",
      idempotencyKey: "seed:chat:plugr",
      promptTokens: 1200,
      completionTokens: 400,
      estimatedCostUsd: 0.04,
      finishedAt: new Date("2026-10-29T12:41:00.000Z"),
      createdAt: new Date("2026-10-29T12:41:00.000Z"),
    },
  });
  await prisma.chatEdit.create({
    data: {
      siteId: plugr.id,
      pageId: started.id,
      userId: "dev_preview",
      instruction: "Bump the Node requirement to 18 everywhere and add a short troubleshooting section to Getting started.",
      jobId: chatJob.id,
      createdAt: new Date("2026-10-29T12:41:00.000Z"),
    },
  });
  await prisma.pageRevision.create({
    data: {
      siteId: plugr.id,
      pageId: started.id,
      jobId: chatJob.id,
      action: "UPSERT",
      status: "PENDING",
      source: "CHAT_EDIT",
      slug: "getting-started",
      section: "Overview",
      title: "Getting started",
      description: "Set up Plugr in a new or existing project.",
      content: gettingStartedDraft,
      navOrder: 1,
      changeNote: "Node 18 and a troubleshooting section.",
      createdAt: new Date("2026-10-29T12:41:00.000Z"),
    },
  });
  await prisma.job.create({
    data: {
      repoId: plugrRepo.id,
      kind: "FIRST_BUILD",
      status: "SUCCEEDED",
      phase: "COMPLETE",
      progress: 100,
      provider: "XAI",
      model: "fake",
      idempotencyKey: "seed:first:plugr",
      estimatedCostUsd: 0.91,
      finishedAt: new Date("2026-10-27T09:02:00.000Z"),
      createdAt: new Date("2026-10-27T09:02:00.000Z"),
    },
  });

  await prisma.worklogEntry.createMany({
    data: [
      {
        siteId: plugr.id,
        title: "Plugin hooks now run in order",
        body: "Hooks registered by plugins run in the order they are listed in the config file.",
        source: "manual",
        publishedAt: new Date("2026-10-29T11:02:00.000Z"),
      },
      {
        siteId: plugr.id,
        title: "New init command",
        body: "Run npx plugr init to create a starter config.",
        source: "manual",
        publishedAt: new Date("2026-10-20T09:00:00.000Z"),
      },
      {
        siteId: plugr.id,
        title: "First release of the docs",
        body: "Initial documentation for Plugr.",
        source: "manual",
        publishedAt: new Date("2026-10-02T09:00:00.000Z"),
      },
    ],
  });

  const spends: Array<{ amount: number; action: string; siteId: string; at: string }> = [
    { amount: -10, action: "Rebuild", siteId: plugr.id, at: "2026-10-02T10:00:00.000Z" },
    { amount: -8, action: "Chat edit", siteId: plugr.id, at: "2026-10-08T10:00:00.000Z" },
    { amount: -5, action: "Rebuild", siteId: plugr.id, at: "2026-10-15T10:00:00.000Z" },
    { amount: -18, action: "Rebuild", siteId: docs.id, at: "2026-10-18T10:00:00.000Z" },
    { amount: -7, action: "Chat edit", siteId: plugr.id, at: "2026-10-26T18:44:00.000Z" },
    { amount: -91, action: "First build", siteId: plugr.id, at: "2026-10-27T09:02:00.000Z" },
    { amount: -63, action: "Rebuild", siteId: plugr.id, at: "2026-10-28T16:20:00.000Z" },
    { amount: -2, action: "Changelog entry", siteId: plugr.id, at: "2026-10-29T11:02:00.000Z" },
    { amount: -4, action: "Chat edit", siteId: plugr.id, at: "2026-10-29T12:41:00.000Z" },
  ];
  const rows = [
    { amount: MONTHLY_REFILL_CREDITS, kind: "REFILL" as const, action: "Monthly refill", siteId: null, at: "2026-10-01T00:00:00.000Z", reason: null },
    { amount: 120, kind: "GRANT" as const, action: "Admin grant", siteId: null, at: "2026-10-27T09:15:00.000Z", reason: "Refund for a failed build" },
    ...spends.map((row) => ({ ...row, kind: "SPEND" as const, reason: null })),
  ];
  for (const row of rows) {
    await prisma.creditEntry.create({
      data: {
        userId: "dev_preview",
        amount: row.amount,
        kind: row.kind,
        action: row.action,
        reason: row.reason,
        siteId: row.siteId,
        createdAt: new Date(row.at),
      },
    });
  }
  const balance = sumCredits(rows);
  await prisma.user.update({
    where: { id: "dev_preview" },
    data: { creditBalance: balance, creditUsd: usdFromCredits(balance) },
  });
  if (balance !== 412) throw new Error(`expected balance 412, got ${balance}`);
  console.log(`seeded plugr ${plugr.subdomain} page ${home.id} balance ${balance}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
