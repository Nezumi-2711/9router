import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir;
const originalDataDir = process.env.DATA_DIR;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-api-key-credentials-"));
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

describe("API-key credential access", () => {
  it("allows a user API key to use the system-wide credential pool", async () => {
    const db = await import("@/lib/db/index.js");
    const { getProviderCredentials } = await import("@/sse/services/auth.js");
    const admin = await db.createUser({ username: "credential-admin", password: "password", role: "admin" });
    const userC = await db.createUser({ username: "credential-user-c", password: "password", role: "user" });
    const adminConnection = await db.createProviderConnection({
      provider: "antigravity",
      authType: "oauth",
      name: "admin-antigravity",
      accessToken: "admin-token",
      ownerId: admin.id,
    });
    const secondAdmin = await db.createUser({ username: "credential-admin-two", password: "password", role: "admin" });
    const thirdAdmin = await db.createUser({ username: "credential-admin-three", password: "password", role: "admin" });
    const userAConnection = await db.createProviderConnection({
      provider: "antigravity",
      authType: "oauth",
      name: "second-admin-antigravity",
      accessToken: "second-admin-token",
      ownerId: secondAdmin.id,
    });
    const userBConnection = await db.createProviderConnection({
      provider: "antigravity",
      authType: "oauth",
      name: "third-admin-antigravity",
      accessToken: "third-admin-token",
      ownerId: thirdAdmin.id,
    });

    const firstCredentials = await getProviderCredentials("antigravity", new Set(), "gemini-2.5-pro", {
      ownerId: userC.id,
    });
    const secondCredentials = await getProviderCredentials("antigravity", new Set([firstCredentials.connectionId]), "gemini-2.5-pro", {
      ownerId: userC.id,
    });
    const thirdCredentials = await getProviderCredentials("antigravity", new Set([firstCredentials.connectionId, secondCredentials.connectionId]), "gemini-2.5-pro", {
      ownerId: userC.id,
    });

    expect([firstCredentials.connectionId, secondCredentials.connectionId, thirdCredentials.connectionId])
      .toEqual(expect.arrayContaining([adminConnection.id, userAConnection.id, userBConnection.id]));
  });
});