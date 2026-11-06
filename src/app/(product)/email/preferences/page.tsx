import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand/logo";
import { marketingUrl, productName } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  loadAnnouncementPreference,
  readEmailPreferenceToken,
} from "@/lib/email/preferences";
import { updateEmailPreferences } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};

export default async function EmailPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string;
    intent?: string;
    saved?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";
  const email = readEmailPreferenceToken(token);

  if (!email) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <BrandMark />
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl tracking-tight">Email preferences</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              This preferences link is invalid. Open the latest email from {productName()} and use
              the link in its footer.
            </p>
          </div>
          <Button
            nativeButton={false}
            variant="outline"
            size="lg"
            className="w-full"
            render={<Link href={marketingUrl()} />}
          >
            Back to {new URL(marketingUrl()).host}
          </Button>
        </div>
      </main>
    );
  }

  const preference = await loadAnnouncementPreference(email);
  if (preference.state !== "ok") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <BrandMark />
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl tracking-tight">Email preferences</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {preference.state === "no-database"
                ? "Email preferences are unavailable because the database is not connected."
                : "This preferences link is invalid."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const checked = params.intent === "unsubscribe" ? false : preference.announcements;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <BrandMark />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl tracking-tight">Email preferences</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Choose which product emails {productName()} sends to {email}.
          </p>
        </div>

        {params.saved ? (
          <p className="text-sm text-muted-foreground">
            {params.saved === "off"
              ? "You are unsubscribed from product updates."
              : "Product updates are on."}
          </p>
        ) : null}
        {params.error ? (
          <p className="text-sm text-destructive">
            {params.error === "no-database"
              ? "The database is not connected. Try again later."
              : "The preferences could not be saved."}
          </p>
        ) : null}

        <form action={updateEmailPreferences} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <label className="flex items-start gap-3 rounded-control border border-border bg-background p-4 text-sm">
            <Checkbox name="announcements" defaultChecked={checked} className="mt-0.5" />
            <span>
              <span className="block font-medium">Product updates</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Occasional email about new {productName()} features and changes during the beta.
              </span>
            </span>
          </label>
          <p className="text-xs leading-5 text-muted-foreground">
            Sign-in codes, beta access, and other messages about your account are
            transactional and are not controlled by this setting.
          </p>
          <div className="flex flex-wrap gap-2">
            <SubmitButton className="flex-1" loadingText="Saving...">
              Save preferences
            </SubmitButton>
            <SubmitButton
              name="intent"
              value="unsubscribe"
              variant="outline"
              className="flex-1"
              loadingText="Saving..."
            >
              Unsubscribe
            </SubmitButton>
          </div>
        </form>
      </div>
    </main>
  );
}
