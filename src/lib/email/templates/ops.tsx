import { Text } from "react-email";
import { productName } from "@/lib/brand";
import {
  EmailButton,
  EmailLayout,
  EmailMuted,
} from "@/lib/email/templates/layout";

function previewFor(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 140);
}

export function OpsEmail({
  subject,
  body,
  appUrl,
}: {
  subject: string;
  body: string;
  appUrl: string;
}) {
  return (
    <EmailLayout
      preview={previewFor(body)}
      heading={subject}
      appUrl={appUrl}
      reason={`You received this because you are on the ${productName()} operations alert list.`}
    >
      <Text
        style={{
          margin: "0 0 16px",
          fontSize: "15px",
          lineHeight: "24px",
          color: "#171717",
          whiteSpace: "pre-wrap",
        }}
      >
        {body}
      </Text>
      <EmailButton href={`${appUrl.replace(/\/$/, "")}/admin`} label="Open admin" />
      <EmailMuted>This is an internal operations email.</EmailMuted>
    </EmailLayout>
  );
}
