import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../db/index.js";
import { lockProject } from "../project-files-operations.service.js";
import { catchUpManagedDefaults } from "../managed-defaults.service.js";

vi.mock("../../db/index.js", () => ({ getDb: vi.fn() }));
vi.mock("../project-files-operations.service.js", () => ({
  lockProject: vi.fn(),
}));

describe("catchUpManagedDefaults", () => {
  const precheck = vi.fn();
  const lockedRead = vi.fn();
  const values = vi.fn();
  const tx = {
    select: () => ({ from: () => ({ where: lockedRead }) }),
    insert: () => ({ values }),
  };
  const transaction = vi.fn(async (callback: (value: typeof tx) => unknown) =>
    callback(tx)
  );
  const db = {
    select: () => ({ from: () => ({ where: precheck }) }),
    transaction,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockReturnValue(db as unknown as ReturnType<typeof getDb>);
    values.mockReturnValue({
      onConflictDoNothing: () => ({ returning: async () => [{ id: "new" }] }),
    });
    lockedRead.mockImplementation(async () => {
      expect(lockProject).toHaveBeenCalledWith(tx, "project");
      return [
        { filePath: "game/script.rpy", content: "label start:\n    pass" },
      ];
    });
  });

  it("skips the transaction when active files have no eligible defaults", async () => {
    precheck.mockResolvedValue([
      { filePath: "game/script.rpy", content: "label start:\n    pass" },
      { filePath: "game/screens.rpy", content: "default ui_flag = False" },
      { filePath: "../unsafe.rpy", content: "default unsafe_flag = False" },
    ]);

    await catchUpManagedDefaults("project");

    expect(transaction).not.toHaveBeenCalled();
    expect(lockProject).not.toHaveBeenCalled();
  });

  it("does not promote a default removed before the locked read", async () => {
    precheck.mockResolvedValue([
      { filePath: "game/script.rpy", content: "default old_flag = False" },
    ]);

    await catchUpManagedDefaults("project");

    expect(lockedRead).toHaveBeenCalledOnce();
    expect(values).not.toHaveBeenCalled();
  });

  it("promotes the current locked snapshot instead of pre-check content", async () => {
    precheck.mockResolvedValue([
      { filePath: "game/script.rpy", content: "default old_flag = False" },
    ]);
    lockedRead.mockImplementation(async () => {
      expect(lockProject).toHaveBeenCalledWith(tx, "project");
      return [
        { filePath: "game/script.rpy", content: "default current_flag = True" },
      ];
    });

    await catchUpManagedDefaults("project");

    expect(values).toHaveBeenCalledExactlyOnceWith([
      { projectId: "project", key: "current_flag" },
    ]);
  });
});
