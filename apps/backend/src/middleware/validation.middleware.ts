/**
 * Validation Middleware
 *
 * Provides middleware functions for validating request data using Zod schemas.
 * Integrates with the global error handler for consistent error responses.
 *
 * Usage:
 *   fastify.post('/route', {
 *     onRequest: authenticate,
 *     preValidation: validateBody(registerSchema),
 *   }, handler);
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { ValidationError } from "./error-handler.middleware.js";

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Extract the inferred type from a Zod schema
 */
export type InferSchema<T extends z.ZodTypeAny> = z.infer<T>;

// ============================================================================
// Validation Middleware
// ============================================================================

/**
 * Middleware to validate request body using a Zod schema
 *
 * @param schema - The Zod schema to validate against
 * @returns Fastify onRequest/preValidation hook function
 *
 * @example
 * ```ts
 * fastify.post('/register', {
 *   preValidation: validateBody(registerSchema),
 * }, registerHandler);
 * ```
 */
export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest) => {
    try {
      // Parse and validate the request body
      const validatedData = schema.parse(request.body);

      // Replace the request body with the validated data
      // This ensures type safety in route handlers
      request.body = validatedData as typeof request.body;
    } catch (error) {
      // Throw a ValidationError that will be caught by the global error handler
      if (error instanceof Error && error.name === "ZodError") {
        throw new ValidationError("Invalid request data", error);
      }
      throw new ValidationError("Invalid request data", error);
    }
  };
}

/**
 * Middleware to validate request query parameters using a Zod schema
 *
 * @param schema - The Zod schema to validate against
 * @returns Fastify onRequest/preValidation hook function
 *
 * @example
 * ```ts
 * fastify.get('/scenes', {
 *   preValidation: validateQuery(listScenesQuerySchema),
 * }, listScenesHandler);
 * ```
 */
export function validateQuery<T extends z.ZodTypeAny>(
  schema: T,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest) => {
    try {
      // Parse and validate the request query
      const validatedData = schema.parse(request.query);

      // Replace the request query with the validated data
      request.query = validatedData as typeof request.query;
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        throw new ValidationError("Invalid query parameters", error);
      }
      throw new ValidationError("Invalid query parameters", error);
    }
  };
}

/**
 * Middleware to validate request params using a Zod schema
 *
 * @param schema - The Zod schema to validate against
 * @returns Fastify onRequest/preValidation hook function
 *
 * @example
 * ```ts
 * fastify.get('/projects/:id', {
 *   preValidation: validateParams(projectIdParamsSchema),
 * }, getProjectHandler);
 * ```
 */
export function validateParams<T extends z.ZodTypeAny>(
  schema: T,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest) => {
    try {
      // Parse and validate the request params
      const validatedData = schema.parse(request.params);

      // Replace the request params with the validated data
      request.params = validatedData as typeof request.params;
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        throw new ValidationError("Invalid URL parameters", error);
      }
      throw new ValidationError("Invalid URL parameters", error);
    }
  };
}

/**
 * Middleware to validate multiple parts of the request
 *
 * @param options - Object with optional schemas for body, query, and params
 * @returns Fastify onRequest/preValidation hook function
 *
 * @example
 * ```ts
 * fastify.post('/scenes/:sceneId', {
 *   preValidation: validateRequest({
 *     params: sceneIdParamsSchema,
 *     body: updateSceneSchema,
 *   }),
 * }, updateSceneHandler);
 * ```
 */
export function validateRequest<
  BodySchema extends z.ZodTypeAny = z.ZodNever,
  QuerySchema extends z.ZodTypeAny = z.ZodNever,
  ParamsSchema extends z.ZodTypeAny = z.ZodNever,
>(options: {
  body?: BodySchema;
  query?: QuerySchema;
  params?: ParamsSchema;
}): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest) => {
    const bodyResult =
      options.body && options.body instanceof z.ZodType
        ? options.body.safeParse(request.body)
        : null;
    const queryResult =
      options.query && options.query instanceof z.ZodType
        ? options.query.safeParse(request.query)
        : null;
    const paramsResult =
      options.params && options.params instanceof z.ZodType
        ? options.params.safeParse(request.params)
        : null;

    if (bodyResult && !bodyResult.success) {
      throw new ValidationError("Invalid request body", bodyResult.error);
    }
    if (queryResult && !queryResult.success) {
      throw new ValidationError("Invalid query parameters", queryResult.error);
    }
    if (paramsResult && !paramsResult.success) {
      throw new ValidationError("Invalid URL parameters", paramsResult.error);
    }

    // Only mutate the request object after all validations succeed.
    if (bodyResult?.success) {
      request.body = bodyResult.data as typeof request.body;
    }

    if (queryResult?.success) {
      request.query = queryResult.data as typeof request.query;
    }

    if (paramsResult?.success) {
      request.params = paramsResult.data as typeof request.params;
    }
  };
}

/**
 * Middleware to validate request headers using a Zod schema
 *
 * @param schema - The Zod schema to validate against
 * @returns Fastify onRequest/preValidation hook function
 *
 * @example
 * ```ts
 * fastify.post('/import', {
 *   onRequest: [authenticate, validateHeaders(importHeadersSchema)],
 * }, importHandler);
 * ```
 */
export function validateHeaders<T extends z.ZodTypeAny>(
  schema: T,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest) => {
    try {
      // Parse and validate the request headers
      const validatedData = schema.parse(request.headers);

      // Replace the request headers with the validated data
      request.headers = validatedData as typeof request.headers;
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        throw new ValidationError("Invalid request headers", error);
      }
      throw new ValidationError("Invalid request headers", error);
    }
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

// Re-export canonical validation helpers for consumers that import from middleware.
export { validateData, safeValidateData } from "../lib/validation.js";

