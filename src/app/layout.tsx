import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MARK_WHITE_ON_BLACK, productName } from "@/lib/brand";
import { appUrl } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: productName(),
    template: `%s · ${productName()}`,
  },
  description: "Hosted docs and a Changelog for GitHub repos.",
  icons: {
    icon: [{ url: MARK_WHITE_ON_BLACK, type: "image/png" }],
    apple: [{ url: MARK_WHITE_ON_BLACK, type: "image/png" }],
  },
  openGraph: {
    description: "Hosted docs and a Changelog for GitHub repos.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
