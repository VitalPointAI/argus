/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable static page caching for all pages
  // This ensures auth checks run on every request
  experimental: {
    // Disable ISR caching
    isrMemoryCacheSize: 0,
  },
  // Force all pages to be dynamic
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'no-store, must-revalidate',
        },
      ],
    },
  ],
};

module.exports = nextConfig;
