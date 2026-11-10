import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ensure pdf-parse workers and Node canvas dependencies are available in Vercel functions.
  serverExternalPackages: ['pdf-parse','@napi-rs/canvas'],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 's3-eu-west-1.amazonaws.com',
        pathname: '/rentman-production/**',
      },
      {
        protocol: 'https',
        hostname: 'redirect.rentman.net',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
