import { productName } from "@/lib/brand";
import { appUrl } from "@/lib/config";
import { emailPreferenceLinks } from "@/lib/email/preferences";
import { renderEmail } from "@/lib/email/render";
import { AnnouncementEmail } from "@/lib/email/templates/announcement";
import { BetaApprovalEmail, BetaInviteEmail } from "@/lib/email/templates/beta";
import { OpsEmail } from "@/lib/email/templates/ops";
import { sendEmail, type EmailDelivery, type EmailEnv } from "@/lib/email/transport";

export type { EmailDelivery } from "@/lib/email/transport";

export async function sendBetaInviteEmail(args: {
  to: string;
  inviteUrl: string;
  env?: EmailEnv;
}): Promise<EmailDelivery> {
  const env = args.env ?? process.env;
  const rendered = await renderEmail(
    BetaInviteEmail({ inviteUrl: args.inviteUrl, appUrl: appUrl(env) }),
  );
  return sendEmail({
    to: [args.to],
    subject: `You're invited to the ${productName()} beta`,
    html: rendered.html,
    text: rendered.text,
    tags: [{ name: "type", value: "beta-invite" }],
    env,
  });
}

export async function sendBetaApprovalEmail(args: {
  to: string;
  loginUrl: string;
  env?: EmailEnv;
}): Promise<EmailDelivery> {
  const env = args.env ?? process.env;
  const rendered = await renderEmail(
    BetaApprovalEmail({ loginUrl: args.loginUrl, appUrl: appUrl(env) }),
  );
  return sendEmail({
    to: [args.to],
    subject: `You're in: ${productName()} beta`,
    html: rendered.html,
    text: rendered.text,
    tags: [{ name: "type", value: "beta-approval" }],
    env,
  });
}

export async function sendAnnouncementEmail(args: {
  to: string;
  subject: string;
  body: string;
  env?: EmailEnv;
}): Promise<EmailDelivery> {
  const env = args.env ?? process.env;
  const base = appUrl(env);
  const links = emailPreferenceLinks(args.to, base);
  if (!links && env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required to send announcement email");
  }
  const rendered = await renderEmail(
    AnnouncementEmail({
      title: args.subject,
      body: args.body,
      appUrl: base,
      preferences:
        links === null
          ? undefined
          : {
              manageUrl: links.manageUrl,
              unsubscribeUrl: links.unsubscribeUrl,
            },
    }),
  );
  return sendEmail({
    to: [args.to],
    subject: args.subject,
    html: rendered.html,
    text: rendered.text,
    tags: [{ name: "type", value: "announcement" }],
    headers: links
      ? {
          "List-Unsubscribe": `<${links.oneClickUnsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
    env,
  });
}

export async function sendOpsEmail(args: {
  to: string[];
  subject: string;
  text: string;
  env?: EmailEnv;
}): Promise<EmailDelivery> {
  const env = args.env ?? process.env;
  const rendered = await renderEmail(
    OpsEmail({
      subject: args.subject,
      body: args.text,
      appUrl: appUrl(env),
    }),
  );
  return sendEmail({
    to: args.to,
    subject: args.subject,
    html: rendered.html,
    text: rendered.text,
    tags: [{ name: "type", value: "ops" }],
    env,
  });
}
