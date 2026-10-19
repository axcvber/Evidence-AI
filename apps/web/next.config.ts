import type { NextConfig } from 'next';
import { getServerEnv } from './src/env';

// Next loads apps/web/.env.local itself; fail fast here if anything is missing or malformed.
const env = getServerEnv();

const nextConfig: NextConfig = {
  transpilePackages: ['@evidence/shared'],
  // The browser only ever talks to this origin. /api/* (including Better Auth at /api/auth)
  // is proxied to the API, so the session cookie is first-party and no CORS is needed.
  // In production CloudFront routes /api/* to the API directly (step 1.9).
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${env.API_URL}/api/:path*` }]);
  },
};

export default nextConfig;
