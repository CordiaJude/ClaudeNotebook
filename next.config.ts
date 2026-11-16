import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The headless browser used for PDF export is loaded from node_modules at run time, not bundled.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  // Deck PDFs embed the design system's fonts; the font files are read from node_modules at run time.
  outputFileTracingIncludes: { "/api/exports": ["./node_modules/@fontsource-variable/*/files/*-latin-wght-*.woff2"] },
};
export default config;
