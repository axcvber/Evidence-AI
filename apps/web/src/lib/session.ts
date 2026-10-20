import { getMe, MeResponse } from '@evidence/shared';
import { isApiError } from './api/api-error';
import { serverApi } from './api/server-api';

/** The signed-in user and active workspace, or null when signed out. Server-only. */
export async function getCurrentUser(): Promise<MeResponse | null> {
  try {
    return await serverApi(getMe, {});
  } catch (error) {
    if (isApiError(error) && error.status === 401) return null;
    throw error;
  }
}
