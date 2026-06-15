const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow production builds to succeed even if there are ESLint warnings/errors.
  // This does NOT affect development (npm run dev) and can be removed once
  // all lint issues are cleaned up.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Proxy /api/* requests to the Flask backend so the browser never
  // crosses origins and Server Actions continue to work correctly.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://sailorai.app/api/:path*",
      },
    ];
  },
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
};

module.exports = nextConfig;
