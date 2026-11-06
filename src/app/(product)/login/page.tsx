import { AuthScreen } from "@/components/auth/auth-screen";
import { productName } from "@/lib/brand";
import { redirectAuthenticatedEntry } from "@/lib/auth/entry";
import { safeRelativePath } from "@/lib/auth/gate";
import { authErrors, installNotice } from "@/lib/auth/messages";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; invite?: string; from?: string }>;
}) {
  await redirectAuthenticatedEntry();
  const params = await searchParams;
  const next = safeRelativePath(params.next, "");
  const query = new URLSearchParams();
  if (next) query.set("next", next);
  if (params.invite && /^[A-Za-z0-9_-]{16,}$/.test(params.invite)) query.set("invite", params.invite);
  const suffix = query.size ? `?${query.toString()}` : "";
  return (
    <AuthScreen
      title={`Log in to ${productName()}`}
      subtitle=""
      githubHref={`/api/auth/github${suffix}`}
      returnTo="login"
      nextPath={next}
      alternate={{ href: `/sign-up${suffix}`, prompt: `New to ${productName()}?`, label: "Sign up" }}
      error={params.error ? (authErrors[params.error] ?? null) : null}
      notice={params.from === "install" ? installNotice : null}
    />
  );
}
