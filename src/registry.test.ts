import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadRegistry,
  saveRegistry,
  normalizeEntry,
  getRegisteredServers,
  addServer,
  removeServer,
  hasServer,
} from "./registry.js";
import type { RegistryFile, LocalServerEntry, RemoteServerEntry } from "./types.js";

// --- Test fixtures ---

const LOCAL_ENTRY: LocalServerEntry = {
  command: "node",
  args: ["server.js", "--port", "3000"],
  env: { API_KEY: "secret" },
  metadata: { description: "Test server" },
};

const REMOTE_ENTRY: RemoteServerEntry = {
  type: "remote",
  url: "https://example.com/mcp",
  headers: { Authorization: "Bearer token" },
};

const REGISTRY: RegistryFile = {
  version: 1,
  servers: {
    local: LOCAL_ENTRY,
    remote: REMOTE_ENTRY,
  },
};

// --- File I/O tests ---

describe("loadRegistry", () => {
  let testDir: string;

  before(async () => {
    testDir = join(tmpdir(), `mcp-registry-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("returns empty registry for missing file", async () => {
    const result = await loadRegistry(join(testDir, "nonexistent.json"));
    assert.deepEqual(result, { version: 1, servers: {} });
  });

  it("loads a valid registry", async () => {
    const path = join(testDir, "valid.json");
    await writeFile(path, JSON.stringify(REGISTRY));
    const result = await loadRegistry(path);
    assert.equal(result.version, 1);
    assert.ok("local" in result.servers);
    assert.ok("remote" in result.servers);
  });

  it("throws on invalid JSON", async () => {
    const path = join(testDir, "bad.json");
    await writeFile(path, "not json {{{");
    await assert.rejects(loadRegistry(path), /Failed to parse/);
  });

  it("throws on schema-invalid content", async () => {
    const path = join(testDir, "invalid.json");
    await writeFile(path, JSON.stringify({ version: "bad", servers: {} }));
    await assert.rejects(loadRegistry(path), /Invalid registry/);
  });
});

describe("saveRegistry", () => {
  let testDir: string;

  before(async () => {
    testDir = join(tmpdir(), `mcp-registry-test-save-${Date.now()}`);
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("creates parent directories and writes registry", async () => {
    const path = join(testDir, "nested", "dir", "servers.json");
    await saveRegistry(REGISTRY, path);
    const loaded = await loadRegistry(path);
    assert.equal(loaded.version, 1);
    assert.deepEqual(Object.keys(loaded.servers).sort(), ["local", "remote"]);
  });
});

// --- Normalize tests ---

describe("normalizeEntry", () => {
  it("normalizes a local entry", () => {
    const result = normalizeEntry(LOCAL_ENTRY);
    assert.ok(result);
    assert.equal(result.type, "local");
    assert.ok(result.type === "local");
    assert.deepEqual(result.command, ["node", "server.js", "--port", "3000"]);
    assert.deepEqual(result.environment, { API_KEY: "secret" });
  });

  it("normalizes a remote entry", () => {
    const result = normalizeEntry(REMOTE_ENTRY);
    assert.ok(result);
    assert.equal(result.type, "remote");
    assert.ok(result.type === "remote");
    assert.equal(result.url, "https://example.com/mcp");
    assert.deepEqual(result.headers, { Authorization: "Bearer token" });
  });

  it("omits empty env from local entry", () => {
    const result = normalizeEntry({ command: "node" });
    assert.ok(result);
    assert.ok(result.type === "local");
    assert.equal(result.environment, undefined);
  });

  it("omits empty headers from remote entry", () => {
    const result = normalizeEntry({ type: "remote", url: "https://example.com", headers: {} });
    assert.ok(result);
    assert.ok(result.type === "remote");
    assert.equal(result.headers, undefined);
  });

  it("returns undefined for invalid entry", () => {
    assert.equal(normalizeEntry(null as any), undefined);
    assert.equal(normalizeEntry({} as any), undefined);
  });

  it("returns undefined for remote entry missing url", () => {
    assert.equal(normalizeEntry({ type: "remote" } as any), undefined);
  });

  it("filters non-string args", () => {
    const result = normalizeEntry({
      command: "node",
      args: ["valid", 123 as any, "also-valid"],
    });
    assert.ok(result);
    assert.ok(result.type === "local");
    assert.deepEqual(result.command, ["node", "valid", "also-valid"]);
  });
});

// --- Mutation tests ---

describe("addServer / removeServer / hasServer", () => {
  const empty: RegistryFile = { version: 1, servers: {} };

  it("adds a server", () => {
    const updated = addServer(empty, "test", LOCAL_ENTRY);
    assert.ok(hasServer(updated, "test"));
    assert.ok("command" in updated.servers.test && updated.servers.test.command === "node");
  });

  it("does not mutate the original", () => {
    const original: RegistryFile = { version: 1, servers: {} };
    addServer(original, "test", LOCAL_ENTRY);
    assert.ok(!hasServer(original, "test"));
  });

  it("removes a server", () => {
    const withServer = addServer(empty, "test", LOCAL_ENTRY);
    const removed = removeServer(withServer, "test");
    assert.ok(!hasServer(removed, "test"));
  });

  it("removes non-existent server without error", () => {
    const result = removeServer(empty, "ghost");
    assert.deepEqual(result.servers, {});
  });

  it("overwrites existing server on add", () => {
    const first = addServer(empty, "test", LOCAL_ENTRY);
    const second = addServer(first, "test", REMOTE_ENTRY);
    assert.ok("type" in second.servers.test && second.servers.test.type === "remote");
  });
});

// --- getRegisteredServers ---

describe("getRegisteredServers", () => {
  it("returns enabled servers in normalized format", () => {
    const servers = getRegisteredServers(REGISTRY);
    assert.equal(servers.length, 2);
    assert.ok(servers.some((s) => s.id === "local"));
    assert.ok(servers.some((s) => s.id === "remote"));
  });

  it("excludes disabled servers", () => {
    const registry: RegistryFile = {
      version: 1,
      servers: {
        enabled: { command: "node" },
        disabled: { command: "node", enabled: false },
      },
    };
    const servers = getRegisteredServers(registry);
    assert.equal(servers.length, 1);
    assert.equal(servers[0].id, "enabled");
  });

  it("returns empty array for empty registry", () => {
    const servers = getRegisteredServers({ version: 1, servers: {} });
    assert.deepEqual(servers, []);
  });
});
