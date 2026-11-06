import { productName } from "@/lib/brand";
import {
  EmailCode,
  EmailLayout,
  EmailMuted,
  EmailParagraph,
} from "@/lib/email/templates/layout";

export function LoginCodeEmail({
  code,
  purpose,
  appUrl,
}: {
  code: string;
  purpose: "signin" | "email-change";
  appUrl: string;
}) {
  const change = purpose === "email-change";
  return (
    <EmailLayout
      preview={
        change
          ? `Your ${productName()} email confirmation code is inside. It expires in 10 minutes.`
          : `Your ${productName()} sign-in code is inside. It expires in 10 minutes.`
      }
      heading={change ? "Confirm your new email" : "Your sign-in code"}
      appUrl={appUrl}
      reason={
        change
          ? `You received this because a new email address was requested for your ${productName()} account.`
          : "You received this because someone requested a sign-in code for this email address."
      }
    >
      <EmailParagraph>
        {change
          ? `Enter this code to confirm this address for your ${productName()} account.`
          : `Enter this code to finish signing in to ${productName()}.`}
      </EmailParagraph>
      <EmailCode code={code} />
      <EmailParagraph>This code expires in 10 minutes.</EmailParagraph>
      <EmailMuted>
        Never share this code with anyone. {productName()} will never ask you for it.
        {change
          ? " Your current email stays on the account until this code is confirmed."
          : " If you did not try to sign in, you can ignore this email."}
      </EmailMuted>
    </EmailLayout>
  );
}
