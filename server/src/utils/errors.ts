export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'SESSION_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DUPLICATE_DOCUMENT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'EMPTY_FILE'
  | 'ENCRYPTED_PDF'
  | 'CORRUPT_FILE'
  | 'PAGE_LIMIT_EXCEEDED'
  | 'DOCUMENT_NOT_READY'
  | 'DOCUMENT_PROCESSING_FAILED'
  | 'OCR_FAILED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_PROVIDER_ERROR'
  | 'AI_RATE_LIMITED'
  | 'AI_TIMEOUT'
  | 'AI_INVALID_OUTPUT'
  | 'AI_USAGE_LIMIT'
  | 'EMAIL_NOT_CONFIGURED'
  | 'INVALID_TOKEN'
  | 'DATABASE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly expose: boolean;

  constructor(status: number, code: ErrorCode, message: string, options?: { details?: unknown; expose?: boolean; cause?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = options?.details;
    this.expose = options?.expose ?? status < 500;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'VALIDATION_ERROR', message, { details });
  }
  static unauthorized(message = 'You need to sign in to continue.') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
  static sessionExpired() {
    return new AppError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  }
  static forbidden(message = 'You do not have access to this resource.') {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Resource not found.') {
    return new AppError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string, code: ErrorCode = 'CONFLICT') {
    return new AppError(409, code, message);
  }
  static internal(message = 'Something went wrong on our side.', cause?: unknown) {
    return new AppError(500, 'INTERNAL_ERROR', message, { cause, expose: false });
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
