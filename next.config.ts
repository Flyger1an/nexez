import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve("."),
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "localhost:3000" }],
        destination: "http://127.0.0.1:3000/:path*",
        permanent: false,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "localhost" }],
        destination: "http://127.0.0.1:3000/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
