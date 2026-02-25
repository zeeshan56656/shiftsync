import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Prisma 7 uses a WASM-based client generator ("prisma-client").
   * Without this, Next.js webpack tries to bundle the WASM binary and hangs
   * indefinitely during `next build`. Marking these as server-external tells
   * Next.js to require() them as native Node modules instead of bundling.
   *
   * Reference: https://www.prisma.io/docs/orm/more/help-and-troubleshooting/nextjs-help
   */
  serverExternalPackages: ["@prisma/client", "prisma", "@prisma/adapter-pg", "pg"],
};

export default nextConfig;
