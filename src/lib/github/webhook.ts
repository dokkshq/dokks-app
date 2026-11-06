import { verifyGithubSignature } from "@/lib/github/signature";
import type {
  GithubWebhookHeaders,
  WebhookRepository,
  WebhookResult,
} from "@/lib/github/types";
import { DEFAULT_SMALL_MODEL } from "@/lib/copilot/models";
import { repoSeedFromApi } from "@/lib/github/install";

type Payload = {
  action?: string;
  zen?: string;
  ref?: string;
  before?: string;
  after?: string;
  installation?: {
    id?: number | string;
    account?: { login?: string; type?: string };
  };
  repository?: {
    id?: number | string;
    name?: string;
    full_name?: string;
    private?: boolean;
    owner?: { login?: string };
  };
  repositories_removed?: Array<{ id?: number | string }>;
  repositories_added?: unknown[];
};

function idOf(value: number | string | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

export async function handleGithubWebhook(args: {
  rawBody: string;
  headers: GithubWebhookHeaders;
  secret: string;
  repo: WebhookRepository;
}): Promise<WebhookResult> {
  if (!verifyGithubSignature(args.rawBody, args.headers.signature, args.secret)) {
    return { status: 401, body: { ok: false, error: "invalid_signature" } };
  }
  if (!args.headers.deliveryId || !args.headers.event) {
    return { status: 400, body: { ok: false, error: "missing_headers" } };
  }

  let payload: Payload;
  try {
    payload = JSON.parse(args.rawBody) as Payload;
  } catch {
    return { status: 400, body: { ok: false, error: "invalid_json" } };
  }

  const action = typeof payload.action === "string" ? payload.action : null;
  const claimed = await args.repo.claimDelivery({
    id: args.headers.deliveryId,
    event: args.headers.event,
    action,
  });
  if (!claimed) {
    return {
      status: 200,
      body: { ok: true, duplicate: true, event: args.headers.event },
    };
  }

  try {
    const outcome = await applyEvent({
      event: args.headers.event,
      action,
      deliveryId: args.headers.deliveryId,
      payload,
      repo: args.repo,
    });
    await args.repo.finishDelivery(args.headers.deliveryId, outcome.jobId ?? null);
    return {
      status: 200,
      body: {
        ok: true,
        duplicate: false,
        event: args.headers.event,
        ...outcome,
      },
    };
  } catch (error) {
    await args.repo.releaseDelivery(args.headers.deliveryId);
    try {
      await args.repo.recordError({
        deliveryId: args.headers.deliveryId,
        event: args.headers.event,
        action,
        message: error instanceof Error ? error.message.slice(0, 2000) : "unknown",
      });
    } catch {
      // Logging must not mask the original webhook failure.
    }
    return { status: 500, body: { ok: false, error: "processing_failed" } };
  }
}

async function applyEvent(args: {
  event: string;
  action: string | null;
  deliveryId: string;
  payload: Payload;
  repo: WebhookRepository;
}): Promise<{ jobId?: string | null; paused?: number; resumed?: number; ignored?: boolean }> {
  if (args.event === "ping") return { ignored: true };

  if (args.event === "installation" && args.payload.installation) {
    const installationId = idOf(args.payload.installation.id);
    if (!installationId) return { ignored: true };
    if (args.action === "deleted") {
      const paused = await args.repo.pauseInstallation(
        installationId,
        "github_app_uninstalled",
      );
      return { paused };
    }
    if (args.action === "suspend") {
      const paused = await args.repo.pauseInstallation(
        installationId,
        "github_app_suspended",
      );
      return { paused };
    }
    if (args.action === "created" || args.action === "unsuspend") {
      await args.repo.upsertInstallation({
        githubInstallationId: installationId,
        accountLogin: args.payload.installation.account?.login ?? "unknown",
        accountType: args.payload.installation.account?.type ?? "User",
      });
      const reasons =
        args.action === "unsuspend" ? ["github_app_suspended"] : ["github_app_uninstalled"];
      const resumed = await args.repo.resumeInstallation(installationId, reasons);
      return resumed > 0 ? { resumed } : { ignored: true };
    }
    return { ignored: true };
  }

  if (args.event === "installation_repositories") {
    const installationId = idOf(args.payload.installation?.id);
    if (args.action === "removed") {
      const ids = (args.payload.repositories_removed ?? [])
        .map((repo) => idOf(repo.id))
        .filter((id): id is string => Boolean(id));
      const paused = await args.repo.pauseRepos(ids, "repo_removed");
      return { paused };
    }
    if (args.action === "added" && installationId) {
      const repos = (args.payload.repositories_added ?? [])
        .map((repo) => repoSeedFromApi(repo))
        .filter((repo) => repo !== null);
      await args.repo.addRepos(installationId, repos);
      const resumed = await args.repo.resumeRepos(
        repos.map((repo) => repo.githubRepoId),
        ["repo_removed", "repo_deleted"],
      );
      return { resumed, ignored: resumed === 0 };
    }
  }

  if (args.event === "push") {
    const githubRepoId = idOf(args.payload.repository?.id);
    const after = args.payload.after;
    if (!githubRepoId || !after || after === "0000000000000000000000000000000000000000") {
      return { ignored: true };
    }
    const ref = args.payload.ref;
    if (ref && !ref.startsWith("refs/heads/")) {
      return { ignored: true };
    }
    const known = await args.repo.findRepoByGithubId(githubRepoId);
    if (!known) return { ignored: true };
    if (!known.siteStatus || known.siteStatus === "PAUSED") {
      return { ignored: true };
    }
    const branch = ref ? ref.slice("refs/heads/".length) : (known.defaultBranch ?? "main");
    if (branch !== (known.defaultBranch ?? "main")) {
      return { ignored: true };
    }
    const job = await args.repo.enqueueJob({
      repoId: known.id,
      githubRepoId,
      kind: "PUSH_UPDATE",
      provider: "XAI",
      model: DEFAULT_SMALL_MODEL,
      idempotencyKey: `push:${githubRepoId}:${after}`,
      deliveryId: args.deliveryId,
      payload: {
        ref: args.payload.ref ?? null,
        before: args.payload.before ?? null,
        after,
        fullName: known.fullName,
      },
    });
    return { jobId: job.id, ignored: !job.created };
  }

  if (args.event === "repository") {
    const githubRepoId = idOf(args.payload.repository?.id);
    if (!githubRepoId || !args.action) return { ignored: true };
    const fullName = args.payload.repository?.full_name;
    const owner = fullName?.split("/")[0] ?? args.payload.repository?.owner?.login;
    const paused = await args.repo.applyRepositoryChange({
      githubRepoId,
      action: args.action,
      owner,
      name: args.payload.repository?.name,
      fullName,
    });
    return { paused, ignored: paused === 0 && args.action === "renamed" };
  }

  return { ignored: true };
}
