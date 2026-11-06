import { AuthScreen } from "@/components/auth/auth-screen";
import { productName } from "@/lib/brand";
import { redirectAuthenticatedEntry } from "@/lib/auth/entry";
import { authErrors } from "@/lib/auth/messages";
import { safeRelativePath } from "@/lib/auth/gate";

export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; invite?: string }>;
}) {
  await redirectAuthenticatedEntry();
  const params = await searchParams;
  const next = safeRelativePath(params.next, "");
  const query = new URLSearchParams();
  if (next) query.set("next", next);
  if (params.invite) query.set("invite", params.invite);
  const suffix = query.size ? `?${query.toString()}` : "";
  return (
    <AuthScreen
      title="Create your account"
      subtitle={`${productName()} is in a closed beta.`}
      githubHref={`/api/auth/github${suffix}`}
      returnTo="sign-up"
      nextPath={next}
      alternate={{ href: `/login${suffix}`, prompt: "Already have an account?", label: "Log in" }}
      error={params.error ? (authErrors[params.error] ?? null) : null}
      notice={null}
    />
  );
}
