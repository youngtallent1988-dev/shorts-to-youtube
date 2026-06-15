const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use the default Node server (not `output: "export"`) so the app
  // listens on process.env.PORT (Railway uses this for routing) and
  // behaves as a standard server container.
  //
  // "standalone" keeps the runtime minimal but does not change the
  // port or hosting model.
  output: "standalone",
  reactStrictMode: true,
  // Allow production builds to succeed even if there are ESLint warnings/errors.
  // This does NOT affect development (npm run dev) and can be removed once
  // all lint issues are cleaned up.
  eslint: {
    ignoreDuringBuilds: true,
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
  // Proxy all /api/* requests to the Flask backend so the browser never
  // makes a cross-origin request. The rewrite runs on the Next.js server,
  // which forwards the call to the Flask service and returns the response
  // to the client from the same origin — eliminating CORS errors.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://sailorai.app/api/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
