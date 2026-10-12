import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EnvValidationError, parseEnv, serverEnvSchema } from './env.js';

const validServerEnv = {
  DATABASE_URL: 'postgresql://evidence_app:secret@localhost:5432/evidence',
  REDIS_URL: 'redis://:secret@localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'evidence-documents',
  S3_ACCESS_KEY_ID: 'minio',
  S3_SECRET_ACCESS_KEY: 'minio-secret',
  S3_FORCE_PATH_STYLE: 'true',
  LANGFUSE_BASE_URL: 'http://localhost:3100',
  LANGFUSE_PUBLIC_KEY: 'pk-lf-local',
  LANGFUSE_SECRET_KEY: 'sk-lf-local',
};

describe('parseEnv', () => {
  it('returns typed values with defaults applied', () => {
    const env = parseEnv(serverEnvSchema, validServerEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('lists every missing variable in one error', () => {
    const { DATABASE_URL: _db, REDIS_URL: _redis, ...rest } = validServerEnv;

    expect(() => parseEnv(serverEnvSchema, rest)).toThrow(/DATABASE_URL[\s\S]*REDIS_URL/);
  });

  it('rejects malformed values', () => {
    expect(() =>
      parseEnv(serverEnvSchema, { ...validServerEnv, DATABASE_URL: 'mysql://localhost/x' }),
    ).toThrow(EnvValidationError);
    expect(() =>
      parseEnv(serverEnvSchema, { ...validServerEnv, LANGFUSE_SECRET_KEY: 'pk-lf-wrong-kind' }),
    ).toThrow(/LANGFUSE_SECRET_KEY/);
  });

  it('never includes variable values in the error message', () => {
    const schema = z.object({ API_KEY: z.string().min(40) });

    let message = '';
    try {
      parseEnv(schema, { API_KEY: 'super-secret-value' });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('API_KEY');
    expect(message).not.toContain('super-secret-value');
  });
});
