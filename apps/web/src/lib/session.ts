import { MeResponse, meResponseSchema } from '@evidence/shared';
import { cookies } from 'next/headers';
import { getServerEnv } from '../env';

/** The signed-in user, read through the API with the browser's session cookie. Null if signed out. */
export async function getMe(): Promise<MeResponse | null> {
  const response = await fetch(`${getServerEnv().API_URL}/api/me`, {
    headers: { cookie: (await cookies()).toString() },
    cache: 'no-store',
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`GET /api/me failed with ${response.status}`);
  return meResponseSchema.parse(await response.json());
}
