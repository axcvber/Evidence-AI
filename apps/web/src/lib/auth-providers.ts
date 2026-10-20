import { getAuthProviders, type SocialProviderId } from '@evidence/shared';
import { serverApi } from './api/server-api';

/** Social providers the API has OAuth apps for. Server-only; none if the API can't say. */
export async function getSocialProviders(): Promise<SocialProviderId[]> {
  try {
    return (await serverApi(getAuthProviders, {})).socialProviders;
  } catch {
    return [];
  }
}
