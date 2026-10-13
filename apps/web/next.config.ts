import type { NextConfig } from 'next';
import { validateWebEnv } from './src/env';

// Next loads apps/web/.env.local itself; fail fast here if anything is missing or malformed.
validateWebEnv();

const nextConfig: NextConfig = {
  transpilePackages: ['@evidence/shared'],
};

export default nextConfig;
