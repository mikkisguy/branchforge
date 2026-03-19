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

  // Service events
  SERVICE_ERROR: "service.error",
  SERVICE_START: "service.start",
  SERVICE_STOP: "service.stop",
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
