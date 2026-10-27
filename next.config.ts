import type { NextConfig } from "next";

const desktopExport = process.env.DESKTOP_EXPORT === "1";

const nextConfig: NextConfig = {
  output: desktopExport ? "export" : "standalone",
  images: desktopExport ? { unoptimized: true } : undefined,
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
};

export default nextConfig;
