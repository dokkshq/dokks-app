import { notFound } from "next/navigation";
import { saveWorkspaceAction } from "@/app/(product)/dashboard/w/[site]/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewSession } from "@/lib/admin/act-as";
import { loadWorkspace } from "@/lib/workspace/load";

export const dynamic = "force-dynamic";

export default async function MoneySection({ params }: { params: Promise<{ site: string }> }) {
  const session = await getViewSession();
  if (!session) return null;
  const site = await loadWorkspace(session, (await params).site);
  if (!site) notFound();
  return (
    <div className="flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-2xl">Money</h1>
      <form action={saveWorkspaceAction} className="flex flex-col gap-4 rounded-control border border-border p-4">
        <input type="hidden" name="kind" value="money" />
        <input type="hidden" name="siteId" value={site.id} />
        <input type="hidden" name="subdomain" value={site.subdomain} />
        <input type="hidden" name="section" value="/money" />
        <label className="flex items-center justify-between text-sm">
          Tip button
          <Checkbox name="tipButton" defaultChecked={site.tipButton} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-control border border-border px-3 py-2 text-sm">
            ETH
            <Checkbox name="tipEth" defaultChecked={site.tipEth} />
          </label>
          <label className="flex items-center justify-between rounded-control border border-border px-3 py-2 text-sm">
            USDC
            <Checkbox name="tipUsdc" defaultChecked={site.tipUsdc} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Payout wallet
          <Input name="payoutWallet" defaultValue={site.payoutWallet ?? ""} />
        </label>
        <SubmitButton className="w-fit">Save</SubmitButton>
      </form>
      <section className="rounded-control border border-border p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm">Recent tips</p>
          <p className="text-xs text-muted-foreground">0 this month</p>
        </div>
        <p className="py-8 text-center text-sm text-muted-foreground">None</p>
      </section>
    </div>
  );
}
