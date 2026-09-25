import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel expects the standard `.next` output directory in production.
  // Keep the separate dev directory locally to avoid collisions with production builds.
  distDir: process.env.NODE_ENV === "production" ? ".next" : ".next-dev",
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
