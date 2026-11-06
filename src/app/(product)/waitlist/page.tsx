import Link from "next/link";
import { BrandMark } from "@/components/brand/logo";
import { marketingUrl } from "@/lib/brand";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = params.email?.includes("@") ? params.email : null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <BrandMark />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl tracking-tight">You are on the waitlist</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {email
              ? `${email} is not approved for the beta yet.`
              : "This email is not approved for the beta yet."}{" "}
            Ask for access at {new URL(marketingUrl()).host}. You can sign in after the email is approved. No account was opened.
          </p>
        </div>
        <Button nativeButton={false} variant="outline" size="lg" className="w-full" render={<Link href="/login" />}>
          Back to log in
        </Button>
      </div>
    </main>
  );
}
