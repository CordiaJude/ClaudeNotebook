import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The headless browser used for PDF export is loaded from node_modules at run time, not bundled.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
};
export default config;
