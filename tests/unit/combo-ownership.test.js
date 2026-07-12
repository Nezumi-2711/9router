import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-combo-owner-"));
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("combo ownership", () => {
  it("allows identical names in different user scopes and prevents cross-owner reads", async () => {
    const { createUser } = await import("@/lib/db/index.js");
    const {
      createCombo,
      getComboByName,
      getCombos,
      updateCombo,
      deleteCombo,
    } = await import("@/lib/db/repos/combosRepo.js");

    const userA = await createUser({ username: "combo-owner-a", password: "password", role: "user" });
    const userB = await createUser({ username: "combo-owner-b", password: "password", role: "user" });
    const comboA = await createCombo({ name: "fast", ownerId: userA.id, models: ["openai/gpt-a"] });
    const comboB = await createCombo({ name: "fast", ownerId: userB.id, models: ["anthropic/claude-b"] });

    expect((await getComboByName("fast", userA.id)).id).toBe(comboA.id);
    expect((await getComboByName("fast", userB.id)).id).toBe(comboB.id);
    expect(await getCombos(userA.id)).toEqual([comboA]);
    expect(await updateCombo(comboA.id, { models: ["openai/gpt-updated"] }, userB.id)).toBeNull();
    expect(await deleteCombo(comboA.id, userB.id)).toBe(false);
    expect((await getComboByName("fast", userA.id)).models).toEqual(["openai/gpt-a"]);
  });
});