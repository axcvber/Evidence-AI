import type { EndpointDefinition, EndpointInput, EndpointResponse } from '@evidence/shared';
import { cookies } from 'next/headers';
import { getServerEnv } from '@/env';
import { callEndpoint } from './call-endpoint';

/**
 * Server Components and Server Actions: calls the API directly (API_URL) with the visitor's
 * cookies, so the API sees the same session as the browser.
 */
export async function serverApi<T extends EndpointDefinition>(
  contract: T,
  input: EndpointInput<T>,
): Promise<EndpointResponse<T>> {
  return callEndpoint(
    { baseUrl: getServerEnv().API_URL, headers: { cookie: (await cookies()).toString() } },
    contract,
    input,
  );
}
