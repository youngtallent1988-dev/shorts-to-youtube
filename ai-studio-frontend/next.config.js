const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produce a standalone bundle to keep the runtime lightweight and
  // easier to deploy on platforms like Railway.
  output: "standalone",

  // Next 16 uses Turbopack by default. Provide an empty Turbopack
  // config so we can continue to use a small custom webpack alias
  // without hitting the "webpack config and no turbopack" error.
  turbopack: {},

  // Ensure Webpack can resolve the same "@/*" alias that TypeScript uses
  // (configured in tsconfig.json). This makes imports like
  // `import { API_BASE } from "@/lib/apiBase";` work reliably in all
  // environments, including Railway.
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias["@"] = path.resolve(__dirname);
    return config;
  },
  // Proxy any frontend request to "/api/:path*".
  // - In development, hit the local Flask backend on 127.0.0.1:5001
  //   (using 127.0.0.1 instead of "localhost" avoids Mac proxy loops).
  // - In production, use NEXT_PUBLIC_API_URL (or default to https://sailorai.app)
  //   so the hosted site talks to the real backend instead of 127.0.0.1.
  async rewrites() {
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      return [
        {
          source: "/api/:path*",
          destination: "http://127.0.0.1:5001/api/:path*",
        },
      ];
    }

    const targetBase = (process.env.NEXT_PUBLIC_API_URL || "https://sailorai.app").replace(/\/+$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${targetBase}/api/:path*`,
      },
    ];
  },
};

// Export the full Next.js config (including standalone output,
// webpack alias, and rewrites) so Railway and other runtimes use
// the correct settings when running `next build` / `next start`.
module.exports = nextConfig;
