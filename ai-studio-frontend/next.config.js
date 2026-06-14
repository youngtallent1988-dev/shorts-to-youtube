/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow production builds to succeed even if there are ESLint warnings/errors.
  // This does NOT affect development (npm run dev) and can be removed once
  // all lint issues are cleaned up.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
