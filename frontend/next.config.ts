import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  async rewrites() {
    return [{ source: "/:path*", destination: "http://localhost:4000/:path*" }];
  },
};

export default nextConfig;
