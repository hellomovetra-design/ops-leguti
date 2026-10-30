import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel expects the standard `.next` output directory in production.
  // Keep the separate dev directory locally to avoid collisions with production builds.
  distDir: process.env.NODE_ENV === "production" ? ".next" : ".next-dev",
  outputFileTracingIncludes: { "/api/courier-master": ["./assets/templates/courier-master.xlsx"], "/api/ops-desk": ["./assets/templates/employee-structure.xlsx"],"/api/employee-sanctions/workflow":["./assets/templates/sanction-jne-logo.jpg"] },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
