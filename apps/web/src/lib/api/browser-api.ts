import type { EndpointDefinition, EndpointInput, EndpointResponse } from '@evidence/shared';
import { callEndpoint } from './call-endpoint';

/** Client Components: same-origin `/api/*`, proxied to the API with the session cookie. */
export function browserApi<T extends EndpointDefinition>(
  contract: T,
  input: EndpointInput<T>,
): Promise<EndpointResponse<T>> {
  return callEndpoint({ baseUrl: '' }, contract, input);
}
