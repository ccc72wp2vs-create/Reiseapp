import type { ZodError } from 'zod';

export type ErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'version_conflict'
  | 'payload_too_large'
  | 'rate_limited'
  | 'csrf_failed'
  | 'setup_unavailable'
  | 'internal_error';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  version_conflict: 409,
  payload_too_large: 413,
  rate_limited: 429,
  csrf_failed: 403,
  setup_unavailable: 403,
  internal_error: 500,
};

/** Error with a stable machine-readable code; message is safe to show. */
export class ApiError extends Error {
  readonly status: number;
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export const notFound = (what = 'Ressource') => new ApiError('not_found', `${what} nicht gefunden`);
export const forbidden = (msg = 'Keine Berechtigung') => new ApiError('forbidden', msg);

export function fromZod(err: ZodError): ApiError {
  return new ApiError(
    'validation_failed',
    'Eingaben sind ungültig',
    err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
  );
}
