/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  images: {
    domains: [
      "retail-unified-commerce.s3.amazonaws.com",
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'retail-unified-commerce.s3.us-east-1.amazonaws.com',
        // optional: allow all paths
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
