export type WorkspaceJobEvent = {
  id: string;
  sequence: number;
  level: string;
  message: string;
  createdAt: string;
  role?: "thought" | "say" | "action" | "reply" | "note";
  body?: string | null;
  explored?: number;
  searches?: number;
  edited?: number;
};

export type WorkspaceJob = {
  id: string;
  kind: string;
  status: string;
  phase: string;
  progress: number;
  detail: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  events: WorkspaceJobEvent[];
};

export function jobFailureReason(job: Pick<WorkspaceJob, "error" | "detail" | "events">): string {
  if (job.error?.trim()) return job.error.trim();
  const eventError = [...job.events].reverse().find((event) => event.level === "error")?.message?.trim();
  if (eventError) return eventError;
  if (job.detail?.trim()) return job.detail.trim();
  return "Build failed with no recorded message.";
}
