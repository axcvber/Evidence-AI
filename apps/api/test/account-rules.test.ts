import { describe, expect, it } from 'vitest';
import { normalizeProfileInput, rejectUnverifiedSocialSignUp } from '../src/auth/account-rules.js';
import { changeEmailApprovalEmail, passwordChangedEmail } from '../src/auth/emails.js';

describe('rejectUnverifiedSocialSignUp', () => {
  const oauthSignUp = { action: 'create-user', method: 'oauth' };

  it('refuses a new OAuth account whose email the provider has not verified', () => {
    expect(rejectUnverifiedSocialSignUp({ emailVerified: false }, oauthSignUp)).toMatchObject({
      error: 'email_not_verified',
    });
    expect(rejectUnverifiedSocialSignUp({}, oauthSignUp)).toBeDefined();
  });

  it('allows verified OAuth sign-ups and leaves other flows to their own rules', () => {
    expect(rejectUnverifiedSocialSignUp({ emailVerified: true }, oauthSignUp)).toBeUndefined();
    expect(
      rejectUnverifiedSocialSignUp(
        { emailVerified: false },
        { action: 'create-user', method: 'email-password' },
      ),
    ).toBeUndefined();
    expect(
      rejectUnverifiedSocialSignUp(
        { emailVerified: false },
        { action: 'sign-in', method: 'oauth' },
      ),
    ).toBeUndefined();
  });
});

describe('normalizeProfileInput', () => {
  it('trims the name', () => {
    expect(normalizeProfileInput({ name: '  Ada ', email: 'a@example.test' })).toEqual({
      name: 'Ada',
      email: 'a@example.test',
    });
  });

  it('accepts a normal name and an https avatar, or nothing at all', () => {
    expect(() =>
      normalizeProfileInput({ name: 'Ada', image: 'https://example.com/a.png' }),
    ).not.toThrow();
    expect(() => normalizeProfileInput({ image: null })).not.toThrow();
    expect(() => normalizeProfileInput(undefined)).not.toThrow();
  });

  it.each([{ name: '' }, { image: 'data:image/png;base64,AAAA' }, { image: 'ftp://x/y' }])(
    'rejects %o',
    (body) => {
      expect(() => normalizeProfileInput(body)).toThrow();
    },
  );
});

describe('account emails', () => {
  it('escapes user-controlled names in HTML', () => {
    const name = '<img src=x onerror=alert(1)>';
    for (const email of [
      passwordChangedEmail('a@example.test', name),
      changeEmailApprovalEmail({
        to: 'a@example.test',
        name,
        newEmail: 'b@example.test',
        url: 'http://localhost:3000/x?a=1&b=2',
      }),
    ]) {
      expect(email.html).not.toContain('<img');
      expect(email.html).toContain('&lt;img');
    }
  });
});
