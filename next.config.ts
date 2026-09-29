import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
