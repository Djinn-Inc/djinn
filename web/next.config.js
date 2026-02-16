// Validate contract addresses at build time in production (warn only — fatal when STRICT_ENV_CHECK=1)
if (process.env.NODE_ENV === "production") {
  const addressPattern = /^0x[0-9a-fA-F]{40}$/;
  const required = [
    "NEXT_PUBLIC_USDC_ADDRESS",
    "NEXT_PUBLIC_ESCROW_ADDRESS",
    "NEXT_PUBLIC_SIGNAL_COMMITMENT_ADDRESS",
    "NEXT_PUBLIC_COLLATERAL_ADDRESS",
    "NEXT_PUBLIC_CREDIT_LEDGER_ADDRESS",
    "NEXT_PUBLIC_ACCOUNT_ADDRESS",
  ];
  const strict = process.env.STRICT_ENV_CHECK === "1";
  for (const key of required) {
    const val = process.env[key];
    if (!val || !addressPattern.test(val)) {
      const msg = `${key} is missing or invalid (expected 0x-prefixed 40-hex address, got: ${val || "undefined"})`;
      if (strict) {
        throw new Error(msg);
      }
      console.warn(`[Djinn] WARNING: ${msg}`);
    }
  }
}

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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: wss:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
