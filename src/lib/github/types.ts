import type { RepoSeed } from "@/lib/github/install";

export type GithubWebhookHeaders = {
  deliveryId: string | null;
  event: string | null;
  signature: string | null;
};

export type NewJob = {
  repoId: string;
  githubRepoId: string;
  kind: "FIRST_BUILD" | "PUSH_UPDATE" | "CHAT_EDIT";
  provider: "XAI" | "FAKE";
  model: string;
  idempotencyKey: string;
  deliveryId: string;
  payload: Record<string, unknown>;
};

export type KnownRepo = {
  id: string;
  githubRepoId: string;
  fullName: string;
  owner: string;
  name: string;
  installationGithubId: string;
  defaultBranch?: string;
  siteStatus?: "PENDING" | "ACTIVE" | "PAUSED" | null;
};

export interface WebhookRepository {
  claimDelivery(input: {
    id: string;
    event: string;
    action: string | null;
  }): Promise<boolean>;
  finishDelivery(id: string, jobId: string | null): Promise<void>;
  releaseDelivery(id: string): Promise<void>;
  findRepoByGithubId(githubRepoId: string): Promise<KnownRepo | null>;
  enqueueJob(job: NewJob): Promise<{ id: string; created: boolean }>;
  pauseInstallation(
    githubInstallationId: string,
    reason: string,
  ): Promise<number>;
  pauseRepos(githubRepoIds: string[], reason: string): Promise<number>;
  resumeInstallation(githubInstallationId: string, reasons: string[]): Promise<number>;
  resumeRepos(githubRepoIds: string[], reasons: string[]): Promise<number>;
  addRepos(githubInstallationId: string, repos: RepoSeed[]): Promise<number>;
  recordError(input: {
    deliveryId: string;
    event: string;
    action: string | null;
    message: string;
  }): Promise<void>;
  upsertInstallation(input: {
    githubInstallationId: string;
    accountLogin: string;
    accountType: string;
  }): Promise<void>;
  applyRepositoryChange(input: {
    githubRepoId: string;
    action: string;
    owner?: string;
    name?: string;
    fullName?: string;
  }): Promise<number>;
}

export type WebhookBody =
  | { ok: false; error: string }
  | {
      ok: true;
      duplicate: boolean;
      event?: string;
      jobId?: string | null;
      paused?: number;
      resumed?: number;
      ignored?: boolean;
    };

export type WebhookResult = { status: number; body: WebhookBody };
