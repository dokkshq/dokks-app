import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { productName } from "@/lib/brand";
import { appUrl } from "@/lib/config";
import type { EmailDelivery, EmailEnv } from "@/lib/email/transport";
import { renderEmail } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/transport";
import { LoginCodeEmail } from "@/lib/email/templates/login-code";

export async function sendLoginCodeEmail(args: {
  to: string;
  code: string;
  purpose?: "signin" | "email-change";
  env?: EmailEnv & { LOGIN_CODE_SINK?: string };
}): Promise<EmailDelivery | { delivered: false; mode: "sink" }> {
  const env = args.env ?? process.env;
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM;
  if (!apiKey || !from) {
    if (env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY and RESEND_FROM are required in production");
    }
    if (env.LOGIN_CODE_SINK) {
      mkdirSync(dirname(env.LOGIN_CODE_SINK), { recursive: true });
      appendFileSync(env.LOGIN_CODE_SINK, `${args.to} ${args.code}\n`, "utf8");
      return { delivered: false, mode: "sink" };
    }
    return { delivered: false, mode: "skipped" };
  }
  const purpose = args.purpose ?? "signin";
  const rendered = await renderEmail(
    LoginCodeEmail({
      code: args.code,
      purpose,
      appUrl: appUrl(env),
    }),
  );
  return sendEmail({
    to: [args.to],
    subject:
      purpose === "email-change"
        ? `Confirm your new ${productName()} email`
        : `Your ${productName()} sign-in code`,
    html: rendered.html,
    text: rendered.text,
    tags: [{ name: "type", value: purpose === "email-change" ? "email-change" : "login-code" }],
    env,
  });
}
