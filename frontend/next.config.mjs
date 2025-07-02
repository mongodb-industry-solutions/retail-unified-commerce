/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'retail-unified-commerce-product-images.s3.eu-west-1.amazonaws.com',
      'retail-unified-commerce-product-images.s3.us-east-1.amazonaws.com',
      'retail-unified-commerce.s3.amazonaws.com'
    ],
  },
};

export default nextConfig;
