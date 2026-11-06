import { Text } from "react-email";
import { productName } from "@/lib/brand";
import {
  EmailButton,
  EmailLayout,
  EmailParagraph,
} from "@/lib/email/templates/layout";

function previewFor(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 140);
}

export function AnnouncementEmail({
  title,
  body,
  appUrl,
  preferences,
}: {
  title: string;
  body: string;
  appUrl: string;
  preferences?: {
    manageUrl: string;
    unsubscribeUrl: string;
  };
}) {
  return (
    <EmailLayout
      preview={previewFor(body)}
      heading={title}
      appUrl={appUrl}
      reason={`You received this because you have a ${productName()} beta account.`}
      preferences={preferences}
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
      <EmailParagraph>Open {productName()} to see what is new in your workspace.</EmailParagraph>
      <EmailButton href={`${appUrl.replace(/\/$/, "")}/dashboard`} label={`Open ${productName()}`} />
    </EmailLayout>
  );
}
