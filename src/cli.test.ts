import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "dist", "cli.js");

const TEST_DIR = join(tmpdir(), `mcp-registry-cli-test-${Date.now()}`);
const EMPTY_REGISTRY = join(TEST_DIR, "empty.json");

after(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

function run(...args: string[]) {
  return exec("node", [CLI, ...args], {
    env: { ...process.env, MCP_REGISTRY_PATH: EMPTY_REGISTRY },
  });
}

function runExpectFail(...args: string[]) {
  return exec("node", [CLI, ...args], {
    env: { ...process.env, MCP_REGISTRY_PATH: EMPTY_REGISTRY },
  }).then(
    () => { throw new Error("Expected command to fail"); },
    (err) => err as { stderr: string; stdout: string; code: number },
  );
}

describe("CLI: path", () => {
  it("prints the registry path", async () => {
    const { stdout } = await exec("node", [CLI, "path"], {
      env: { ...process.env, MCP_REGISTRY_PATH: "/custom/path.json" },
    });
    assert.equal(stdout.trim(), "/custom/path.json");
  });
});

describe("CLI: list", () => {
  it("shows empty message when no servers", async () => {
    const { stdout } = await run("list");
    assert.match(stdout, /No servers registered/);
  });
});

describe("CLI: unknown command", () => {
  it("prints error and exits 1", async () => {
    const err = await runExpectFail("foobar");
    assert.match(err.stderr, /Unknown command: foobar/);
  });
});

describe("CLI: help", () => {
  it("shows usage text", async () => {
    const { stdout } = await run("help");
    assert.match(stdout, /mcp-registry/);
    assert.match(stdout, /Usage:/);
  });

  it("responds to --help", async () => {
    const { stdout } = await run("--help");
    assert.match(stdout, /Usage:/);
  });
});

describe("CLI: flag validation", () => {
  it("errors on flag with no value", async () => {
    const err = await runExpectFail("add", "test", "--command");
    assert.match(err.stderr, /Missing value for --command/);
  });

  it("errors on flag followed by another flag", async () => {
    const err = await runExpectFail("add-remote", "test", "--url", "--description");
    assert.match(err.stderr, /Missing value for --url/);
  });
});

describe("CLI: add validation", () => {
  it("errors without id", async () => {
    const err = await runExpectFail("add");
    assert.match(err.stderr, /Usage:/);
  });

  it("errors without --command", async () => {
    const err = await runExpectFail("add", "test-id");
    assert.match(err.stderr, /Usage:/);
  });
});

describe("CLI: add-remote validation", () => {
  it("errors without id", async () => {
    const err = await runExpectFail("add-remote");
    assert.match(err.stderr, /Usage:/);
  });

  it("errors without --url", async () => {
    const err = await runExpectFail("add-remote", "test-id");
    assert.match(err.stderr, /Usage:/);
  });
});

describe("CLI: remove validation", () => {
  it("errors without id", async () => {
    const err = await runExpectFail("remove");
    assert.match(err.stderr, /Usage:/);
  });
});

// --- Success-path roundtrip tests ---

describe("CLI: add + list + remove roundtrip", () => {
  // Use an isolated registry for these tests
  const roundtripRegistry = join(TEST_DIR, "roundtrip.json");

  function rtRun(...args: string[]) {
    return exec("node", [CLI, ...args], {
      env: { ...process.env, MCP_REGISTRY_PATH: roundtripRegistry },
    });
  }

  function rtFail(...args: string[]) {
    return exec("node", [CLI, ...args], {
      env: { ...process.env, MCP_REGISTRY_PATH: roundtripRegistry },
    }).then(
      () => { throw new Error("Expected command to fail"); },
      (err) => err as { stderr: string; stdout: string; code: number },
    );
  }

  it("adds a local server and shows it in list", async () => {
    await rtRun("add", "test-local", "--command", "node", "--args", "server.js", "--description", "Test server");
    const { stdout } = await rtRun("list");
    assert.match(stdout, /test-local/);
    assert.match(stdout, /local/);
    assert.match(stdout, /Test server/);
  });

  it("rejects duplicate server id", async () => {
    const err = await rtFail("add", "test-local", "--command", "node");
    assert.match(err.stderr, /already exists/);
  });

  it("adds a remote server", async () => {
    await rtRun("add-remote", "test-remote", "--url", "https://example.com/mcp", "--description", "Remote test");
    const { stdout } = await rtRun("list");
    assert.match(stdout, /test-remote/);
    assert.match(stdout, /remote/);
  });

  it("outputs valid JSON with --json", async () => {
    const { stdout } = await rtRun("list", "--json");
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.version, 1);
    assert.ok("test-local" in parsed.servers);
    assert.ok("test-remote" in parsed.servers);
  });

  it("validates the registry", async () => {
    const { stdout } = await rtRun("validate");
    assert.match(stdout, /valid/);
    assert.match(stdout, /2 server/);
  });

  it("removes a server", async () => {
    await rtRun("remove", "test-local");
    const { stdout } = await rtRun("list");
    assert.ok(!stdout.includes("test-local"));
    assert.match(stdout, /test-remote/);
  });

  it("errors removing non-existent server", async () => {
    const err = await rtFail("remove", "ghost");
    assert.match(err.stderr, /not found/);
  });
});
