import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { validateWebEnv } from './src/env';

// One .env at the repo root serves compose and every app. Real deployments inject env vars directly.
const rootEnvFile = path.resolve(process.cwd(), '../../.env');
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

validateWebEnv();

const nextConfig: NextConfig = {
  transpilePackages: ['@evidence/shared'],
};

export default nextConfig;
