import { notFound } from "next/navigation";
import { deleteWorkspaceAction, saveWorkspaceAction } from "@/app/(product)/dashboard/w/[site]/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewSession } from "@/lib/admin/act-as";
import { loadWorkspace } from "@/lib/workspace/load";

export const dynamic = "force-dynamic";

export default async function SettingsSection({ params }: { params: Promise<{ site: string }> }) {
  const session = await getViewSession();
  if (!session) return null;
  const site = await loadWorkspace(session, (await params).site);
  if (!site) notFound();
  return (
    <div className="flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-2xl">Settings</h1>
      <form action={saveWorkspaceAction} className="flex flex-col gap-4 rounded-control border border-border p-4">
        <input type="hidden" name="kind" value="settings" />
        <input type="hidden" name="siteId" value={site.id} />
        <input type="hidden" name="subdomain" value={site.subdomain} />
        <input type="hidden" name="section" value="/settings" />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">Visibility</p>
          <RadioGroup name="privateSite" defaultValue={site.privateSite ? "on" : "off"} className="flex gap-3 text-sm">
            <label className="flex items-center gap-2">
              <Radio value="off" />
              Public
            </label>
            <label className="flex items-center gap-2">
              <Radio value="on" />
              Private
            </label>
          </RadioGroup>
        </div>
        <label className="flex items-center justify-between text-sm">
          Hide previews from search
          <Checkbox name="previewNoindex" defaultChecked={site.previewNoindex} />
        </label>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">Publishing</p>
          <RadioGroup name="reviewMode" defaultValue={site.reviewMode} className="flex gap-3 text-sm">
            <label className="flex items-center gap-2">
              <Radio value="AUTO_PUBLISH" />
              Auto-publish
            </label>
            <label className="flex items-center gap-2">
              <Radio value="REVIEW" />
              Review first
            </label>
          </RadioGroup>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>Repository</span>
          <span className="text-muted-foreground">Watching {site.branch}</span>
        </div>
        <SubmitButton className="w-fit">Save</SubmitButton>
      </form>
      <form action={saveWorkspaceAction} className="flex items-center justify-between rounded-control border border-destructive/40 p-4">
        <input type="hidden" name="kind" value="pause" />
        <input type="hidden" name="siteId" value={site.id} />
        <input type="hidden" name="subdomain" value={site.subdomain} />
        <input type="hidden" name="section" value="/settings" />
        <p className="text-sm">Pause site</p>
        <SubmitButton variant="outline" size="sm">
          {site.status === "PAUSED" ? "Resume" : "Pause"}
        </SubmitButton>
      </form>
      <form action={deleteWorkspaceAction} className="flex flex-col gap-3 rounded-control border border-destructive/40 p-4">
        <input type="hidden" name="siteId" value={site.id} />
        <input type="hidden" name="subdomain" value={site.subdomain} />
        <div className="flex items-center justify-between">
          <p className="text-sm">Delete workspace</p>
        </div>
        <input name="confirm" placeholder={site.name} className="h-9 rounded-control border border-border bg-background px-3 text-sm" />
        <SubmitButton variant="destructive" className="w-fit">
          Delete
        </SubmitButton>
      </form>
    </div>
  );
}
