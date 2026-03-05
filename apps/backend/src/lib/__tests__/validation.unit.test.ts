/**
 * Validation Schemas Unit Tests
 *
 * Tests for Zod validation schemas in src/lib/validation.ts
 */

import { describe, it, expect } from "vitest";
import {
  uuidSchema,
  emailSchema,
  nonEmptyStringSchema,
  passwordSchema,
  projectTypeSchema,
  sceneStatusSchema,
  routeTypeSchema,
  booleanStringSchema,
  intStringSchema,
  registerSchema,
  loginSchema,
  createProjectSchema,
  updateProjectSchema,
  projectIdParamsSchema,
  listScenesQuerySchema,
  sceneIdParamsSchema,
  createSceneSchema,
  updateSceneSchema,
  createCharacterSchema,
  characterIdParamsSchema,
  gitlabUrlSchema,
  validateData,
  safeValidateData,
} from "../validation.js";
import { ValidationError } from "../../middleware/error-handler.middleware.js";

describe("Common Schemas", () => {
  describe("uuidSchema", () => {
    it("should accept valid UUID v4", () => {
      const validUuid = "550e8400-e29b-41d4-a716-446655440000";
      const result = uuidSchema.safeParse(validUuid);
      expect(result.success).toBe(true);
    });

    it("should reject invalid UUID formats", () => {
      const invalidUuids = [
        "not-a-uuid",
        "550e8400-e29b-41d4-a716",
        "550e8400-e29b-41d4-a716-446655440000-extra",
        "",
      ];

      for (const uuid of invalidUuids) {
        const result = uuidSchema.safeParse(uuid);
        expect(result.success).toBe(false);
      }
    });
  });

  describe("emailSchema", () => {
    it("should accept valid email addresses", () => {
      const validEmails = [
        "user@example.com",
        "user.name@example.com",
        "user+tag@example.co.uk",
        "USER@EXAMPLE.COM", // Should be lowercased
      ];

      for (const email of validEmails) {
        const result = emailSchema.safeParse(email);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(email.toLowerCase());
        }
      }
    });

    it("should reject invalid email addresses", () => {
      const invalidEmails = ["", "not-an-email", "@example.com", "user@"];

      for (const email of invalidEmails) {
        const result = emailSchema.safeParse(email);
        expect(result.success).toBe(false);
      }
    });

    it("should trim whitespace", () => {
      const result = emailSchema.safeParse("  user@example.com  ");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("user@example.com");
      }
    });
  });

  describe("nonEmptyStringSchema", () => {
    it("should accept non-empty strings", () => {
      const result = nonEmptyStringSchema.safeParse("valid string");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("valid string");
      }
    });

    it("should reject empty strings", () => {
      const result = nonEmptyStringSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("should reject whitespace-only strings", () => {
      const result = nonEmptyStringSchema.safeParse("   ");
      expect(result.success).toBe(false);
    });

    it("should trim whitespace", () => {
      const result = nonEmptyStringSchema.safeParse("  test  ");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("test");
      }
    });
  });

  describe("passwordSchema", () => {
    it("should accept valid passwords", () => {
      const validPasswords = [
        "password123",
        "P@ssw0rd!",
        "12345678",
        "a".repeat(128), // Max length
      ];

      for (const password of validPasswords) {
        const result = passwordSchema.safeParse(password);
        expect(result.success).toBe(true);
      }
    });

    it("should reject passwords that are too short", () => {
      const result = passwordSchema.safeParse("short");
      expect(result.success).toBe(false);
    });

    it("should reject passwords that are too long", () => {
      const result = passwordSchema.safeParse("a".repeat(129));
      expect(result.success).toBe(false);
    });
  });
});

describe("Enum Schemas", () => {
  describe("projectTypeSchema", () => {
    it("should accept valid project types", () => {
      const validTypes = ["PREQUEL", "SEQUEL"];

      for (const type of validTypes) {
        const result = projectTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid project types", () => {
      const result = projectTypeSchema.safeParse("INVALID");
      expect(result.success).toBe(false);
    });
  });

  describe("sceneStatusSchema", () => {
    it("should accept valid scene statuses", () => {
      const validStatuses = ["DRAFT", "REVIEW", "FINAL"];

      for (const status of validStatuses) {
        const result = sceneStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid scene statuses", () => {
      const result = sceneStatusSchema.safeParse("INVALID");
      expect(result.success).toBe(false);
    });
  });

  describe("routeTypeSchema", () => {
    it("should accept valid route types", () => {
      const validRoutes = [
        "EILEEN",
        "LUCAS",
        "SHARED",
        "FEMALE",
        "MALE",
        "COMBINED",
        "COMMON",
      ];

      for (const route of validRoutes) {
        const result = routeTypeSchema.safeParse(route);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid route types", () => {
      const result = routeTypeSchema.safeParse("INVALID");
      expect(result.success).toBe(false);
    });
  });
});

describe("String Transformation Schemas", () => {
  describe("booleanStringSchema", () => {
    it("should accept 'true' and convert to boolean true", () => {
      const result = booleanStringSchema.safeParse("true");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it("should accept 'TRUE' (case-insensitive) and convert to boolean true", () => {
      const result = booleanStringSchema.safeParse("TRUE");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it("should accept 'false' and convert to boolean false", () => {
      const result = booleanStringSchema.safeParse("false");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it("should accept 'False' (case-insensitive) and convert to boolean false", () => {
      const result = booleanStringSchema.safeParse("False");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it("should accept 'FALSE' (case-insensitive) and convert to boolean false", () => {
      const result = booleanStringSchema.safeParse("FALSE");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it("should reject empty string (does not transform to boolean)", () => {
      const result = booleanStringSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("should reject '1' as non-boolean string", () => {
      const result = booleanStringSchema.safeParse("1");
      expect(result.success).toBe(false);
    });

    it("should reject '0' as non-boolean string", () => {
      const result = booleanStringSchema.safeParse("0");
      expect(result.success).toBe(false);
    });

    it("should reject non-boolean strings like 'abc'", () => {
      const result = booleanStringSchema.safeParse("abc");
      expect(result.success).toBe(false);
    });

    it("should reject 'yes' as non-boolean string", () => {
      const result = booleanStringSchema.safeParse("yes");
      expect(result.success).toBe(false);
    });

    it("should handle undefined (optional field)", () => {
      const result = booleanStringSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(undefined);
      }
    });
  });

  describe("intStringSchema", () => {
    it("should accept '0' and convert to number 0", () => {
      const result = intStringSchema.safeParse("0");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
    });

    it("should accept positive integer strings like '123'", () => {
      const result = intStringSchema.safeParse("123");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(123);
      }
    });

    it("should accept negative integer strings like '-1'", () => {
      const result = intStringSchema.safeParse("-1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(-1);
      }
    });

    it("should accept large integers", () => {
      const result = intStringSchema.safeParse("2147483647");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(2147483647);
      }
    });

    it("should trim whitespace around integers", () => {
      const result = intStringSchema.safeParse("  42  ");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(42);
      }
    });

    it("should reject decimal strings like '1.5'", () => {
      const result = intStringSchema.safeParse("1.5");
      expect(result.success).toBe(false);
    });

    it("should reject non-numeric strings like 'abc'", () => {
      const result = intStringSchema.safeParse("abc");
      expect(result.success).toBe(false);
    });

    it("should reject strings with letters like '123abc'", () => {
      const result = intStringSchema.safeParse("123abc");
      expect(result.success).toBe(false);
    });

    it("should reject empty string", () => {
      const result = intStringSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("should reject whitespace-only string", () => {
      const result = intStringSchema.safeParse("   ");
      expect(result.success).toBe(false);
    });

    it("should handle undefined (optional field)", () => {
      const result = intStringSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(undefined);
      }
    });
  });
});

describe("GitLab URL Schema (SSRF Protection)", () => {
  describe("gitlabUrlSchema", () => {
    it("should accept valid HTTPS gitlab.com URLs", () => {
      const validUrls = [
        "https://gitlab.com",
        "https://gitlab.com/",
        "https://gitlab.com/user/repo",
        "https://gitlab.com/group/project.git",
      ];

      for (const url of validUrls) {
        const result = gitlabUrlSchema.safeParse(url);
        expect(result.success).toBe(true);
      }
    });

    it("should accept valid HTTPS *.gitlab.io URLs", () => {
      const validUrls = [
        "https://example.gitlab.io",
        "https://my-project.gitlab.io/path",
      ];

      for (const url of validUrls) {
        const result = gitlabUrlSchema.safeParse(url);
        expect(result.success).toBe(true);
      }
    });

    it("should accept valid HTTPS *.gitlab.com URLs (self-hosted)", () => {
      const validUrls = [
        "https://company.gitlab.com",
        "https://my-company.gitlab.com",
        "https://sub.gitlab.com",
      ];

      for (const url of validUrls) {
        const result = gitlabUrlSchema.safeParse(url);
        expect(result.success).toBe(true);
      }
    });

    it("should reject URLs with 'gitlab.com' in subdomain but not ending in .gitlab.com", () => {
      const invalidUrls = [
        "https://gitlab.example.com",
        "https://gitlab-company.com",
        "https://mygitlab.com",
      ];

      for (const url of invalidUrls) {
        const result = gitlabUrlSchema.safeParse(url);
        expect(result.success).toBe(false);
      }
    });

    it("should reject HTTP (non-HTTPS) URLs", () => {
      const httpUrls = [
        "http://gitlab.com",
        "http://example.gitlab.io",
        "http://gitlab.example.com",
      ];

      for (const url of httpUrls) {
        const result = gitlabUrlSchema.safeParse(url);
        expect(result.success).toBe(false);
      }
    });

    it("should reject localhost URLs", () => {
      const localhostUrls = [
        "https://localhost",
        "https://localhost:3000",
        "https://127.0.0.1",
        "https://127.0.0.1:8080",
        "https://127.1.1.1",
      ];

      for (const url of localhostUrls) {
        const result = gitlabUrlSchema.safeParse(url);
        expect(result.success).toBe(false);
      }
    });

    it("should reject private IP addresses (SSRF protection)", () => {
      const privateUrls = [
        "https://10.0.0.1",
        "https://10.255.255.254",
        "https://172.16.0.1",
        "https://172.31.255.255",
        "https://192.168.0.1",
        "https://192.168.255.254",
        "https://169.254.1.1", // IPv4 link-local
      ];

      for (const url of privateUrls) {
        const result = gitlabUrlSchema.safeParse(url);
        expect(result.success).toBe(false);
      }
    });

    it("should reject IPv6 local addresses", () => {
      const ipv6LocalUrls = [
        "https://[::1]",
        "https://[::ffff:192.0.2.1]",
        "https://[fc00::1]", // IPv6 ULA
        "https://[fd00::1]", // IPv6 ULA
      ];

      for (const url of ipv6LocalUrls) {
        const result = gitlabUrlSchema.safeParse(url);
        expect(result.success).toBe(false);
      }
    });

    it("should reject non-HTTP(S) protocols like file://", () => {
      const nonHttpUrls = [
        "file:///etc/passwd",
        "file://localhost/path/to/file",
        "ftp://gitlab.com",
        "mailto:user@example.com",
      ];

      for (const url of nonHttpUrls) {
        const result = gitlabUrlSchema.safeParse(url);
        expect(result.success).toBe(false);
      }
    });

    it("should reject data: URLs", () => {
      const dataUrls = [
        "data:text/plain;base64,SGVsbG8=",
        "data:text/html,<script>alert('xss')</script>",
      ];

      for (const url of dataUrls) {
        const result = gitlabUrlSchema.safeParse(url);
        expect(result.success).toBe(false);
      }
    });

    it("should reject non-GitLab HTTPS URLs", () => {
      const nonGitlabUrls = [
        "https://github.com",
        "https://example.com",
        "https://bitbucket.org",
        "https://gitlab.org", // Not .gitlab.com or .gitlab.io
      ];

      for (const url of nonGitlabUrls) {
        const result = gitlabUrlSchema.safeParse(url);
        expect(result.success).toBe(false);
      }
    });

    it("should trim and accept URLs with trailing whitespace", () => {
      const result = gitlabUrlSchema.safeParse("https://gitlab.com ");
      expect(result.success).toBe(true);
    });

    it("should trim and accept URLs with leading whitespace", () => {
      const result = gitlabUrlSchema.safeParse(" https://gitlab.com");
      expect(result.success).toBe(true);
    });

    it("should reject 0.0.0.0 URL", () => {
      const result = gitlabUrlSchema.safeParse("https://0.0.0.0");
      expect(result.success).toBe(false);
    });
  });
});

describe("Auth Schemas", () => {
  describe("registerSchema", () => {
    it("should accept valid registration data", () => {
      const validData = {
        email: "user@example.com",
        password: "password123",
      };

      const result = registerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid email", () => {
      const invalidData = {
        email: "not-an-email",
        password: "password123",
      };

      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject short password", () => {
      const invalidData = {
        email: "user@example.com",
        password: "short",
      };

      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("loginSchema", () => {
    it("should accept valid login data", () => {
      const validData = {
        email: "user@example.com",
        password: "password123",
      };

      const result = loginSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject missing password", () => {
      const invalidData = {
        email: "user@example.com",
        password: "",
      };

      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

describe("Project Schemas", () => {
  describe("createProjectSchema", () => {
    it("should accept valid project data", () => {
      const validData = {
        name: "Test Project",
        type: "PREQUEL",
        description: "A test project",
      };

      const result = createProjectSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid project type", () => {
      const invalidData = {
        name: "Test Project",
        type: "INVALID",
      };

      const result = createProjectSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject empty project name", () => {
      const invalidData = {
        name: "   ",
        type: "PREQUEL",
      };

      const result = createProjectSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("updateProjectSchema", () => {
    it("should accept valid partial update data", () => {
      const validData = {
        name: "Updated Project Name",
      };

      const result = updateProjectSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept empty object for no updates", () => {
      const result = updateProjectSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("projectIdParamsSchema", () => {
    it("should accept valid project ID", () => {
      const validData = {
        id: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = projectIdParamsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid project ID", () => {
      const invalidData = {
        id: "not-a-uuid",
      };

      const result = projectIdParamsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

describe("Scene Schemas", () => {
  describe("listScenesQuerySchema", () => {
    it("should accept valid query parameters", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "EILEEN",
        status: "DRAFT",
      };

      const result = listScenesQuerySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept partial query parameters", () => {
      const partialData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = listScenesQuerySchema.safeParse(partialData);
      expect(result.success).toBe(true);
    });
  });

  describe("sceneIdParamsSchema", () => {
    it("should accept valid scene ID", () => {
      const validData = {
        sceneId: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = sceneIdParamsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid scene ID", () => {
      const invalidData = {
        sceneId: "not-a-uuid",
      };

      const result = sceneIdParamsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

describe("Create Scene Schema", () => {
  describe("createSceneSchema", () => {
    it("should accept valid minimal scene payload", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "EILEEN",
      };

      const result = createSceneSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept valid full scene payload for PREQUEL project", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "LUCAS",
        act: 1,
        scene: 42,
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        title: "Scene Title",
        summary: "Scene summary text",
      };

      const result = createSceneSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept valid full scene payload for SEQUEL project", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "FEMALE",
        chapter: 5,
        scene: 10,
        status: "REVIEW",
        visibility: "SHARED",
        title: "Chapter Scene",
        summary: "Summary here",
      };

      const result = createSceneSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept valid sequenceOrder for linear sequencing", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "COMMON",
        sequenceOrder: 100,
      };

      const result = createSceneSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject missing required field: projectId", () => {
      const invalidData = {
        route: "EILEEN",
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject missing required field: route", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject invalid UUID for projectId", () => {
      const invalidData = {
        projectId: "not-a-uuid",
        route: "EILEEN",
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject invalid route enum value", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "INVALID_ROUTE",
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject invalid status enum value", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "EILEEN",
        status: "INVALID_STATUS",
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject invalid visibility enum value", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "EILEEN",
        visibility: "INVALID_VISIBILITY",
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject act value below minimum (1)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "EILEEN",
        act: 0,
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject act value above maximum (99)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "EILEEN",
        act: 100,
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject non-integer act value", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "EILEEN",
        act: 1.5,
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject scene value below minimum (1)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "EILEEN",
        scene: 0,
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject scene value above maximum (999)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "EILEEN",
        scene: 1000,
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject chapter value below minimum (1)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "FEMALE",
        chapter: 0,
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject chapter value above maximum (99)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "FEMALE",
        chapter: 100,
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject negative sequenceOrder value", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "COMMON",
        sequenceOrder: -1,
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject non-integer scene value", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "EILEEN",
        scene: 1.5,
      };

      const result = createSceneSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

describe("Character Schemas", () => {
  describe("createCharacterSchema", () => {
    it("should accept valid minimal character payload", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
      };

      const result = createCharacterSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept valid full character payload", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Jane Doe",
        alias: "Jane",
        description: "A detailed character description that can be quite long",
      };

      const result = createCharacterSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should trim whitespace from name", () => {
      const data = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "  Character Name  ",
      };

      const result = createCharacterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Character Name");
      }
    });

    it("should trim whitespace from alias", () => {
      const data = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
        alias: "  Alias  ",
      };

      const result = createCharacterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.alias).toBe("Alias");
      }
    });

    it("should accept empty alias (optional field)", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
        alias: "",
      };

      const result = createCharacterSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept missing description (optional field)", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
      };

      const result = createCharacterSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject missing required field: projectId", () => {
      const invalidData = {
        name: "Character Name",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject missing required field: name", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject invalid UUID for projectId", () => {
      const invalidData = {
        projectId: "not-a-uuid",
        name: "Character Name",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject empty name after trimming", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "   ",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject name exceeding maximum length (200)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "a".repeat(201),
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject alias exceeding maximum length (100)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
        alias: "a".repeat(101),
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject description exceeding maximum length (5000)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
        description: "a".repeat(5001),
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("characterIdParamsSchema", () => {
    it("should accept valid character ID", () => {
      const validData = {
        characterId: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = characterIdParamsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid character ID", () => {
      const invalidData = {
        characterId: "not-a-uuid",
      };

      const result = characterIdParamsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

describe("Helper Functions", () => {
  describe("validateData", () => {
    it("should return validated data for valid input", () => {
      const data = {
        email: "user@example.com",
        password: "password123",
      };

      const result = validateData(data, registerSchema);
      expect(result).toEqual({
        email: "user@example.com",
        password: "password123",
      });
    });

    it("should throw ValidationError for invalid input", () => {
      const data = {
        email: "not-an-email",
        password: "short",
      };

      expect(() => validateData(data, registerSchema)).toThrow();
    });

    it("should use custom error message when provided", () => {
      const data = {
        email: "not-an-email",
        password: "short",
      };

      expect(() => {
        validateData(data, registerSchema, "Custom error message");
      }).toThrow(ValidationError);
    });
  });

  describe("safeValidateData", () => {
    it("should return success result for valid input", () => {
      const data = {
        email: "user@example.com",
        password: "password123",
      };

      const result = safeValidateData(data, registerSchema);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("user@example.com");
      }
    });

    it("should return error result for invalid input", () => {
      const data = {
        email: "not-an-email",
        password: "short",
      };

      const result = safeValidateData(data, registerSchema);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});

