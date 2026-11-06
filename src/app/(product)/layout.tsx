import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { MARK_WHITE_ON_BLACK } from "@/lib/brand";
import { AppToaster } from "@/components/ui/app-toaster";
import { normalizeTheme, THEME_COOKIE } from "@/lib/theme";

export const metadata: Metadata = {
  icons: {
    icon: [{ url: MARK_WHITE_ON_BLACK, type: "image/png" }],
    apple: [{ url: MARK_WHITE_ON_BLACK, type: "image/png" }],
  },
  openGraph: {
    description: "Hosted docs and a Changelog for GitHub repos.",
    images: [
      {
        url: "/dokks_brand_kit/lockup/landscape/static/dokks_lockup_landscape_blue_on_white.png",
      },
    ],
  },
};

export default async function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <ThemeProvider initialTheme={theme}>
      {children}
      <Suspense fallback={null}>
        <AppToaster />
      </Suspense>
    </ThemeProvider>
  );
}
