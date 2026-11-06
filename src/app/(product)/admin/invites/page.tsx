import { PageHeader } from "@/components/shell/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getPrisma } from "@/lib/db";
import { createBetaInvite } from "./actions";

export const dynamic = "force-dynamic";

export default async function InvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; saved?: string; error?: string; wave?: string }>;
}) {
  const params = await searchParams;
  const prisma = getPrisma();
  const [invites, waves] = prisma
    ? await Promise.all([
        prisma.betaInvite.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
        prisma.betaInvite.groupBy({
          by: ["wave"],
          _count: true,
          orderBy: { wave: "desc" },
          take: 20,
        }),
      ])
    : [[], []];
  const note = params.error
    ? params.error === "limit"
      ? "Send at most 50 emails per wave."
      : "Add at least one valid email."
    : params.saved
      ? `${params.saved} invites saved. ${params.sent ?? "0"} emails sent.`
      : null;
  return (
    <>
      <PageHeader
        title="Invites and waves"
        description="Paste up to 50 emails, one per line or comma separated. Each person gets beta access and an invite email."
      />
      <Card>
        <CardHeader>
          <CardTitle>New wave</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createBetaInvite} className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="emails">Emails</FieldLabel>
                <textarea
                  id="emails"
                  name="emails"
                  required
                  rows={5}
                  placeholder="one@example.com&#10;two@example.com"
                  className="w-full rounded-control border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="wave">Wave</FieldLabel>
                <Input id="wave" name="wave" type="text" inputMode="numeric" defaultValue={String(params.wave ?? 1)} />
              </Field>
            </FieldGroup>
            <SubmitButton className="w-fit" loadingText="Sending...">
              Send wave
            </SubmitButton>
          </form>
          {note ? <p className="mt-4 text-sm text-muted-foreground">{note}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {waves.map((wave) => (
          <Card key={wave.wave}>
            <CardHeader>
              <CardTitle>Wave {wave.wave}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl tracking-tight">{wave._count}</p>
              <p className="text-xs text-muted-foreground">invites</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="py-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Email</th>
              <th className="p-3">Wave</th>
              <th className="p-3">Sent</th>
              <th className="p-3">Accepted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invites.map((row) => (
              <tr key={row.id}>
                <td className="p-3">{row.email}</td>
                <td className="p-3">{row.wave}</td>
                <td className="p-3">{row.sentAt ? row.sentAt.toISOString().slice(0, 10) : "Not sent"}</td>
                <td className="p-3">{row.acceptedAt ? row.acceptedAt.toISOString().slice(0, 10) : "Waiting"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
