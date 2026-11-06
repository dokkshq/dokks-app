import { PageHeader } from "@/components/shell/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FileInput } from "@/components/ui/file-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { getRequestSession } from "@/lib/auth";
import { getViewSession, readActAs } from "@/lib/admin/act-as";
import { installationVisibleWhere } from "@/lib/github/installation-access";
import { getPrisma } from "@/lib/db";
import { githubAppInstallUrl } from "@/lib/config";
import { avatarFor, initialsFor } from "@/lib/profile/avatar";
import { canUnlinkEmail, canUnlinkGithub } from "@/lib/profile/rules";
import { loadCurrentUser } from "@/lib/profile/user";
import {
  confirmEmailChange,
  deleteAccount,
  removePicture,
  requestEmailChange,
  signOutEverywhere,
  unlinkEmail,
  unlinkGithub,
  updateDisplayName,
  uploadPicture,
} from "./actions";

export const dynamic = "force-dynamic";

const errorCopy: Record<string, string> = {
  name: "Enter a display name.",
  image: "Use a PNG, JPEG, or WebP image up to 2 MB.",
  blob: "Picture uploads are not configured. Set BLOB_READ_WRITE_TOKEN.",
  database: "The database is not connected.",
  email: "Enter a valid email address.",
  "email-taken": "That email is already used by another account.",
  "email-send": "The code could not be sent. Check Resend.",
  cooldown: "Wait a minute before requesting another code.",
  expired: "The code expired. Request a new one.",
  wrong: "That code is wrong.",
  too_many: "Too many attempts. Request a new code.",
  missing: "No code was found. Request a new one.",
  used: "That code was already used.",
  "last-method": "Keep at least one sign-in method connected.",
  confirm: "Type your login exactly to confirm deletion.",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    sent?: string;
  }>;
}) {
  const real = await getRequestSession();
  const session = await getViewSession();
  if (!session) return null;
  const actAs = await readActAs();
  const user = await loadCurrentUser(session);
  const prisma = getPrisma();
  const installations = prisma
    ? await prisma.installation.findMany({
        where: installationVisibleWhere(session.userId),
        include: { _count: { select: { repos: { where: { removed: false } } } } },
        orderBy: { accountLogin: "asc" },
      })
    : [];
  const params = await searchParams;
  const avatar = avatarFor(user);
  const readOnly = Boolean(actAs);

  return (
    <>
      <PageHeader
        title="Profile"
        description="Your account, sign-in methods, and connected GitHub accounts."
      />

      {params.error ? (
        <p className="text-sm text-destructive">{errorCopy[params.error] ?? "Something went wrong."}</p>
      ) : null}
      {params.saved ? <p className="text-sm text-muted-foreground">Saved.</p> : null}
      {params.sent ? (
        <p className="text-sm text-muted-foreground">A code was sent to {params.sent}.</p>
      ) : null}
      {readOnly ? (
        <p className="text-sm text-muted-foreground">
          Act-as is read-only. Stop viewing to edit your profile.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Picture</CardTitle>
          <CardDescription>PNG, JPEG, or WebP. Max 2 MB.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Avatar size="lg" className="size-16">
            {avatar ? <AvatarImage src={avatar} alt="" /> : null}
            <AvatarFallback>{initialsFor(user.name, user.login)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-wrap gap-2">
            <form action={uploadPicture} className="flex flex-wrap items-center gap-2">
              <FileInput
                name="picture"
                accept="image/png,image/jpeg,image/webp"
                required
                disabled={readOnly}
                label="Choose image"
              />
              <SubmitButton size="sm" disabled={readOnly} loadingText="Uploading...">
                Upload
              </SubmitButton>
            </form>
            {user.imageUrl ? (
              <form action={removePicture}>
                <SubmitButton
                  size="sm"
                  variant="outline"
                  disabled={readOnly}
                  loadingText="Removing..."
                >
                  Remove
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Display name</CardTitle>
          <CardDescription>Shown in the header and on account menus.</CardDescription>
        </CardHeader>
        <form action={updateDisplayName}>
          <CardContent>
            <input
              name="name"
              defaultValue={user.name ?? ""}
              maxLength={80}
              required
              disabled={readOnly}
              className="h-9 w-full rounded-control border border-border bg-background px-4 text-sm outline-none focus:border-foreground"
            />
          </CardContent>
          <CardFooter>
            <SubmitButton disabled={readOnly} loadingText="Saving...">
              Save name
            </SubmitButton>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            {user.email ?? "No email on this account"}. Changing the email sends a 6-digit code to the new address.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={requestEmailChange} className="flex flex-wrap items-end gap-2">
            <label className="min-w-56 flex-1 text-sm">
              New email
              <input
                type="email"
                name="email"
                required
                defaultValue={params.sent ?? ""}
                disabled={readOnly}
                className="mt-1 h-9 w-full rounded-control border border-border bg-background px-4 outline-none focus:border-foreground"
              />
            </label>
            <SubmitButton variant="outline" disabled={readOnly} loadingText="Sending...">
              Send code
            </SubmitButton>
          </form>
          <form action={confirmEmailChange} className="flex flex-wrap items-end gap-2">
            <label className="min-w-56 flex-1 text-sm">
              New email
              <input
                type="email"
                name="email"
                required
                defaultValue={params.sent ?? ""}
                disabled={readOnly}
                className="mt-1 h-9 w-full rounded-control border border-border bg-background px-4 outline-none focus:border-foreground"
              />
            </label>
            <label className="text-sm">
              Code
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                disabled={readOnly}
                className="mt-1 h-9 w-32 rounded-control border border-border bg-background px-4 font-mono outline-none focus:border-foreground"
              />
            </label>
            <SubmitButton disabled={readOnly} loadingText="Confirming...">
              Confirm
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign-in methods</CardTitle>
          <CardDescription>Keep at least one method connected.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-3">
            <div>
              <p className="text-sm font-medium">GitHub</p>
              <p className="text-xs text-muted-foreground">
                {user.githubId ? "Connected" : "Not connected"}
              </p>
            </div>
            {user.githubId ? (
              <form action={unlinkGithub}>
                <SubmitButton
                  size="sm"
                  variant="outline"
                  disabled={readOnly || !canUnlinkGithub(user)}
                  loadingText="Unlinking..."
                >
                  Unlink
                </SubmitButton>
              </form>
            ) : (
              <Button
                nativeButton={false}
                size="sm"
                variant="outline"
                render={<a href="/api/auth/github/link" />}
              >
                Link GitHub
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-3">
            <div>
              <p className="text-sm font-medium">Email code</p>
              <p className="text-xs text-muted-foreground">
                {user.emailSignInEnabled ? "Enabled" : "Disabled. The address is kept."}
              </p>
            </div>
            {user.emailSignInEnabled ? (
              <form action={unlinkEmail}>
                <SubmitButton
                  size="sm"
                  variant="outline"
                  disabled={readOnly || !canUnlinkEmail(user)}
                  loadingText="Disabling..."
                >
                  Disable
                </SubmitButton>
              </form>
            ) : (
              <Badge variant="secondary">Disabled</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected GitHub accounts</CardTitle>
          <CardDescription>
            Installations linked to this account. Manage scopes on GitHub.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {installations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No GitHub installations connected.</p>
          ) : (
            installations.map((installation) => (
              <div
                key={installation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar size="sm">
                    {installation.accountAvatarUrl ? (
                      <AvatarImage src={installation.accountAvatarUrl} alt="" />
                    ) : null}
                    <AvatarFallback>
                      {initialsFor(installation.accountLogin, installation.accountLogin)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{installation.accountLogin}</p>
                    <p className="text-xs text-muted-foreground">
                      {installation.accountType === "Organization" ? "Organization" : "Personal"} ·{" "}
                      {installation._count.repos} repos
                    </p>
                  </div>
                </div>
                <Button
                  nativeButton={false}
                  size="sm"
                  variant="outline"
                  render={
                    <a
                      href={`https://github.com/settings/installations/${installation.githubInstallationId}`}
                    />
                  }
                >
                  Manage
                </Button>
              </div>
            ))
          )}
          <div>
            <Button nativeButton={false} variant="outline" size="sm" render={<a href={githubAppInstallUrl()} />}>
              Add GitHub Scope
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>Sign out of this and every other device.</CardDescription>
        </CardHeader>
        <CardFooter>
          <form action={signOutEverywhere}>
            <SubmitButton
              variant="outline"
              disabled={readOnly || !real}
              loadingText="Signing out..."
            >
              Sign out all devices
            </SubmitButton>
          </form>
        </CardFooter>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Deletes your account, sites, pages, jobs, usage, and profile picture. GitHub installations stay in place.
            Type <span className="font-medium">{user.login}</span> to confirm.
          </CardDescription>
        </CardHeader>
        <form action={deleteAccount}>
          <CardContent>
            <input
              name="confirm"
              required
              disabled={readOnly}
              placeholder={user.login}
              className="h-9 w-full rounded-control border border-border bg-background px-4 text-sm outline-none focus:border-foreground"
            />
          </CardContent>
          <CardFooter>
            <SubmitButton variant="destructive" disabled={readOnly} loadingText="Deleting...">
              Delete account
            </SubmitButton>
          </CardFooter>
        </form>
      </Card>
    </>
  );
}
