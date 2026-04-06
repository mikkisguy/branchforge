/**
 * Centralized Application Configuration
 *
 * Provides configuration values with validation to ensure
 * required environment variables are set.
 */

/**
 * Get the API base path for URL construction.
 *
 * @throws {Error} If BASE_PATH environment variable is not set
 * @returns The configured base path
 */
export function getBasePath(): string {
  const basePath = process.env.BASE_PATH?.trim();

  if (!basePath) {
    throw new Error(
      "BASE_PATH environment variable is required but not set. " +
        "Please set BASE_PATH in your environment."
    );
  }

  // Ensure consistent trailing slash
  return basePath.endsWith("/") ? basePath : `${basePath}/`;
}
