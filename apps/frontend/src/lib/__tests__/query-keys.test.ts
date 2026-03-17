/**
 * Query Keys Factory Tests
 *
 * Tests for the TanStack Query key factory system.
 * Query keys are critical for cache invalidation and data management.
 */

import { describe, it, expect } from "vitest";
import {
  authKeys,
  settingsKeys,
  gitlabKeys,
  projectKeys,
  labelKeys,
  routeConfigKeys,
  stateVariableKeys,
  characterKeys,
  renpyDefinitionKeys,
} from "../query-keys";

describe("Query Keys Factory", () => {
  describe("Auth Keys", () => {
    it("should create correct all key", () => {
      expect(authKeys.all).toStrictEqual(["auth"]);
    });

    it("should create correct user key", () => {
      expect(authKeys.user()).toStrictEqual(["auth", "user"]);
    });

    it("should be serializable", () => {
      const key = authKeys.user();
      expect(JSON.stringify(key)).toBe(JSON.stringify(["auth", "user"]));
    });

    it("should be stable across calls", () => {
      const key1 = authKeys.user();
      const key2 = authKeys.user();
      expect(key1).toStrictEqual(key2);
    });
  });

  describe("Settings Keys", () => {
    it("should create correct all key", () => {
      expect(settingsKeys.all).toStrictEqual(["settings"]);
    });

    it("should create correct signUps key", () => {
      expect(settingsKeys.signUps()).toStrictEqual(["settings", "signups"]);
    });

    it("should be serializable", () => {
      const key = settingsKeys.signUps();
      expect(JSON.stringify(key)).toBe(JSON.stringify(["settings", "signups"]));
    });
  });

  describe("GitLab Keys", () => {
    it("should create correct all key", () => {
      expect(gitlabKeys.all).toStrictEqual(["gitlab"]);
    });

    it("should create correct integration key", () => {
      expect(gitlabKeys.integration()).toStrictEqual(["gitlab", "integration"]);
    });

    it("should create correct repositories key", () => {
      expect(gitlabKeys.repositories()).toStrictEqual(["gitlab", "repositories"]);
    });

    it("should create correct repository key with projectId", () => {
      expect(gitlabKeys.repository("proj-1")).toStrictEqual([
        "gitlab",
        "repositories",
        "proj-1",
      ]);
    });

    it("should create unique keys for different projectIds", () => {
      const key1 = gitlabKeys.repository("proj-1");
      const key2 = gitlabKeys.repository("proj-2");
      expect(key1).not.toStrictEqual(key2);
    });

    it("should create correct projects key", () => {
      expect(gitlabKeys.projects()).toStrictEqual(["gitlab", "projects"]);
    });

    it("should create correct branches key with projectId", () => {
      expect(gitlabKeys.branches("proj-1")).toStrictEqual([
        "gitlab",
        "branches",
        "proj-1",
      ]);
    });

    it("should create correct files key with projectId and branch", () => {
      expect(gitlabKeys.files("proj-1", "main")).toStrictEqual([
        "gitlab",
        "files",
        "proj-1",
        "main",
      ]);
    });

    it("should create unique keys for different branches", () => {
      const key1 = gitlabKeys.files("proj-1", "main");
      const key2 = gitlabKeys.files("proj-1", "develop");
      expect(key1).not.toStrictEqual(key2);
    });

    it("should create correct importedFiles key with projectId", () => {
      expect(gitlabKeys.importedFiles("proj-1")).toStrictEqual([
        "gitlab",
        "imported-files",
        "proj-1",
      ]);
    });

    it("should create correct file key with fileId", () => {
      expect(gitlabKeys.file("file-1")).toStrictEqual([
        "gitlab",
        "file",
        "file-1",
      ]);
    });

    it("should create correct operations key with projectId", () => {
      expect(gitlabKeys.operations("proj-1")).toStrictEqual([
        "gitlab",
        "operations",
        "proj-1",
      ]);
    });

    it("should create correct operation key with operationId", () => {
      expect(gitlabKeys.operation("op-1")).toStrictEqual([
        "gitlab",
        "operations",
        "op-1",
      ]);
    });

    it("should be serializable", () => {
      const key = gitlabKeys.files("proj-1", "main");
      expect(JSON.stringify(key)).toBe(
        JSON.stringify(["gitlab", "files", "proj-1", "main"])
      );
    });
  });

  describe("Project Keys", () => {
    it("should create correct all key", () => {
      expect(projectKeys.all).toStrictEqual(["projects"]);
    });

    it("should create correct lists key", () => {
      expect(projectKeys.lists()).toStrictEqual(["projects", "list"]);
    });

    it("should create correct detail key with id", () => {
      expect(projectKeys.detail("proj-1")).toStrictEqual([
        "projects",
        "detail",
        "proj-1",
      ]);
    });

    it("should create unique keys for different ids", () => {
      const key1 = projectKeys.detail("proj-1");
      const key2 = projectKeys.detail("proj-2");
      expect(key1).not.toStrictEqual(key2);
    });

    it("should create correct current key", () => {
      expect(projectKeys.current()).toStrictEqual(["projects", "current"]);
    });

    it("should be serializable", () => {
      const key = projectKeys.detail("proj-1");
      expect(JSON.stringify(key)).toBe(
        JSON.stringify(["projects", "detail", "proj-1"])
      );
    });
  });

  describe("Label Keys", () => {
    it("should create correct all key", () => {
      expect(labelKeys.all).toStrictEqual(["labels"]);
    });

    it("should create correct lists key with projectId", () => {
      expect(labelKeys.lists("proj-1")).toStrictEqual([
        "labels",
        "proj-1",
        "list",
      ]);
    });

    it("should create unique keys for different projects", () => {
      const key1 = labelKeys.lists("proj-1");
      const key2 = labelKeys.lists("proj-2");
      expect(key1).not.toStrictEqual(key2);
    });

    it("should create correct listsWithFilters key with projectId and filters", () => {
      const filters = { routeKey: "EILEEN", status: "DRAFT" };
      expect(labelKeys.listsWithFilters("proj-1", filters)).toStrictEqual([
        "labels",
        "proj-1",
        "list",
        filters,
      ]);
    });

    it("should create unique keys for different filters", () => {
      const key1 = labelKeys.listsWithFilters("proj-1", {
        routeKey: "EILEEN",
      });
      const key2 = labelKeys.listsWithFilters("proj-1", {
        routeKey: "LUCAS",
      });
      expect(key1).not.toStrictEqual(key2);
    });

    it("should handle undefined filters", () => {
      const key = labelKeys.listsWithFilters("proj-1", undefined);
      expect(key).toStrictEqual(["labels", "proj-1", "list", undefined]);
    });

    it("should create correct detail key with projectId and labelId", () => {
      expect(labelKeys.detail("proj-1", "label-1")).toStrictEqual([
        "labels",
        "proj-1",
        "detail",
        "label-1",
      ]);
    });

    it("should create correct activeLabelId key with projectId", () => {
      expect(labelKeys.activeLabelId("proj-1")).toStrictEqual([
        "labels",
        "proj-1",
        "activeLabelId",
      ]);
    });

    it("should be serializable", () => {
      const filters = { routeKey: "EILEEN", status: "DRAFT" };
      const key = labelKeys.listsWithFilters("proj-1", filters);
      expect(JSON.stringify(key)).toBe(
        JSON.stringify(["labels", "proj-1", "list", filters])
      );
    });
  });

  describe("Route Config Keys", () => {
    it("should create correct all key", () => {
      expect(routeConfigKeys.all).toStrictEqual(["routeConfigs"]);
    });

    it("should create correct lists key with projectId", () => {
      expect(routeConfigKeys.lists("proj-1")).toStrictEqual([
        "routeConfigs",
        "proj-1",
        "list",
      ]);
    });

    it("should create unique keys for different projects", () => {
      const key1 = routeConfigKeys.lists("proj-1");
      const key2 = routeConfigKeys.lists("proj-2");
      expect(key1).not.toStrictEqual(key2);
    });

    it("should create correct detail key with routeConfigId", () => {
      expect(routeConfigKeys.detail("route-1")).toStrictEqual([
        "routeConfigs",
        "detail",
        "route-1",
      ]);
    });

    it("should be serializable", () => {
      const key = routeConfigKeys.detail("route-1");
      expect(JSON.stringify(key)).toBe(
        JSON.stringify(["routeConfigs", "detail", "route-1"])
      );
    });
  });

  describe("State Variable Keys", () => {
    it("should create correct all key", () => {
      expect(stateVariableKeys.all).toStrictEqual(["stateVariables"]);
    });

    it("should create correct lists key with projectId", () => {
      expect(stateVariableKeys.lists("proj-1")).toStrictEqual([
        "stateVariables",
        "proj-1",
        "list",
      ]);
    });

    it("should create unique keys for different projects", () => {
      const key1 = stateVariableKeys.lists("proj-1");
      const key2 = stateVariableKeys.lists("proj-2");
      expect(key1).not.toStrictEqual(key2);
    });

    it("should create correct detail key with stateVariableId", () => {
      expect(stateVariableKeys.detail("var-1")).toStrictEqual([
        "stateVariables",
        "detail",
        "var-1",
      ]);
    });

    it("should be serializable", () => {
      const key = stateVariableKeys.detail("var-1");
      expect(JSON.stringify(key)).toBe(
        JSON.stringify(["stateVariables", "detail", "var-1"])
      );
    });
  });

  describe("Character Keys", () => {
    it("should create correct all key", () => {
      expect(characterKeys.all).toStrictEqual(["characters"]);
    });

    it("should create correct lists key with projectId", () => {
      expect(characterKeys.lists("proj-1")).toStrictEqual([
        "characters",
        "proj-1",
        "list",
      ]);
    });

    it("should create unique keys for different projects", () => {
      const key1 = characterKeys.lists("proj-1");
      const key2 = characterKeys.lists("proj-2");
      expect(key1).not.toStrictEqual(key2);
    });

    it("should create correct detail key with characterId", () => {
      expect(characterKeys.detail("char-1")).toStrictEqual([
        "characters",
        "detail",
        "char-1",
      ]);
    });

    it("should be serializable", () => {
      const key = characterKeys.detail("char-1");
      expect(JSON.stringify(key)).toBe(
        JSON.stringify(["characters", "detail", "char-1"])
      );
    });
  });

  describe("Ren'Py Definition Keys", () => {
    it("should create correct all key", () => {
      expect(renpyDefinitionKeys.all).toStrictEqual(["renpyDefinitions"]);
    });

    it("should create correct lists key with projectId", () => {
      expect(renpyDefinitionKeys.lists("proj-1")).toStrictEqual([
        "renpyDefinitions",
        "proj-1",
        "list",
      ]);
    });

    it("should create unique keys for different projects", () => {
      const key1 = renpyDefinitionKeys.lists("proj-1");
      const key2 = renpyDefinitionKeys.lists("proj-2");
      expect(key1).not.toStrictEqual(key2);
    });

    it("should create correct detail key with renpyDefinitionId", () => {
      expect(renpyDefinitionKeys.detail("def-1")).toStrictEqual([
        "renpyDefinitions",
        "detail",
        "def-1",
      ]);
    });

    it("should be serializable", () => {
      const key = renpyDefinitionKeys.detail("def-1");
      expect(JSON.stringify(key)).toBe(
        JSON.stringify(["renpyDefinitions", "detail", "def-1"])
      );
    });
  });

  describe("Key Hierarchies", () => {
    it("should allow partial matching for cache invalidation", () => {
      // All label keys start with ["labels"]
      const allLabelKeys = [
        labelKeys.all,
        labelKeys.lists("proj-1"),
        labelKeys.detail("proj-1", "label-1"),
        labelKeys.activeLabelId("proj-1"),
      ];

      allLabelKeys.forEach((key) => {
        expect(key[0]).toBe("labels");
      });
    });

    it("should maintain consistent hierarchy within each domain", () => {
      // All project keys start with ["projects"]
      expect(projectKeys.all[0]).toBe("projects");
      expect(projectKeys.lists()[0]).toBe("projects");
      expect(projectKeys.detail("id")[0]).toBe("projects");
      expect(projectKeys.current()[0]).toBe("projects");
    });
  });

  describe("Key Stability", () => {
    it("should produce identical keys for identical inputs", () => {
      // Test with gitlabKeys as it has multiple parameters
      const key1 = gitlabKeys.files("proj-1", "main");
      const key2 = gitlabKeys.files("proj-1", "main");
      expect(key1).toStrictEqual(key2);
    });

    it("should produce identical keys across multiple calls", () => {
      const keys = Array.from({ length: 10 }, () =>
        projectKeys.detail("stable-id")
      );

      keys.forEach((key) => {
        expect(key).toStrictEqual(projectKeys.detail("stable-id"));
      });
    });
  });
});
