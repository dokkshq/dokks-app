import Link from "next/link";
import { BrandMark } from "@/components/brand/logo";
import { ResendCode } from "@/components/auth/resend-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { devBypassEnabled } from "@/lib/session";

export function AuthScreen({
  title,
  subtitle,
  githubHref,
  returnTo,
  nextPath,
  alternate,
  error,
  notice,
}: {
  title: string;
  subtitle: string;
  githubHref: string;
  returnTo: "login" | "sign-up";
  nextPath: string;
  alternate: { href: string; prompt: string; label: string };
  error: string | null;
  notice: string | null;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <BrandMark />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl tracking-tight">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{subtitle}</p>
        </div>
        {notice ? <p className="text-sm leading-6">{notice}</p> : null}
        {error ? <p className="text-sm leading-6 text-destructive">{error}</p> : null}
        <Button nativeButton={false} size="lg" className="w-full" render={<Link href={githubHref} />}>
          Continue with GitHub
        </Button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <form action="/api/auth/email/start" method="post" className="flex flex-col gap-3">
          <input type="hidden" name="return" value={returnTo} />
          {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
          <label className="flex flex-col gap-2 text-sm" htmlFor="email">
            Email
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="h-10 px-4"
            />
          </label>
          <SubmitButton size="lg" className="w-full" loadingText="Sending...">
            Continue
          </SubmitButton>
        </form>
        <p className="text-sm text-muted-foreground">
          {alternate.prompt}{" "}
          <Link href={alternate.href} className="text-foreground underline underline-offset-4">
            {alternate.label}
          </Link>
        </p>
        {devBypassEnabled() ? (
          <p className="text-sm leading-6 text-muted-foreground">
            Dev preview is on, so the dashboard opens without an account.{" "}
            <Link href="/dashboard" className="text-foreground underline underline-offset-4">
              Open the dashboard
            </Link>
            .
          </p>
        ) : null}
      </div>
    </main>
  );
}

export function CodeScreen({
  email,
  error,
  cooldown,
}: {
  email: string | null;
  error: string | null;
  cooldown: number;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <BrandMark />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl tracking-tight">Enter your code</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {email
              ? `We sent a 6-digit code to ${email}. It expires in 10 minutes.`
              : "Request a code from the log in page, then enter it here."}
          </p>
        </div>
        {error ? <p className="text-sm leading-6 text-destructive">{error}</p> : null}
        <form action="/api/auth/email/verify" method="post" className="flex flex-col gap-3">
          <label className="flex flex-col gap-2 text-sm" htmlFor="code">
            Code
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              placeholder="000000"
              className="h-10 px-4 font-mono tracking-[0.3em]"
            />
          </label>
          <SubmitButton size="lg" className="w-full" loadingText="Verifying...">
            Continue
          </SubmitButton>
        </form>
        <ResendCode email={email} cooldown={cooldown} />
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}
