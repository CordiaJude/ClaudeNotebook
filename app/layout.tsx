import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = { title: BRAND.name, description: BRAND.tagline };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
