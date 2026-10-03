/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build a review preview without replacing an active local demo's assets.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: __dirname,
  experimental: {
    serverActions: { bodySizeLimit: '50mb' }
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, 'src')
    };
    return config;
  }
};

module.exports = nextConfig;
