import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { marketingUrl } from "@/lib/brand";
import { normalizeEmail } from "@/lib/auth/login-code";
import { isBootstrapAdmin } from "@/lib/beta/admins";
import { findBetaAccessEmails } from "@/lib/beta/access";
import { formatApplicationDate, formatMonthlyPay } from "@/lib/beta/marketing-applications";
import { loadMarketingApplications } from "@/lib/beta/marketing-db";
import { ApplicationNotice, type ApplicationSearchParams } from "./notice";
import { ReviewActions } from "./review-actions";

export const dynamic = "force-dynamic";

const STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
} as const;

const STATUS_VARIANTS = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
} as const;

function accessLabel(
  status: "pending" | "approved" | "rejected",
  hasAccess: boolean,
  bootstrapAdmin: boolean,
): string {
  if (status === "pending") return hasAccess ? "Granted" : "Not granted";
  if (status === "approved") return hasAccess ? "Granted" : "Missing";
  if (hasAccess && bootstrapAdmin) return "Admin access";
  return hasAccess ? "Still granted" : "Revoked";
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<ApplicationSearchParams>;
}) {
  const params = await searchParams;
  const result = await loadMarketingApplications(50);
  const applications = result.state === "ok" ? result.applications : [];
  const access = await findBetaAccessEmails(applications.map((application) => application.email));

  return (
    <>
      <PageHeader
        title="Applications"
        description={`Applications from ${new URL(marketingUrl()).host}. Approving grants beta access and sends one access email. Rejecting revokes access.`}
      />
      <ApplicationNotice params={params} />

      {result.state === "unconfigured" ? (
        <Empty className="border border-border bg-card">
          <EmptyHeader>
            <EmptyTitle>Applications database is not configured</EmptyTitle>
            <EmptyDescription>
              Set MARKETING_DATABASE_URL to read the marketing site applications.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {result.state === "unavailable" ? (
        <Empty className="border border-border bg-card">
          <EmptyHeader>
            <EmptyTitle>Applications are unavailable</EmptyTitle>
            <EmptyDescription>
              The marketing database could not be reached. Other admin pages still work.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {result.state === "ok" && applications.length === 0 ? (
        <Empty className="border border-border bg-card">
          <EmptyHeader>
            <EmptyTitle>No applications yet</EmptyTitle>
            <EmptyDescription>New applications from {new URL(marketingUrl()).host} will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {result.state === "ok" && applications.length > 0 ? (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>GitHub / X</TableHead>
                <TableHead>Repo</TableHead>
                <TableHead>Pay</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((application) => {
                const normalizedEmail = normalizeEmail(application.email);
                const hasAccess = normalizedEmail ? access.has(normalizedEmail) : false;
                const bootstrapAdmin = isBootstrapAdmin(application.email);
                const href = `/admin/applications/${application.id}`;
                return (
                  <TableRow key={application.id}>
                    <TableCell className="align-top">
                      <Link className="font-medium underline-offset-4 hover:underline" href={href}>
                        {application.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{application.email}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <p>@{application.githubUsername.replace(/^@/, "")}</p>
                      {application.xHandle ? (
                        <p className="text-xs text-muted-foreground">
                          X: @{application.xHandle.replace(/^@/, "")}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[220px] align-top">
                      <p className="truncate" title={application.repoUrl}>
                        {application.repoUrl}
                      </p>
                    </TableCell>
                    <TableCell className="align-top">{formatMonthlyPay(application.monthlyPayUsd)}</TableCell>
                    <TableCell className="align-top">{formatApplicationDate(application.createdAt)}</TableCell>
                    <TableCell className="align-top">
                      <Badge variant={STATUS_VARIANTS[application.status]}>
                        {STATUS_LABELS[application.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      {accessLabel(application.status, hasAccess, bootstrapAdmin)}
                    </TableCell>
                    <TableCell className="align-top">
                      <ReviewActions
                        id={application.id}
                        status={application.status}
                        hasAccess={hasAccess}
                        bootstrapAdmin={bootstrapAdmin}
                        returnTo="/admin/applications"
                        size="sm"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
