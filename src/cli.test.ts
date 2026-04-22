import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "dist", "cli.js");

const EMPTY_REGISTRY = join(tmpdir(), `mcp-registry-cli-test-${Date.now()}`, "empty.json");

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
