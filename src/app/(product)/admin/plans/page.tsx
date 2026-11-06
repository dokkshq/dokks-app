import { PageHeader } from "@/components/shell/page-header";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPrisma } from "@/lib/db";
import { loadPlans } from "@/lib/view-data";
import { addCredits, changeUserPlan } from "./actions";

export const dynamic = "force-dynamic";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const plans = await loadPlans();
  const prisma = getPrisma();
  const [users, subscriptions, dbPlans] = prisma
    ? await Promise.all([
        prisma.user.findMany({ orderBy: { login: "asc" }, take: 100 }),
        prisma.subscription.findMany({
          include: { plan: true, user: { select: { login: true } } },
          orderBy: { updatedAt: "desc" },
          take: 50,
        }),
        prisma.plan.findMany({ orderBy: { priceCents: "asc" } }),
      ])
    : [[], [], []];
  return (
    <>
      <PageHeader
        title="Plans and limits"
        description="Stored plan prices, user plans, and manual credit adjustments. This is not an invoice."
      />
      {params.saved === "plan" ? <p className="text-sm text-muted-foreground">Plan updated.</p> : null}
      {params.saved === "credits" ? <p className="text-sm text-muted-foreground">Credits updated.</p> : null}
      {params.error ? <p className="text-sm text-destructive">That change failed. Check the user and amount.</p> : null}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan</TableHead>
              <TableHead>USD / month</TableHead>
              <TableHead>Custom domain</TableHead>
              <TableHead>Repo daily cap USD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => (
              <TableRow key={plan.tier}>
                <TableCell>{plan.name}</TableCell>
                <TableCell>{(plan.priceCents / 100).toFixed(0)}</TableCell>
                <TableCell>{plan.customDomain ? "Yes" : "No"}</TableCell>
                <TableCell>{plan.dailyRepoCapUsd.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Change a user plan</CardTitle>
          </CardHeader>
          <CardContent>
            {dbPlans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No plan rows exist yet. Seed the Plan table before changing a subscription.
              </p>
            ) : (
              <form action={changeUserPlan} className="flex flex-col gap-3">
                <SelectField
                  name="userId"
                  required
                  placeholder="Choose a user"
                  options={users.map((user) => ({
                    value: user.id,
                    label: user.email ? `${user.login} (${user.email})` : user.login,
                  }))}
                />
                <SelectField
                  name="planId"
                  required
                  placeholder="Choose a plan"
                  options={dbPlans.map((plan) => ({ value: plan.id, label: plan.name }))}
                />
                <SubmitButton className="w-fit" loadingText="Saving...">
                  Save plan
                </SubmitButton>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Credits</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addCredits} className="flex flex-col gap-3">
              <SelectField
                name="userId"
                required
                placeholder="User"
                options={users.map((user) => ({
                  value: user.id,
                  label: `${user.login} (${user.creditBalance})`,
                }))}
              />
              <Input name="amount" type="text" inputMode="numeric" required placeholder="Credits" />
              <Input name="reason" required placeholder="Reason" />
              <div className="flex gap-2">
                <SubmitButton name="mode" value="grant" className="w-fit" loadingText="Granting...">
                  Grant
                </SubmitButton>
                <SubmitButton name="mode" value="remove" variant="outline" className="w-fit" loadingText="Removing...">
                  Remove
                </SubmitButton>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subscriptions.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.user.login}</TableCell>
                <TableCell>{row.plan.name}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>{row.updatedAt.toISOString().slice(0, 10)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
