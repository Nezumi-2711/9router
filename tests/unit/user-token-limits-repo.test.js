import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-token-limits-"));
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

describe("user token limit repository", () => {
  it("replaces and normalizes all supported provider limits", async () => {
    const db = await import("@/lib/db/index.js");
    const user = await db.createUser({ username: "limited-user", password: "password", role: "user" });

    await expect(db.getUserTokenLimits(user.id)).resolves.toEqual({
      "orbit-provider": { session: 0, weekly: 0 },
      codex: { session: 0, weekly: 0 },
    });

    await db.replaceUserTokenLimits(user.id, {
      "orbit-provider": { session: 100, weekly: 1000 },
      codex: { session: 0, weekly: 2000 },
    });

    await expect(db.getUserTokenLimits(user.id)).resolves.toEqual({
      "orbit-provider": { session: 100, weekly: 1000 },
      codex: { session: 0, weekly: 2000 },
    });
  });

  it("sums prompt and completion tokens by user, provider, and timestamp", async () => {
    const db = await import("@/lib/db/index.js");
    const { getAdapter } = await import("@/lib/db/driver.js");
    const user = await db.createUser({ username: "usage-user", password: "password", role: "user" });
    const adapter = await getAdapter();

    for (const [timestamp, provider, prompt, completion] of [
      ["2026-07-17T06:00:00.000Z", "codex", 30, 20],
      ["2026-07-17T09:00:00.000Z", "codex", 40, 10],
      ["2026-07-17T09:30:00.000Z", "orbit-provider", 500, 500],
    ]) {
      adapter.run(
        `INSERT INTO usageHistory(timestamp, provider, userId, promptTokens, completionTokens)
         VALUES(?, ?, ?, ?, ?)`,
        [timestamp, provider, user.id, prompt, completion],
      );
    }

    await expect(db.getUserProviderTokenUsageSince(
      user.id,
      "codex",
      new Date("2026-07-17T08:00:00.000Z"),
    )).resolves.toBe(50);
  });

  it("keeps a fixed session anchor until its five-hour boundary passes", async () => {
    const db = await import("@/lib/db/index.js");
    const user = await db.createUser({ username: "session-user", password: "password", role: "user" });

    await expect(db.ensureUserTokenQuotaSession(
      user.id,
      "codex",
      "2026-07-17T06:00:00.000Z",
    )).resolves.toBe("2026-07-17T06:00:00.000Z");

    await expect(db.ensureUserTokenQuotaSession(
      user.id,
      "codex",
      "2026-07-17T08:00:00.000Z",
    )).resolves.toBe("2026-07-17T06:00:00.000Z");

    await expect(db.ensureUserTokenQuotaSession(
      user.id,
      "codex",
      "2026-07-17T11:01:00.000Z",
    )).resolves.toBe("2026-07-17T11:01:00.000Z");
    await expect(db.getUserTokenQuotaSession(user.id, "codex"))
      .resolves.toBe("2026-07-17T11:01:00.000Z");
  });

  it("rejects negative and non-integer limits without changing stored values", async () => {
    const db = await import("@/lib/db/index.js");
    const user = await db.createUser({ username: "invalid-limit", password: "password", role: "user" });

    await db.replaceUserTokenLimits(user.id, {
      "orbit-provider": { session: 100, weekly: 0 },
      codex: { session: 0, weekly: 0 },
    });

    await expect(db.replaceUserTokenLimits(user.id, {
      "orbit-provider": { session: -1, weekly: 0 },
      codex: { session: 0, weekly: 0 },
    })).rejects.toThrow("Token limit must be a non-negative integer");

    await expect(db.getUserTokenLimits(user.id)).resolves.toMatchObject({
      "orbit-provider": { session: 100 },
    });
  });

  it("rejects unsupported providers and window names", async () => {
    const db = await import("@/lib/db/index.js");
    const user = await db.createUser({ username: "invalid-scope", password: "password", role: "user" });

    await expect(db.replaceUserTokenLimits(user.id, {
      openai: { session: 100 },
    })).rejects.toThrow("Unsupported token limit provider");

    await expect(db.replaceUserTokenLimits(user.id, {
      codex: { monthly: 100 },
    })).rejects.toThrow("Unsupported token limit window");
  });
});
