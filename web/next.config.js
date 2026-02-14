/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // snarkjs needs these Node.js polyfills in the browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      readline: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

module.exports = nextConfig;
