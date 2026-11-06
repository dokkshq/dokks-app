import Link from "next/link";
import { BrandLockup } from "@/components/brand/logo";
import { productName } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { redirectAuthenticatedEntry } from "@/lib/auth/entry";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await redirectAuthenticatedEntry();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <BrandLockup href="/" />
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl tracking-tight">Hosted docs and a Changelog for GitHub repos.</h1>
        <p className="max-w-xl text-base leading-7 text-muted-foreground">
          {productName()} writes the docs and updates them on every push.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button nativeButton={false} render={<Link href="/sign-up" />}>
          Sign up
        </Button>
        <Button nativeButton={false} variant="outline" render={<Link href="/login" />}>
          Log in
        </Button>
        <Button nativeButton={false} variant="outline" render={<Link href="/sites/sample" />}>
          View a preview site
        </Button>
      </div>
    </main>
  );
}
