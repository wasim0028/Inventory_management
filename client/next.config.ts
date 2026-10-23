import type { NextConfig } from "next";

// Static export: the whole UI is plain files in out/, hosted on Amplify Hosting or S3.
// All data comes from the API Gateway endpoint at runtime.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
