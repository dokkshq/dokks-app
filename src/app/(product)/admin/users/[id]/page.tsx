import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPrisma } from "@/lib/db";
import { addCredits } from "@/app/(product)/admin/plans/actions";
import { startActAs, suspendUser, unsuspendUser } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  await searchParams;
  const prisma = getPrisma();
  if (!prisma) notFound();
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      installations: {
        include: { _count: { select: { repos: true } } },
      },
      sites: { select: { id: true, name: true, status: true, subdomain: true } },
    },
  });
  if (!user) notFound();
  const usage = await prisma.usageEntry.aggregate({
    where: { repo: { installation: { userId: id } } },
    _sum: { promptTokens: true, completionTokens: true, estimatedCostUsd: true },
    _count: true,
  });
  const activity = await prisma.activityLog.findMany({
    where: { OR: [{ actorId: id }, { targetId: id }] },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <>
      <PageHeader
        title={user.name || user.login}
        description={user.email ?? "No email on this account"}
        action={
          <div className="flex gap-2">
            <Button nativeButton={false} variant="outline" render={<Link href="/admin/users" />}>
              Back
            </Button>
            <form action={startActAs}>
              <input type="hidden" name="id" value={user.id} />
              <SubmitButton variant="outline" loadingText="Opening...">
                View as
              </SubmitButton>
            </form>
            {user.suspendedAt ? (
              <form action={unsuspendUser}>
                <input type="hidden" name="id" value={user.id} />
                <SubmitButton loadingText="Restoring...">Unsuspend</SubmitButton>
              </form>
            ) : (
              <form action={suspendUser}>
                <input type="hidden" name="id" value={user.id} />
                <SubmitButton variant="destructive" loadingText="Suspending...">
                  Suspend
                </SubmitButton>
              </form>
            )}
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={user.suspendedAt ? "destructive" : "secondary"}>
              {user.suspendedAt ? "Suspended" : "Active"}
            </Badge>
            <p className="mt-2 text-sm text-muted-foreground">
              {user.role} · joined {user.createdAt.toISOString().slice(0, 10)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {usage._count} jobs · {usage._sum.promptTokens ?? 0} prompt tokens ·{" "}
              {usage._sum.completionTokens ?? 0} completion tokens
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Estimated ${Number(usage._sum.estimatedCostUsd ?? 0).toFixed(4)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Credits</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm">{user.creditBalance} credits</p>
            <form action={addCredits} className="flex flex-col gap-2">
              <input type="hidden" name="userId" value={user.id} />
              <Input name="amount" type="text" inputMode="numeric" required placeholder="Credits" />
              <Input name="reason" required placeholder="Reason" />
              <div className="flex gap-2">
                <SubmitButton name="mode" value="grant" size="sm">
                  Grant
                </SubmitButton>
                <SubmitButton name="mode" value="remove" size="sm" variant="outline">
                  Remove
                </SubmitButton>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="py-0">
        <CardHeader className="px-4 pt-4">
          <CardTitle>GitHub installations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Repos</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user.installations.map((installation) => (
                <TableRow key={installation.id}>
                  <TableCell>{installation.accountLogin}</TableCell>
                  <TableCell>{installation.accountType}</TableCell>
                  <TableCell>{installation._count.repos}</TableCell>
                  <TableCell>{installation.uninstalledAt ? "Uninstalled" : "Active"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="px-4 pt-4">
          <CardTitle>Sites</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subdomain</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user.sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell>{site.name}</TableCell>
                  <TableCell>{site.status}</TableCell>
                  <TableCell>{site.subdomain}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="px-4 pt-4">
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.action}</TableCell>
                  <TableCell>{row.actorEmail ?? row.actorId ?? "System"}</TableCell>
                  <TableCell>{row.createdAt.toISOString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
