/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  images: {
    domains: [
      "retail-unified-commerce.s3.amazonaws.com",
      'retail-unified-commerce.s3.us-east-1.amazonaws.com',
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'retail-unified-commerce.s3.us-east-1.amazonaws.com',
        pathname: '/**',
      }, 
      {
        protocol: 'https',
        hostname: 'd1n5xguust3bkl.cloudfront.net',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
