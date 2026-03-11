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
  labelStatusSchema,
  booleanStringSchema,
  intStringSchema,
  registerSchema,
  loginSchema,
  createProjectSchema,
  updateProjectSchema,
  projectIdParamsSchema,
  listLabelsQuerySchema,
  labelIdParamsSchema,
  createLabelSchema,
  createCharacterSchema,
  characterIdParamsSchema,
  renpyTagSchema,
  colorHexSchema,
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
  describe("labelStatusSchema", () => {
    it("should accept valid label statuses", () => {
      const validStatuses = ["DRAFT", "REVIEW", "FINAL"];

      for (const status of validStatuses) {
        const result = labelStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid label statuses", () => {
      const result = labelStatusSchema.safeParse("INVALID");
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
        description: "A test project",
      };

      const result = createProjectSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject empty project name", () => {
      const invalidData = {
        name: "   ",
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
        projectId: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = projectIdParamsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid project ID", () => {
      const invalidData = {
        projectId: "not-a-uuid",
      };

      const result = projectIdParamsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

describe("Label Schemas", () => {
  describe("listLabelsQuerySchema", () => {
    it("should accept valid query parameters", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        routeKey: "eileen",
        status: "DRAFT",
      };

      const result = listLabelsQuerySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept partial query parameters", () => {
      const partialData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = listLabelsQuerySchema.safeParse(partialData);
      expect(result.success).toBe(true);
    });
  });

  describe("labelIdParamsSchema", () => {
    it("should accept valid label ID", () => {
      const validData = {
        labelId: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = labelIdParamsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid label ID", () => {
      const invalidData = {
        labelId: "not-a-uuid",
      };

      const result = labelIdParamsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

describe("Create Label Schema", () => {
  describe("createLabelSchema", () => {
    it("should accept valid minimal label payload", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "eileen",
        labelNumber: 1,
        title: "Scene Title",
      };

      const result = createLabelSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept valid full label payload with grouping", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "lucas",
        groupType: "act",
        groupValue: "I",
        labelNumber: 42,
        status: "DRAFT",
        visibility: "EXCLUSIVE",
        title: "Scene Title",
      };

      const result = createLabelSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept valid full label payload with chapter grouping", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "female",
        groupType: "chapter",
        groupValue: "5",
        labelNumber: 10,
        status: "REVIEW",
        visibility: "SHARED",
        title: "Chapter Scene",
      };

      const result = createLabelSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept valid sequenceOrder for linear sequencing", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "common",
        labelNumber: 1,
        sequenceOrder: 100,
        title: "Scene Title",
      };

      const result = createLabelSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject missing required field: projectId", () => {
      const invalidData = {
        route: "eileen",
        labelNumber: 1,
        title: "Scene Title",
      };

      const result = createLabelSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should accept label without route (optional field)", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        labelNumber: 1,
        title: "Scene Title",
      };

      const result = createLabelSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid UUID for projectId", () => {
      const invalidData = {
        projectId: "not-a-uuid",
        route: "eileen",
        labelNumber: 1,
        title: "Scene Title",
      };

      const result = createLabelSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should accept any string value for route", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        route: "my_custom_route",
        labelNumber: 1,
        title: "Scene Title",
      };

      const result = createLabelSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject invalid status enum value", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        routeKey: "eileen",
        labelNumber: 1,
        status: "INVALID_STATUS",
      };

      const result = createLabelSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject invalid visibility enum value", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        routeKey: "eileen",
        labelNumber: 1,
        visibility: "INVALID_VISIBILITY",
      };

      const result = createLabelSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject labelNumber value below minimum (1)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        routeKey: "eileen",
        labelNumber: 0,
      };

      const result = createLabelSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject labelNumber value above maximum (999)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        routeKey: "eileen",
        labelNumber: 1000,
      };

      const result = createLabelSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject non-integer labelNumber value", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        routeKey: "eileen",
        labelNumber: 1.5,
      };

      const result = createLabelSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject unknown 'scene' property", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        routeKey: "eileen",
        labelNumber: 1,
        scene: 0, // Unknown property - not part of createLabelSchema
      };

      const result = createLabelSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject unknown 'chapter' property", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        routeKey: "female",
        labelNumber: 1,
        chapter: 5, // Unknown property - not part of createLabelSchema
      };

      const result = createLabelSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject sequenceOrder value below minimum (1)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        routeKey: "common",
        labelNumber: 1,
        sequenceOrder: 0,
      };

      const result = createLabelSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject non-integer sequenceOrder value", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        routeKey: "common",
        labelNumber: 1,
        sequenceOrder: 1.5,
      };

      const result = createLabelSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

describe("Character Schemas", () => {
  describe("renpyTagSchema", () => {
    it("should accept valid ren'Py tag starting with letter", () => {
      const result = renpyTagSchema.safeParse("s");
      expect(result.success).toBe(true);
    });

    it("should accept valid ren'Py tag starting with underscore", () => {
      const result = renpyTagSchema.safeParse("_special");
      expect(result.success).toBe(true);
    });

    it("should accept valid ren'Py tag with alphanumeric and underscores", () => {
      const result = renpyTagSchema.safeParse("s_01_first");
      expect(result.success).toBe(true);
    });

    it("should reject tag starting with number", () => {
      const result = renpyTagSchema.safeParse("1_character");
      expect(result.success).toBe(false);
    });

    it("should reject tag with hyphens", () => {
      const result = renpyTagSchema.safeParse("s-character");
      expect(result.success).toBe(false);
    });

    it("should reject empty tag", () => {
      const result = renpyTagSchema.safeParse("");
      expect(result.success).toBe(false);
    });
  });

  describe("colorHexSchema", () => {
    it("should accept valid hex color", () => {
      const result = colorHexSchema.safeParse("#FF5733");
      expect(result.success).toBe(true);
    });

    it("should accept lowercase hex color", () => {
      const result = colorHexSchema.safeParse("#ff5733");
      expect(result.success).toBe(true);
    });

    it("should reject hex color without hash", () => {
      const result = colorHexSchema.safeParse("FF5733");
      expect(result.success).toBe(false);
    });

    it("should reject short hex color", () => {
      const result = colorHexSchema.safeParse("#F53");
      expect(result.success).toBe(false);
    });
  });

  describe("createCharacterSchema", () => {
    it("should accept valid minimal character payload", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
        displayName: "Character Display Name",
        renpyTag: "char_name",
        color: "#FF5733",
      };

      const result = createCharacterSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept valid full character payload", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Jane Doe",
        displayName: "Jane",
        renpyTag: "jane",
        color: "#ABC123",
        routeAffiliation: "EILEEN",
        isLoveInterest: true,
        dialogueStyle: "casual",
        conditionalPrefix: "jane_",
      };

      const result = createCharacterSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should trim whitespace from name", () => {
      const data = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "  Character Name  ",
        displayName: "Display Name",
        renpyTag: "char",
        color: "#FF5733",
      };

      const result = createCharacterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Character Name");
      }
    });

    it("should trim whitespace from displayName", () => {
      const data = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
        displayName: "  Display Name  ",
        renpyTag: "char",
        color: "#FF5733",
      };

      const result = createCharacterSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.displayName).toBe("Display Name");
      }
    });

    it("should accept optional fields", () => {
      const validData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
        displayName: "Display Name",
        renpyTag: "char",
        color: "#FF5733",
        routeAffiliation: "SHARED",
      };

      const result = createCharacterSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject missing required field: projectId", () => {
      const invalidData = {
        name: "Character Name",
        displayName: "Display Name",
        renpyTag: "char",
        color: "#FF5733",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject missing required field: name", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        displayName: "Display Name",
        renpyTag: "char",
        color: "#FF5733",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject missing required field: displayName", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
        renpyTag: "char",
        color: "#FF5733",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject missing required field: renpyTag", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
        displayName: "Display Name",
        color: "#FF5733",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject missing required field: color", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
        displayName: "Display Name",
        renpyTag: "char",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject invalid UUID for projectId", () => {
      const invalidData = {
        projectId: "not-a-uuid",
        name: "Character Name",
        displayName: "Display Name",
        renpyTag: "char",
        color: "#FF5733",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject empty name after trimming", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "   ",
        displayName: "Display Name",
        renpyTag: "char",
        color: "#FF5733",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject name exceeding maximum length (200)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "a".repeat(201),
        displayName: "Display Name",
        renpyTag: "char",
        color: "#FF5733",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject invalid ren'Py tag starting with number", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
        displayName: "Display Name",
        renpyTag: "1_invalid",
        color: "#FF5733",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject invalid color format", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
        displayName: "Display Name",
        renpyTag: "char",
        color: "red",
      };

      const result = createCharacterSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject unknown fields (strict mode)", () => {
      const invalidData = {
        projectId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Character Name",
        displayName: "Display Name",
        renpyTag: "char",
        color: "#FF5733",
        unknownField: "should not be allowed",
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
