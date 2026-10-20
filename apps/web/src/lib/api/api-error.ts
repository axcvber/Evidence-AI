import { apiErrorSchema } from '@evidence/shared';

/** An error response from our API, in its shared shape (see `apiErrorSchema`). */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
    if (parsed.success) {
      const { statusCode, code, message, details, requestId } = parsed.data;
      return new ApiError(statusCode, code, message, details, requestId);
    }
    return new ApiError(
      response.status,
      `HTTP_${response.status}`,
      response.statusText || 'Request failed',
      undefined,
      response.headers.get('x-request-id') ?? undefined,
    );
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}
