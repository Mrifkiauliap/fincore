import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@fincore/db",
    "@fincore/config",
    "@fincore/utils",
    "@fincore/shared",
  ],
};

export default nextConfig;
