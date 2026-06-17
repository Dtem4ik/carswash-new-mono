import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // @carswash/shared ships raw TypeScript (workspace package); transpile it.
  transpilePackages: ["@carswash/shared"],
};

// Wire next-intl's request config (cookie-based locale, no i18n routing).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
