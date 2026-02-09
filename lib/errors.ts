/**
 * Production-ready error handling: custom error type, API contract, and client parser.
 * Use AppError for consistent handling; use reportError for logging/monitoring.
 */

/** Standard API error response shape (used by route helpers and client parser). */
export type ApiErrorPayload = {
  error: string;
  code?: string;
  /** Present in development or when explicitly added for debugging; never expose in production 500. */
  requestId?: string;
  details?: unknown;
};

/** HTTP status codes we use in API responses. */
export type ApiStatusCode = 400 | 401 | 403 | 404 | 409 | 422 | 500;

/**
 * Custom application error with status and optional code for client handling.
 * Message is safe to show to users when from API (validated server-side).
 */
export class AppError extends Error {
  readonly status: ApiStatusCode;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    message: string,
    options: {
      status?: ApiStatusCode;
      code?: string;
      requestId?: string;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = "AppError";
    this.status = options.status ?? 500;
    this.code = options.code;
    this.requestId = options.requestId;
    if (options.cause !== undefined) this.cause = options.cause;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /** Whether this error is a client fault (4xx). */
  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /** Whether this error is a server fault (5xx). */
  isServerError(): boolean {
    return this.status >= 500;
  }
}

/** User-facing message for 500 in production (no internal details). */
export const GENERIC_SERVER_MESSAGE = "Something went wrong. Please try again later.";

const isProd = process.env.NODE_ENV === "production";

/**
 * Build a standard JSON error response for API routes.
 * For 500, message is replaced with a generic one in production; full message is logged.
 */
export function apiErrorResponse(
  message: string,
  status: ApiStatusCode,
  options?: { code?: string; requestId?: string; details?: unknown }
): Response {
  const payload: ApiErrorPayload = {
    error: status === 500 && isProd ? GENERIC_SERVER_MESSAGE : message,
    ...(options?.code && { code: options.code }),
    ...(options?.requestId && { requestId: options.requestId }),
    ...(options?.details !== undefined && { details: options.details }),
  };
  if (status === 500) {
    reportError(new AppError(message, { status, ...options }));
  }
  return Response.json(payload, { status });
}

/**
 * Parse a fetch Response: on !res.ok, read JSON when possible and throw AppError with user-safe message.
 * Use for all client-side API calls so errors are consistent and safe to display.
 */
export async function parseApiResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (res.ok) {
    const contentType = res.headers.get("content-type");
    if (contentType?.includes("application/json")) return res.json() as Promise<T>;
    return undefined as T;
  }

  let payload: ApiErrorPayload | null = null;
  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    try {
      payload = (await res.json()) as ApiErrorPayload;
    } catch {
      // body was not valid JSON
    }
  }

  const message =
    payload?.error && typeof payload.error === "string"
      ? payload.error
      : res.status === 500 && isProd
        ? GENERIC_SERVER_MESSAGE
        : fallbackMessage;

  throw new AppError(message, {
    status: res.status as ApiStatusCode,
    code: payload?.code,
    requestId: payload?.requestId,
  });
}

/**
 * Report an error for logging/monitoring. Replace this implementation with Sentry or your logger.
 * In production, avoid logging PII; log requestId, code, and status instead of full message when appropriate.
 */
export function reportError(error: unknown): void {
  if (process.env.NODE_ENV === "test") return;
  // eslint-disable-next-line no-console
  console.error("[reportError]", error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) {
    // eslint-disable-next-line no-console
    console.error(error.stack);
  }
}

/**
 * Run an async route handler; on thrown error, return 500 with generic message and log.
 * Use for API route handlers so uncaught exceptions don't leak stack to the client.
 */
export async function withRouteErrorHandling<T>(
  handler: () => Promise<Response>,
  requestId?: string
): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    const id = requestId ?? crypto.randomUUID();
    const message = err instanceof Error ? err.message : "Unhandled error";
    reportError(err instanceof Error ? err : new Error(String(err)));
    return apiErrorResponse(message, 500, { requestId: id });
  }
}

/**
 * Type guard: check if value is AppError.
 */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Get a user-safe message from an unknown error (for UI display).
 */
export function getErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (isAppError(error)) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}
