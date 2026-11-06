import { NextResponse } from "next/server";
import { productName } from "@/lib/brand";
import {
  readEmailPreferenceToken,
  setAnnouncementPreference,
} from "@/lib/email/preferences";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/email/preferences?error=invalid", request.url));
  }
  return NextResponse.redirect(
    new URL(`/email/preferences?token=${encodeURIComponent(token)}`, request.url),
  );
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const email = readEmailPreferenceToken(token);
  if (!email) {
    return new NextResponse("Invalid unsubscribe link.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const result = await setAnnouncementPreference(email, false);
  if (result.state !== "ok") {
    return new NextResponse("Email preferences are unavailable.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new NextResponse(`Unsubscribed from ${productName()} product updates.`, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
