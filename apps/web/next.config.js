/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@vitalpoint/near-phantom-auth'],
  output: 'standalone',
};

module.exports = nextConfig;
