import { z } from 'zod';

/** Display name rules, applied on sign-up and profile edits (API) and in the forms (web). */
export const userNameSchema = z.string().trim().min(1, 'Enter your name').max(100);

/** Minimum password length; Better Auth enforces it on sign-up, reset and change. */
export const MIN_PASSWORD_LENGTH = 12;

/** Social sign-in providers the API can enable (each only when its OAuth app is configured). */
export const socialProviderIds = ['google', 'github'] as const;
export type SocialProviderId = (typeof socialProviderIds)[number];
