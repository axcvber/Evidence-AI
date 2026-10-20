import { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * One API endpoint, described once and used everywhere: the API registers the route, validates
 * input, documents it in OpenAPI and filters the response with it; the web app's typed client
 * builds the request and parses the response with it.
 *
 * `path` is relative to `/api` and uses `:name` for path parameters, e.g. `/groups/:groupId`.
 */
export interface EndpointDefinition {
  method: HttpMethod;
  path: `/${string}`;
  summary: string;
  params?: z.ZodObject<Record<string, z.ZodType>>;
  query?: z.ZodObject<Record<string, z.ZodType>>;
  body?: z.ZodType;
  response: z.ZodType;
  /** Success status code; defaults to 200 (201 for POST is set explicitly where it applies). */
  status?: number;
}

export function defineEndpoint<const T extends EndpointDefinition>(endpoint: T): T {
  return endpoint;
}

// `unknown` for parts an endpoint doesn't declare: `A & unknown` is just `A`.
type Part<T, K extends string> = T extends z.ZodType ? Record<K, z.input<T>> : unknown;

/** What a caller passes: only the parts the endpoint declares. */
export type EndpointInput<T extends EndpointDefinition> = Part<T['params'], 'params'> &
  Part<T['query'], 'query'> &
  Part<T['body'], 'body'>;

/** What a handler receives after validation (Zod output types, defaults applied). */
export interface ValidatedInput<T extends EndpointDefinition> {
  params: T['params'] extends z.ZodType ? z.output<T['params']> : undefined;
  query: T['query'] extends z.ZodType ? z.output<T['query']> : undefined;
  body: T['body'] extends z.ZodType ? z.output<T['body']> : undefined;
}

export type EndpointResponse<T extends EndpointDefinition> = z.output<T['response']>;

/** Fills `:name` segments of a contract path. Values are URI-encoded. */
export function buildPath(
  path: string,
  params: Record<string, string | number | undefined> = {},
): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path parameter "${name}"`);
    return encodeURIComponent(String(value));
  });
}
