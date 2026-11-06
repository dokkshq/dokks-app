import { GithubRateLimitError } from "@/lib/github/api-error";

export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export class TransientJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientJobError";
  }
}

export function classifyJobError(error: unknown): {
  message: string;
  permanent: boolean;
} {
  if (error instanceof PermanentJobError) {
    return { message: error.message, permanent: true };
  }
  if (error instanceof Error && error.name === "JobStoppedError") {
    return { message: "Stopped.", permanent: true };
  }
  if (error instanceof TransientJobError) {
    return { message: error.message, permanent: false };
  }
  const message = safeErrorMessage(error);
  if (error instanceof GithubRateLimitError) {
    return { message, permanent: false };
  }
  if (
    error instanceof Error &&
    (error.name === "ProviderNotConfiguredError" ||
      error.name === "GithubAppConfigError")
  ) {
    return { message, permanent: true };
  }
  if (/\b(400|401|403|404|422)\b/.test(message)) {
    return { message, permanent: true };
  }
  return { message, permanent: false };
}

export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "The job failed.";
  return raw.replace(/\s+/g, " ").trim().slice(0, 2_000) || "The job failed.";
}
