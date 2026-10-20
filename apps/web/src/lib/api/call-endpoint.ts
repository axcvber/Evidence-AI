import type { EndpointDefinition, EndpointInput, EndpointResponse } from '@evidence/shared';
import { buildPath } from '@evidence/shared';
import { ApiError } from './api-error';

export interface Transport {
  /** Origin the request goes to; empty for same-origin calls from the browser. */
  baseUrl: string;
  headers?: Record<string, string>;
}

function queryString(query: object | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/**
 * Calls one API endpoint from its shared contract: builds the URL from the contract path,
 * sends the body as JSON, and parses the response with the contract's schema. Error responses
 * become ApiError. Server and browser code use this through `serverApi` and `browserApi`.
 */
export async function callEndpoint<T extends EndpointDefinition>(
  transport: Transport,
  contract: T,
  input: EndpointInput<T>,
): Promise<EndpointResponse<T>> {
  const parts = input as {
    params?: Record<string, string | number>;
    query?: object;
    body?: unknown;
  };
  const url = `${transport.baseUrl}/api${buildPath(contract.path, parts.params)}${queryString(parts.query)}`;
  const hasBody = parts.body !== undefined;

  const response = await fetch(url, {
    method: contract.method,
    headers: {
      Accept: 'application/json',
      ...(hasBody && { 'Content-Type': 'application/json' }),
      ...transport.headers,
    },
    ...(hasBody && { body: JSON.stringify(parts.body) }),
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!response.ok) throw await ApiError.fromResponse(response);
  return contract.response.parse(await response.json()) as EndpointResponse<T>;
}
