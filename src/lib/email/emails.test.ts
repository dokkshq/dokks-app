import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { MARK_EMAIL, marketingUrl, productName } from "@/lib/brand";
import { renderEmail } from "@/lib/email/render";
import { AnnouncementEmail } from "@/lib/email/templates/announcement";
import { BetaApprovalEmail, BetaInviteEmail } from "@/lib/email/templates/beta";
import { LoginCodeEmail } from "@/lib/email/templates/login-code";
import { OpsEmail } from "@/lib/email/templates/ops";

const appUrl = "https://beta.opentip.tech";

describe("branded emails", () => {
  it("renders a sign-in code with the brand shell", async () => {
    const rendered = await renderEmail(
      createElement(LoginCodeEmail, {
        code: "123456",
        purpose: "signin",
        appUrl,
      }),
    );

    expect(rendered.html).toContain("Your sign-in code");
    expect(rendered.html).toContain("123456");
    expect(rendered.html).toContain(`${appUrl}${MARK_EMAIL}`);
    expect(rendered.html).toContain(`${marketingUrl()}/privacy`);
    expect(rendered.text).toContain(`Enter this code to finish signing in to ${productName()}.`);
    expect(rendered.text).toContain("This code expires in 10 minutes.");
    expect(rendered.text).toContain("123456");
    expect(rendered.text).not.toContain("support@");
  });

  it("renders the email confirmation variant", async () => {
    const rendered = await renderEmail(
      createElement(LoginCodeEmail, {
        code: "654321",
        purpose: "email-change",
        appUrl,
      }),
    );

    expect(rendered.text.toLowerCase()).toContain("confirm your new email");
    expect(rendered.text).toContain("Your current email stays on the account");
  });

  it("renders a beta invite with its invite link", async () => {
    const inviteUrl = `${appUrl}/login?invite=sample-token`;
    const rendered = await renderEmail(
      createElement(BetaInviteEmail, { inviteUrl, appUrl }),
    );

    expect(rendered.text.toLowerCase()).toContain(`you're invited to the ${productName().toLowerCase()} beta`);
    expect(rendered.html).toContain(inviteUrl);
    expect(rendered.text).toContain(inviteUrl);
  });

  it("renders a beta approval with the login link", async () => {
    const loginUrl = `${appUrl}/login`;
    const rendered = await renderEmail(
      createElement(BetaApprovalEmail, { loginUrl, appUrl }),
    );

    expect(rendered.text.toLowerCase()).toContain("you're in.");
    expect(rendered.html).toContain(loginUrl);
    expect(rendered.text).toContain("There is no charge during the beta.");
  });

  it("renders an announcement with unsubscribe links", async () => {
    const manageUrl = `${appUrl}/email/preferences?token=sample`;
    const unsubscribeUrl = `${manageUrl}&intent=unsubscribe`;
    const rendered = await renderEmail(
      createElement(AnnouncementEmail, {
        title: "A smaller, faster update",
        body: "Push updates are smaller and faster now.",
        appUrl,
        preferences: { manageUrl, unsubscribeUrl },
      }),
    );

    expect(rendered.text).toContain("A SMALLER, FASTER UPDATE");
    expect(rendered.text).toContain("Push updates are smaller and faster now.");
    expect(rendered.html).toContain(manageUrl);
    expect(rendered.html).toContain(unsubscribeUrl.replace("&", "&amp;"));
    expect(rendered.text).toContain("Email preferences");
    expect(rendered.text).toContain("Unsubscribe");
  });

  it("renders an internal ops email without preference links", async () => {
    const rendered = await renderEmail(
      createElement(OpsEmail, {
        subject: "Opentip AI spend above $25",
        body: "Estimated spend is $31.42.",
        appUrl,
      }),
    );

    expect(rendered.text).toContain("OPENTIP AI SPEND ABOVE $25");
    expect(rendered.text).toContain("Estimated spend is $31.42.");
    expect(rendered.text).toContain("This is an internal operations email.");
    expect(rendered.text).not.toContain("Unsubscribe");
  });
});
