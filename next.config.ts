import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The project canonicalizes local dev on 127.0.0.1 (see redirects below), so
  // allow it as a dev origin — otherwise Next blocks HMR/client dev resources
  // and client components never hydrate locally. Dev-only; no production impact.
  allowedDevOrigins: ["127.0.0.1"],
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
