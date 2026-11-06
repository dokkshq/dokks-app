import { notFound } from "next/navigation";
import { saveWorkspaceAction } from "@/app/(product)/dashboard/w/[site]/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewSession } from "@/lib/admin/act-as";
import { productName } from "@/lib/brand";
import { docsRootDomain } from "@/lib/config";
import { loadWorkspace } from "@/lib/workspace/load";

export const dynamic = "force-dynamic";

const field = "h-9 flex-1 rounded-control border border-border bg-background px-3 text-sm";

export default async function DomainSection({ params }: { params: Promise<{ site: string }> }) {
  const session = await getViewSession();
  if (!session) return null;
  const site = await loadWorkspace(session, (await params).site);
  if (!site) notFound();
  return (
    <div className="flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-2xl">Domain</h1>
      <form action={saveWorkspaceAction} className="flex flex-col gap-4 rounded-control border border-border p-4">
        <input type="hidden" name="kind" value="domain" />
        <input type="hidden" name="siteId" value={site.id} />
        <input type="hidden" name="subdomain" value={site.subdomain} />
        <input type="hidden" name="section" value="/domain" />
        <div className="flex items-center justify-between">
          <p className="text-sm">{productName()} subdomain</p>
          <span className="text-xs text-emerald-500">Active</span>
        </div>
        <div className="flex gap-2">
          <input name="nextSubdomain" defaultValue={site.subdomain} className={field} />
          <span className="flex items-center text-sm text-muted-foreground">.{docsRootDomain()}</span>
          <SubmitButton variant="outline">Change</SubmitButton>
        </div>
        <p className="text-sm">Custom domain</p>
        <div className="flex gap-2">
          <input name="customDomain" defaultValue={site.customDomain ?? ""} placeholder="docs.example.com" className={field} />
        </div>
        <p className="text-sm text-muted-foreground">{site.customDomainStatus ?? "Not checked"}</p>
      </form>
    </div>
  );
}
