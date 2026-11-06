import { createElement } from "react";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderEmail } from "../src/lib/email/render";
import { AnnouncementEmail } from "../src/lib/email/templates/announcement";
import { BetaApprovalEmail, BetaInviteEmail } from "../src/lib/email/templates/beta";
import { LoginCodeEmail } from "../src/lib/email/templates/login-code";
import { OpsEmail } from "../src/lib/email/templates/ops";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const token = "v1.YWRhQGV4YW1wbGUuY29t.example-signature";
const preferences = {
  manageUrl: `${appUrl}/email/preferences?token=${token}`,
  unsubscribeUrl: `${appUrl}/email/preferences?token=${token}&intent=unsubscribe`,
};

const emails = [
  {
    slug: "login-code",
    element: createElement(LoginCodeEmail, {
      code: "123456",
      purpose: "signin",
      appUrl,
    }),
  },
  {
    slug: "email-change",
    element: createElement(LoginCodeEmail, {
      code: "654321",
      purpose: "email-change",
      appUrl,
    }),
  },
  {
    slug: "beta-invite",
    element: createElement(BetaInviteEmail, {
      inviteUrl: `${appUrl}/login?invite=sample-token-value1`,
      appUrl,
    }),
  },
  {
    slug: "beta-approval",
    element: createElement(BetaApprovalEmail, {
      loginUrl: `${appUrl}/login`,
      appUrl,
    }),
  },
  {
    slug: "announcement",
    element: createElement(AnnouncementEmail, {
      title: "Copilot now updates only the pages your change affects",
      body: "Push updates are smaller and faster now.\n\nOpen the app to see the latest build for your site.",
      appUrl,
      preferences,
    }),
  },
  {
    slug: "ops",
    element: createElement(OpsEmail, {
      subject: "AI spend above $25",
      body: "Estimated AI spend for today is $31.42, above the daily threshold of $25.",
      appUrl,
    }),
  },
];

async function main() {
  const output = join(process.cwd(), ".local", "email-preview");
  mkdirSync(output, { recursive: true });
  for (const email of emails) {
    const rendered = await renderEmail(email.element);
    writeFileSync(join(output, `${email.slug}.html`), rendered.html, "utf8");
    writeFileSync(join(output, `${email.slug}.txt`), rendered.text, "utf8");
    console.log(`${email.slug}: ${join(output, `${email.slug}.html`)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Email preview failed");
  process.exit(1);
});
