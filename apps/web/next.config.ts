import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @carswash/shared ships raw TypeScript (workspace package); transpile it.
  transpilePackages: ["@carswash/shared"],
};

export default nextConfig;
