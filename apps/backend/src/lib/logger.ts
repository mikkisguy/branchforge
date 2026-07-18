/**
 * Structured Logger Utility
 *
 * Provides a centralized logging interface for services and other modules
 * that don't have access to Fastify's request.log.
 *
 * Uses pino (Fastify's default logger) for consistent JSON-formatted logs.
 */

import pino, { type LoggerOptions } from "pino";

// Pino's valid log levels
const VALID_LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
] as const;

/**
 * Validate that a value is a valid pino log level
 */
function isValidLogLevel(value: string): value is pino.Level {
  return VALID_LOG_LEVELS.includes(value as pino.Level);
}

// Determine log level from environment, validating against pino's known levels
const rawLogLevel = process.env.LOG_LEVEL ?? "info";
const logLevel: pino.Level = isValidLogLevel(rawLogLevel)
  ? rawLogLevel
  : "info";

// Sensitive field names to redact from logs
const SENSITIVE_FIELDS = [
  "password",
  "token",
  "secret",
  "apiKey",
  "api_key",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "sessionSecret",
  "session_secret",
  "authorization",
  "cookie",
  "cookies",
  "credentials",
  "privateKey",
  "private_key",
] as const;

// Build redaction paths for both top-level and nested fields
// See: https://getpino.io/#/docs/api?id=options
const redactPaths = SENSITIVE_FIELDS.flatMap((field) => [
  field, // top-level
  `*.${field}`, // one level deep (e.g., req.password, body.password)
  `**.${field}`, // any depth (nested objects)
]);

// Additional paths for common HTTP/logging patterns
const ADDITIONAL_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "request.headers.authorization",
  "request.headers.cookie",
  "response.headers.cookie",
] as const;

// Logger configuration - matches Fastify's default settings
const options: LoggerOptions = {
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redact sensitive fields from logs - includes top-level, nested, and HTTP-specific paths
  redact: [...redactPaths, ...ADDITIONAL_REDACT_PATHS],
  // Use pretty print for development
  transport:
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        }
      : undefined,
};

/**
 * Central logger instance for services
 */
export const logger = pino(options);

/**
 * Structured event types for consistent logging
 */
export const LogEventType = {
  // Image processing events
  IMAGE_PROCESSING_FAILURE: "image_processing.failure",
  IMAGE_PROCESSING_SUCCESS: "image_processing.success",
  IMAGE_PROCESSING_SECURITY_ALERT: "image_processing.security_alert",
  IMAGE_PROCESSING_VALIDATION_ERROR: "image_processing.validation_error",

  // General security events
  SECURITY_PATH_TRAVERSAL: "security.path_traversal",
  SECURITY_INVALID_PATH: "security.invalid_path",
  SECURITY_SSRF_REFUSAL: "security.ssrf_refusal",

  // Service lifecycle events - general operational states
  SERVICE_START: "service.start",
  // SERVICE_STOP: General/intentional stop signal for normal service lifecycle events
  SERVICE_STOP: "service.stop",
  // SERVICE_ERROR: Runtime/operational errors during normal service operation
  SERVICE_ERROR: "service.error",

  // Authentication events
  AUTH_LOGIN_SUCCESS: "auth.login_success",
  AUTH_LOGIN_FAILURE: "auth.login_failure",
  AUTH_LOGOUT: "auth.logout",
  AUTH_SESSION_CREATED: "auth.session_created",
  AUTH_SESSION_DESTROYED: "auth.session_destroyed",
  AUTH_REGISTRATION_SUCCESS: "auth.registration_success",
  AUTH_REGISTRATION_FAILURE: "auth.registration_failure",
  AUTH_SESSION_INVALID: "auth.session_invalid",

  // Authorization events
  AUTHZ_CHECK_SUCCESS: "authz.check_success",
  AUTHZ_CHECK_FAILURE: "authz.check_failure",
  AUTHZ_UNEXPECTED_ROLE: "authz.unexpected_role",

  // Validation events
  VALIDATION_WARNING: "validation.warning",

  // Database events
  DB_CONNECTION_ERROR: "db.connection_error",
  DB_POOL_CREATED: "db.pool_created",
  DB_POOL_CLOSING_ERROR: "db.pool_closing_error",
  DB_QUERY_SLOW: "db.query_slow",

  // Session store events
  SESSION_STORE_ERROR: "session_store.error",
  SESSION_STORE_VALIDATION: "session_store.validation",
  SESSION_STORE_CLEANUP: "session_store.cleanup",
  SESSION_STORE_DEAD_LETTER: "session_store.dead_letter",

  // Service lifecycle events - controlled shutdown sequence
  // SERVICE_SHUTDOWN_START: Marks the beginning of the controlled shutdown sequence
  SERVICE_SHUTDOWN_START: "service.shutdown_start",
  // SERVICE_SHUTDOWN_STEP: Logs individual steps within the shutdown sequence
  SERVICE_SHUTDOWN_STEP: "service.shutdown_step",
  // SERVICE_SHUTDOWN_COMPLETE: Marks successful completion of the shutdown sequence
  SERVICE_SHUTDOWN_COMPLETE: "service.shutdown_complete",
  // SERVICE_SHUTDOWN_ERROR: Reserved for errors that occur specifically during the shutdown sequence
  SERVICE_SHUTDOWN_ERROR: "service.shutdown_error",

  // External API events
  EXTERNAL_API_REQUEST: "external_api.request",
  EXTERNAL_API_RESPONSE: "external_api.response",
  EXTERNAL_API_ERROR: "external_api.error",
} as const;

/**
 * Log a security event with elevated severity
 */
export function logSecurityEvent(
  event: string,
  details: Record<string, unknown>,
  error?: unknown
): void {
  const errorDetails = error
    ? {
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && { stack: error.stack }),
      }
    : {};

  logger.error(
    {
      ...details,
      ...errorDetails,
      event,
      severity: "security",
    },
    `Security: ${event}`
  );
}

/**
 * Log an error with structured context
 */
export function logError(
  event: string,
  details: Record<string, unknown>,
  error?: unknown
): void {
  const errorDetails = error
    ? {
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && { stack: error.stack }),
      }
    : {};

  logger.error({
    ...details,
    ...errorDetails,
    event,
  });
}

/**
 * Log a warning with structured context
 */
export function logWarn(event: string, details: Record<string, unknown>): void {
  logger.warn({
    ...details,
    event,
  });
}

/**
 * Log an info event with structured context
 */
export function logInfo(event: string, details: Record<string, unknown>): void {
  logger.info({
    ...details,
    event,
  });
}

/**
 * Redact sensitive key names from log payloads
 * Returns a placeholder string for keys matching sensitive patterns
 *
 * Patterns are derived from SENSITIVE_FIELDS (the canonical list)
 * plus additional patterns for edge cases like 'email' and 'ssn'
 */
export function redactSensitiveKey(key: string): string {
  // Patterns derived from SENSITIVE_FIELDS - case-insensitive partial matches
  // This catches variants like userEmail, email_address, access_token, etc.
  const SENSITIVE_KEY_PATTERNS = [
    /password/i,
    /token/i,
    /secret/i,
    /apiKey|api_key/i,
    /accessToken|access_token/i,
    /refreshToken|refresh_token/i,
    /sessionSecret|session_secret/i,
    /authorization/i,
    /cookie/i,
    /credentials/i,
    /privateKey|private_key/i,
    // Additional patterns for edge cases not in SENSITIVE_FIELDS
    /email/i,
    /ssn/i,
  ];

  for (const pattern of SENSITIVE_KEY_PATTERNS) {
    if (pattern.test(key)) {
      return "[REDACTED]";
    }
  }

  return key;
}
