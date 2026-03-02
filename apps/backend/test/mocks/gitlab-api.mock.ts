/**
 * GitLab API Mocks
 *
 * Mock GitLab API responses using nock for testing.
 * Provides fixtures and helper functions for common GitLab API scenarios.
 */

import nock from "nock";
import { testFixtures } from "../setup.js";

// Base GitLab URL for mocking
const GITLAB_URL = "https://gitlab.test";
const GITLAB_API_BASE = `${GITLAB_URL}/api/v4`;

/**
 * Mock successful GitLab token validation
 * Returns user info when token is valid
 */
export function mockValidToken(token: string = testFixtures.gitlab.validToken) {
  return nock(GITLAB_API_BASE)
    .get("/user")
    .matchHeader("private-token", token)
    .reply(200, {
      id: 123456,
      username: "testuser",
      name: "Test User",
      email: "testuser@example.com",
    });
}

/**
 * Mock failed GitLab token validation (401)
 */
export function mockInvalidToken(
  token: string = testFixtures.gitlab.invalidToken,
) {
  return nock(GITLAB_API_BASE)
    .get("/user")
    .matchHeader("private-token", token)
    .reply(401, {
      message: "401 Unauthorized",
    });
}

/**
 * Mock GitLab projects list endpoint
 */
export function mockProjectsList(
  token: string = testFixtures.gitlab.validToken,
  projects: any[] = [
    {
      id: testFixtures.gitlab.projectId,
      name: testFixtures.gitlab.projectName,
      path_with_namespace: testFixtures.gitlab.projectPath,
      default_branch: testFixtures.gitlab.branch,
      http_url_to_repo: `${GITLAB_URL}/user/test-repo.git`,
    },
  ],
) {
  return nock(GITLAB_API_BASE)
    .get("/projects")
    .matchHeader("private-token", token)
    .query({ membership: "true" })
    .reply(200, projects);
}

/** Mock GitLab paginated projects list */
export function mockPaginatedProjectsList(
  token: string = testFixtures.gitlab.validToken,
  page1Projects: any[] = [],
  page2Projects: any[] = []
) {
  const scope1 = nock(GITLAB_API_BASE)
    .get('/projects')
    .matchHeader('private-token', token)
    .query({ membership: 'true', page: '1', per_page: '20' })
    .reply(200, page1Projects, {
      'X-Total': '2',
      'X-Total-Pages': '2',
      'X-Per-Page': '20',
      'X-Page': '1',
      'X-Next-Page': '2',
    });

  const scope2 = nock(GITLAB_API_BASE)
    .get('/projects')
    .matchHeader('private-token', token)
    .query({ membership: 'true', page: '2', per_page: '20' })
    .reply(200, page2Projects, {
      'X-Total': '2',
      'X-Total-Pages': '2',
      'X-Per-Page': '20',
      'X-Page': '2',
    });

  return { scope1, scope2 };
}

/**
 * Mock GitLab branches list endpoint
 */
export function mockBranchesList(
  token: string = testFixtures.gitlab.validToken,
  projectId: number = testFixtures.gitlab.projectId,
  branches: string[] = ["main", "develop", "feature/test"],
) {
  return nock(GITLAB_API_BASE)
    .get(`/projects/${projectId}/repository/branches`)
    .matchHeader("private-token", token)
    .reply(
      200,
      branches.map((name) => ({ name, commit: { id: "abc123" } })),
    );
}

/**
 * Mock GitLab repository tree (list files)
 */
export function mockRepositoryTree(
  token: string = testFixtures.gitlab.validToken,
  projectId: number = testFixtures.gitlab.projectId,
  branch: string = "main",
  files: Array<{ name: string; path: string; type: string }> = [
    { name: "script.rpy", path: "game/script.rpy", type: "blob" },
    { name: "chapter1.rpy", path: "game/chapter1.rpy", type: "blob" },
  ],
) {
  return nock(GITLAB_API_BASE)
    .get(`/projects/${projectId}/repository/tree`)
    .matchHeader("private-token", token)
    .query({ ref: branch, recursive: "true" })
    .reply(200, files);
}

/**
 * Mock getting a single file content from GitLab
 */
export function mockGetFile(
  token: string = testFixtures.gitlab.validToken,
  projectId: number = testFixtures.gitlab.projectId,
  filePath: string = "game/script.rpy",
  branch: string = "main",
  content: string = testFixtures.rpy.minimalFile,
) {
  // GitLab returns base64-encoded content
  const base64Content = Buffer.from(content).toString("base64");

  return nock(GITLAB_API_BASE)
    .get(
      `/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}`,
    )
    .matchHeader("private-token", token)
    .query({ ref: branch })
    .reply(200, {
      file_name: filePath.split("/").pop(),
      file_path: filePath,
      size: content.length,
      encoding: "base64",
      content: base64Content,
      content_sha256: "abc123",
      ref: branch,
      blob_id: "xyz789",
      commit_id: "def456",
    });
}

/**
 * Mock creating or updating a file in GitLab
 */
export function mockCreateOrUpdateFile(
  token: string = testFixtures.gitlab.validToken,
  projectId: number = testFixtures.gitlab.projectId,
  filePath: string = "game/script.rpy",
  branch: string = "main",
) {
  return nock(GITLAB_API_BASE)
    .put(
      `/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}`,
    )
    .matchHeader("private-token", token)
    .reply(200, {
      file_path: filePath,
      branch: branch,
      commit_id: "new-commit-id",
    });
}

/**
 * Mock GitLab API error responses
 */
export function mockGitLabError(
  endpoint: string,
  statusCode: number = 500,
  errorMessage: string = "Internal Server Error",
) {
  return nock(GITLAB_API_BASE)
    .get(endpoint)
    .reply(statusCode, { message: errorMessage });
}

/**
 * Clean up all nock mocks
 */
export function cleanAllMocks() {
  nock.cleanAll();
}

/**
 * Enable net connect for tests that need real HTTP requests
 */
export function enableNetConnect() {
  nock.enableNetConnect();
}

/**
 * Disable net connect (default for tests)
 */
export function disableNetConnect() {
  nock.disableNetConnect();
}

export default {
  GITLAB_URL,
  GITLAB_API_BASE,
  mockValidToken,
  mockInvalidToken,
  mockProjectsList,
  mockPaginatedProjectsList,
  mockBranchesList,
  mockRepositoryTree,
  mockGetFile,
  mockCreateOrUpdateFile,
  mockGitLabError,
  cleanAllMocks,
  enableNetConnect,
  disableNetConnect,
};

