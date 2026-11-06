"use client";

import { ArrowUp, GitBranch, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { WorkspaceImportDialog } from "@/components/workspace/import-dialog";
import { sendChatEditAction } from "@/app/(product)/dashboard/sites/[id]/actions";
import { PlanApproval } from "@/components/workspace/plan-approval";
import { discardDraftAction, publishDraftAction, retryBuildAction } from "@/app/(product)/dashboard/w/[site]/actions";
import type { ImportView } from "@/lib/import/types";
import type { WorkspaceJob, WorkspaceJobEvent } from "@/lib/workspace/jobs";
import { useWorkspaceChrome } from "@/components/workspace/shell";
import { cn } from "cn";

type PageOption = { id: string; slug: string; title: string; pending: boolean };

export function PreviewChat({
  siteId,
  subdomain,
  host,
  pages,
  pendingCount,
  chats,
  running,
  hasRepo,
  repoFullName,
  activeJob,
  jobs,
  importView,
  importOpen = false,
  docsRoot,
  installUrl,
}: {
  siteId: string;
  subdomain: string;
  host: string;
  pages: PageOption[];
  pendingCount: number;
  chats: Array<{ id: string; instruction: string; createdAt: string; status: string | null; error: string | null }>;
  running: boolean;
  hasRepo: boolean;
  repoFullName: string;
  activeJob: WorkspaceJob | null;
  jobs: WorkspaceJob[];
  importView: ImportView | null;
  importOpen?: boolean;
  docsRoot: string;
  installUrl: string;
}) {
  const [panel, setPanel] = useState<"preview" | "chat">("chat");
  const [slug, setSlug] = useState(pages.find((page) => page.pending)?.slug ?? pages[0]?.slug ?? "");
  const page = pages.find((item) => item.slug === slug) ?? pages[0];
  const path = slug ? `/${slug}` : "/";
  const src = `/preview/${subdomain}${slug ? `/${slug}` : ""}`;
  const back = `/dashboard/w/${subdomain}`;
  const router = useRouter();
  const threadRef = useRef<HTMLDivElement>(null);
  const [liveJobs, setLiveJobs] = useState(jobs);
  const [liveRunning, setLiveRunning] = useState(running);
  const jobRunning =
    liveRunning || liveJobs.some((job) => job.status === "QUEUED" || job.status === "RUNNING");
  const waitingPlan = liveJobs.find((job) => job.status === "WAITING" && job.plan);
  const shownJob = liveJobs.find((job) => job.status === "QUEUED" || job.status === "RUNNING")
    ?? liveJobs.find((job) => job.status === "FAILED")
    ?? waitingPlan
    ?? activeJob;
  const showGenerating = hasRepo && pages.length === 0 && (jobRunning || shownJob?.status === "FAILED");
  const canChat = hasRepo;
  const chrome = useWorkspaceChrome();

  useEffect(() => {
    setLiveJobs(jobs);
    setLiveRunning(running);
  }, [jobs, running]);

  useEffect(() => {
    if (!hasRepo || !liveRunning) return;
    let stopped = false;
    const tick = async () => {
      const response = await fetch(`/api/workspaces/${subdomain}/activity`, { cache: "no-store" });
      if (!response.ok || stopped) return;
      const body = (await response.json()) as { jobs?: WorkspaceJob[] };
      if (!body.jobs || stopped) return;
      const active = body.jobs.some((job) => job.status === "QUEUED" || job.status === "RUNNING");
      setLiveJobs(body.jobs);
      setLiveRunning(active);
      if (!active) router.refresh();
    };
    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [hasRepo, liveRunning, router, subdomain]);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [liveJobs, chats]);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="flex gap-2 border-b border-border p-2 md:hidden">
        {(["preview", "chat"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setPanel(item)}
            className={cn(
              "flex-1 rounded-control border px-3 py-2 text-sm",
              panel === item ? "border-meter text-link" : "border-border text-muted-foreground",
            )}
          >
            {item === "preview" ? "Preview" : "Chat"}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 md:gap-3">
        <section
          className={cn(
            "min-w-0 flex-1 flex-col bg-background md:overflow-hidden md:rounded-2xl md:border md:border-border",
            panel === "chat" ? "hidden md:flex" : "flex",
          )}
        >
          <div className="hidden md:block">{chrome}</div>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:border-0">
            {pages.length > 0 ? (
              <SelectField
                value={page?.slug ?? ""}
                onValueChange={setSlug}
                aria-label="Page"
                className="w-auto max-w-48"
                options={pages.map((item) => ({ value: item.slug, label: item.title }))}
              />
            ) : (
              <span className="text-sm text-muted-foreground">No pages yet</span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {host}
              {pages.length > 0 ? path : ""}
            </span>
            {pendingCount > 0 ? (
              <span className="rounded-control border border-meter px-2 py-0.5 text-xs text-link">Draft preview</span>
            ) : (
              <span className="rounded-control border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {showGenerating ? "Building" : "Live"}
              </span>
            )}
          </div>
          {!hasRepo ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm">This workspace has no repository yet.</p>
              <p className="text-sm text-muted-foreground">Import a GitHub repo to start the first docs build.</p>
              {importView ? (
                <WorkspaceImportDialog
                  siteId={siteId}
                  subdomain={subdomain}
                  docsRoot={docsRoot}
                  installUrl={installUrl}
                  view={importView}
                  defaultOpen={importOpen}
                />
              ) : null}
            </div>
          ) : showGenerating ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-sm">
                {shownJob?.status === "FAILED" ? "Build failed" : "Generating docs…"}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {shownJob?.status === "FAILED"
                  ? "The reason is in the chat, at the step that failed."
                  : shownJob?.detail || shownJob?.events.at(-1)?.message || "Waiting for the worker."}
              </p>
            </div>
          ) : (
            <iframe title="Docs preview" src={src} className="min-h-0 w-full flex-1 bg-white" />
          )}
        </section>
        <aside
          className={cn(
            "w-full flex-col bg-background md:flex md:w-80 md:overflow-hidden md:rounded-2xl md:border md:border-border",
            panel === "preview" ? "hidden" : "flex",
          )}
        >
          <div ref={threadRef} className="flex flex-1 flex-col gap-3 overflow-auto p-4">
            {!hasRepo ? (
              <p className="text-sm text-muted-foreground">
                Import a repository to start the first build. Progress will show here.
              </p>
            ) : null}

            <AgentTranscript
              jobs={liveJobs}
              chats={chats}
              running={jobRunning}
              repoFullName={hasRepo ? repoFullName : null}
              failedJob={shownJob?.status === "FAILED" ? shownJob : null}
              siteId={siteId}
              subdomain={subdomain}
              back={back}
            />

            {waitingPlan?.plan ? (
              <PlanApproval
                siteId={siteId}
                subdomain={subdomain}
                jobId={waitingPlan.id}
                plan={waitingPlan.plan}
              />
            ) : null}
            {pendingCount > 0 ? (
              <div className="mt-auto flex flex-col gap-3 rounded-control border border-border p-3">
                <p className="text-sm">
                  <span className="mr-2 inline-block size-1.5 rounded-full bg-live" />
                  Draft ready
                </p>
                <div className="flex justify-end gap-2">
                  <form action={discardDraftAction}>
                    <input type="hidden" name="siteId" value={siteId} />
                    <input type="hidden" name="subdomain" value={subdomain} />
                    <SubmitButton variant="outline" size="sm">
                      Discard
                    </SubmitButton>
                  </form>
                  <form action={publishDraftAction}>
                    <input type="hidden" name="siteId" value={siteId} />
                    <input type="hidden" name="subdomain" value={subdomain} />
                    <SubmitButton size="sm">Publish changes</SubmitButton>
                  </form>
                </div>
              </div>
            ) : null}
          </div>
          {canChat && !waitingPlan ? (
            <form action={sendChatEditAction} className="p-3">
              <input type="hidden" name="siteId" value={siteId} />
              <input type="hidden" name="returnTo" value={back} />
              <input type="hidden" name="pageId" value={page?.id ?? ""} />
              <label className="flex flex-col gap-2 rounded-2xl border border-border px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
                <span className="sr-only">Edit</span>
                <textarea
                  name="instruction"
                  required
                  rows={3}
                  placeholder="Ask a question or request a change"
                  className="w-full resize-none bg-transparent text-sm outline-none"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {page ? `@ ${page.title}` : "@ docs"}
                  </span>
                  <Button type="submit" size="icon-sm" aria-label={jobRunning ? "Working" : "Send"}>
                    {jobRunning ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
                  </Button>
                </div>
              </label>
            </form>
          ) : (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              Import a repository to talk to the agent.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function AgentTranscript({
  jobs,
  chats,
  running,
  repoFullName,
  failedJob,
  siteId,
  subdomain,
  back,
}: {
  jobs: WorkspaceJob[];
  chats: Array<{ id: string; instruction: string; createdAt: string; status: string | null; error: string | null }>;
  running: boolean;
  repoFullName: string | null;
  failedJob: WorkspaceJob | null;
  siteId: string;
  subdomain: string;
  back: string;
}) {
  const visibleJobs = jobs.slice(0, 8);
  const items: Array<
    | { at: string; kind: "you"; id: string; text: string; error: string | null }
    | { at: string; kind: "import"; id: string; repo: string }
    | { at: string; kind: "turn"; id: string; job: WorkspaceJob }
  > = visibleJobs.map((job) => ({
    at: job.events[0]?.createdAt ?? job.createdAt,
    kind: "turn" as const,
    id: job.id,
    job,
  }));
  if (repoFullName) {
    items.push({
      at: "1970-01-01T00:00:00.000Z",
      kind: "import",
      id: "import-repo",
      repo: repoFullName,
    });
  }
  for (const chat of chats) {
    items.push({
      at: chat.createdAt,
      kind: "you",
      id: chat.id,
      text: chat.instruction,
      error: chat.error,
    });
  }
  items.sort((a, b) => a.at.localeCompare(b.at));
  if (items.length === 0 && !running) return null;
  return (
    <div className="flex flex-col gap-3">
      {running && items.length === 0 ? <p className="text-sm text-muted-foreground">Waiting for the worker…</p> : null}
      {items.map((item) =>
        item.kind === "you" ? (
          <div key={item.id} className="flex flex-col gap-1">
            <div className="rounded-2xl bg-muted px-3 py-2 text-sm">{item.text}</div>
          </div>
        ) : item.kind === "import" ? (
          <ImportMessage key={item.id} repo={item.repo} />
        ) : (
          <AgentTurn key={item.id} job={item.job} live={running && (item.job.status === "QUEUED" || item.job.status === "RUNNING")} />
        ),
      )}
      {failedJob ? (
        <form action={retryBuildAction}>
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="subdomain" value={subdomain} />
          <input type="hidden" name="jobId" value={failedJob.id} />
          <input type="hidden" name="returnTo" value={back} />
          <SubmitButton size="sm" variant="outline">
            Retry build
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function ImportMessage({ repo }: { repo: string }) {
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[90%] flex-col gap-2 rounded-2xl bg-muted px-3 py-2 text-sm">
        <p>Build the docs for this repository.</p>
        <span className="flex items-center gap-2 rounded-control border border-border bg-background px-2 py-1.5 text-xs">
          <GitBranch className="size-3.5 shrink-0" />
          <span className="truncate">{repo}</span>
        </span>
      </div>
    </div>
  );
}

function AgentTurn({ job, live }: { job: WorkspaceJob; live: boolean }) {
  const failed = job.status === "FAILED";
  const [open, setOpen] = useState(live || failed);
  const start = Date.parse(job.events[0]?.createdAt ?? job.createdAt);
  const end = Date.parse(job.finishedAt ?? job.events.at(-1)?.createdAt ?? job.createdAt);
  const label = live ? "Working…" : failed ? "Failed" : `Worked for ${formatDuration(end - start)}`;
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => setOpen((value) => !value)} className="text-left text-sm text-muted-foreground">
        {open ? "▾" : "▸"} {label}
      </button>
      {open
        ? job.events.map((event) => <AgentStep key={event.id} event={event} live={live} />)
        : null}
    </div>
  );
}

function AgentStep({ event, live }: { event: WorkspaceJobEvent; live: boolean }) {
  const [open, setOpen] = useState(live && event.role === "thought");
  if (event.level === "error") {
    return <p className="text-sm text-destructive">{event.message}</p>;
  }
  if (event.role === "say" || event.role === "reply") {
    return <p className="text-sm">{event.message}</p>;
  }
  if (event.role === "action" || event.role === "note") {
    return <p className="text-sm text-muted-foreground">{event.message}</p>;
  }
  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="text-left text-sm text-muted-foreground">
        {open ? "▾" : "▸"} {event.message}
      </button>
      {open && event.body ? <p className="mt-1 pl-4 text-sm text-muted-foreground">{event.body}</p> : null}
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(Math.abs(ms) / 1000));
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds % 60}s`;
}
