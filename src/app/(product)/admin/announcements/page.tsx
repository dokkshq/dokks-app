import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPrisma } from "@/lib/db";
import { createAnnouncement, resendAnnouncement, toggleAnnouncement } from "./actions";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const prisma = getPrisma();
  const announcements = prisma
    ? await prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
    : [];
  return (
    <>
      <PageHeader
        title="Announcements"
        description="An active announcement shows as a banner to signed-in beta users. Email is optional and respects unsubscribes."
      />
      {params.saved ? (
        <p className="text-sm text-muted-foreground">
          Saved. {params.sent ? `${params.sent} emails sent.` : "No email was sent."}
        </p>
      ) : null}
      {params.error ? <p className="text-sm text-destructive">The announcement could not be saved.</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>New announcement</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAnnouncement} className="flex flex-col gap-3">
            <input
              name="title"
              required
              maxLength={120}
              placeholder="Title"
              className="h-9 rounded-control border border-border bg-background px-4 text-sm"
            />
            <textarea
              name="body"
              required
              rows={5}
              maxLength={4000}
              placeholder="Body"
              className="rounded-control border border-border bg-background px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="active" defaultChecked />
              Show as an in-app banner
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="email" />
              Email beta users who have not unsubscribed
            </label>
            <SubmitButton className="w-fit" loadingText="Publishing...">
              Publish
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      {announcements.map((row) => (
        <Card key={row.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{row.title}</CardTitle>
              <Badge variant={row.active ? "secondary" : "outline"}>
                {row.active ? "Active" : "Hidden"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="whitespace-pre-wrap text-sm">{row.body}</p>
            <p className="text-xs text-muted-foreground">
              {row.emailSentAt
                ? `Email sent ${row.emailSentAt.toISOString().slice(0, 16).replace("T", " ")} to ${row.emailRecipientCount}`
                : row.emailRequested
                  ? "Email requested, not sent yet"
                  : "No email requested"}
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={toggleAnnouncement}>
                <input type="hidden" name="id" value={row.id} />
                <SubmitButton size="sm" variant="outline" loadingText="Saving...">
                  {row.active ? "Hide banner" : "Show banner"}
                </SubmitButton>
              </form>
              {row.emailRequested ? (
                <form action={resendAnnouncement}>
                  <input type="hidden" name="id" value={row.id} />
                  <SubmitButton size="sm" variant="outline" loadingText="Sending...">
                    Send email again
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
