import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registryFileSchema, serverEntrySchema } from "./schema.js";

describe("serverEntrySchema", () => {
  it("accepts a valid local server", () => {
    const result = serverEntrySchema.safeParse({
      command: "node",
      args: ["server.js"],
      env: { KEY: "value" },
    });
    assert.ok(result.success);
  });

  it("accepts a local server with explicit type", () => {
    const result = serverEntrySchema.safeParse({
      type: "local",
      command: "npx",
    });
    assert.ok(result.success);
  });

  it("rejects a local server with empty command", () => {
    const result = serverEntrySchema.safeParse({ command: "" });
    assert.ok(!result.success);
  });

  it("accepts a valid remote server", () => {
    const result = serverEntrySchema.safeParse({
      type: "remote",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer token" },
    });
    assert.ok(result.success);
  });

  it("rejects a remote server with invalid url", () => {
    const result = serverEntrySchema.safeParse({
      type: "remote",
      url: "not-a-url",
    });
    assert.ok(!result.success);
  });

  it("rejects a remote server without url", () => {
    const result = serverEntrySchema.safeParse({ type: "remote" });
    assert.ok(!result.success);
  });

  it("accepts optional fields", () => {
    const result = serverEntrySchema.safeParse({
      command: "node",
      enabled: false,
      timeout: 30000,
      metadata: {
        description: "Test server",
        repository: "https://github.com/test/repo",
      },
    });
    assert.ok(result.success);
  });

  it("rejects negative timeout", () => {
    const result = serverEntrySchema.safeParse({
      command: "node",
      timeout: -1,
    });
    assert.ok(!result.success);
  });
});

describe("registryFileSchema", () => {
  it("accepts a valid registry file", () => {
    const result = registryFileSchema.safeParse({
      version: 1,
      servers: {
        test: { command: "node", args: ["server.js"] },
        remote: { type: "remote", url: "https://example.com/mcp" },
      },
    });
    assert.ok(result.success);
  });

  it("accepts an empty servers object", () => {
    const result = registryFileSchema.safeParse({
      version: 1,
      servers: {},
    });
    assert.ok(result.success);
  });

  it("rejects missing version", () => {
    const result = registryFileSchema.safeParse({
      servers: { test: { command: "node" } },
    });
    assert.ok(!result.success);
  });

  it("rejects non-integer version", () => {
    const result = registryFileSchema.safeParse({
      version: 1.5,
      servers: {},
    });
    assert.ok(!result.success);
  });

  it("rejects invalid server entries inside registry", () => {
    const result = registryFileSchema.safeParse({
      version: 1,
      servers: {
        bad: { type: "remote" }, // missing url
      },
    });
    assert.ok(!result.success);
  });
});
