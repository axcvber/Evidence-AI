import { describe, expect, it } from 'vitest';
import { socialProviderCredentials } from '../src/env.js';
import { testApiEnv } from './support/env.js';

describe('API env', () => {
  it('allows logging emails instead of sending them outside production', () => {
    expect(testApiEnv({ NODE_ENV: 'development' }).RESEND_API_KEY).toBeUndefined();
  });

  it('requires a Resend key in production', () => {
    const production = { NODE_ENV: 'production', CLIENT_IP_HEADER: 'x-forwarded-for' };
    expect(() => testApiEnv(production)).toThrow(/RESEND_API_KEY/);
    expect(testApiEnv({ ...production, RESEND_API_KEY: 're_test' }).RESEND_API_KEY).toBe('re_test');
  });

  it('rejects a short auth secret', () => {
    expect(() => testApiEnv({ BETTER_AUTH_SECRET: 'too-short' })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it.each(['Evidence AI <evidence@dev.axlisovsky.com>', 'evidence@dev.axlisovsky.com'])(
    'accepts EMAIL_FROM %s',
    (from) => {
      expect(testApiEnv({ EMAIL_FROM: from }).EMAIL_FROM).toBe(from);
    },
  );

  it.each(['Evidence AI', 'Evidence AI <not-an-email>', '<>'])('rejects EMAIL_FROM %s', (from) => {
    expect(() => testApiEnv({ EMAIL_FROM: from })).toThrow(/EMAIL_FROM/);
  });

  it('requires an explicit client IP header in production', () => {
    const production = { NODE_ENV: 'production', RESEND_API_KEY: 're_test' };
    expect(() => testApiEnv(production)).toThrow(/CLIENT_IP_HEADER/);
    expect(
      testApiEnv({ ...production, CLIENT_IP_HEADER: 'cloudfront-viewer-address' }),
    ).toBeTruthy();
  });

  it('never allows turning auth rate limits off in production', () => {
    expect(() =>
      testApiEnv({
        NODE_ENV: 'production',
        RESEND_API_KEY: 're_test',
        CLIENT_IP_HEADER: 'x-forwarded-for',
        AUTH_RATE_LIMIT_ENABLED: 'false',
      }),
    ).toThrow(/AUTH_RATE_LIMIT_ENABLED/);
  });

  it('parses trusted proxies as a list', () => {
    expect(testApiEnv({ TRUSTED_PROXIES: '10.0.0.1, 10.0.1.0/24' }).TRUSTED_PROXIES).toEqual([
      '10.0.0.1',
      '10.0.1.0/24',
    ]);
  });
});

describe('social sign-in env', () => {
  it('enables a provider only when both its client ID and secret are set', () => {
    expect(socialProviderCredentials(testApiEnv())).toEqual({});
    expect(
      socialProviderCredentials(
        testApiEnv({ GITHUB_CLIENT_ID: 'gh-id', GITHUB_CLIENT_SECRET: 'gh-secret' }),
      ),
    ).toEqual({ github: { clientId: 'gh-id', clientSecret: 'gh-secret' } });
  });

  it.each([
    { GOOGLE_CLIENT_ID: 'id' },
    { GOOGLE_CLIENT_SECRET: 'secret' },
    { GITHUB_CLIENT_ID: 'id' },
    { GITHUB_CLIENT_SECRET: 'secret' },
  ])('rejects half a provider config: %o', (half) => {
    expect(() => testApiEnv(half)).toThrow(/Set both/);
  });
});
