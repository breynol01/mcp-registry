import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ServerEntry, LocalServerEntry, RemoteServerEntry } from "../types.js";

export const OPENCLAW_PATH = join(homedir(), ".openclaw", "openclaw.json");

const EXCLUDED = new Set(["mcp-switchboard"]);

interface ParseResult {
  servers: Record<string, ServerEntry>;
  warnings: string[];
}

export async function parseOpenClaw(path: string = OPENCLAW_PATH): Promise<ParseResult> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { servers: {}, warnings: [] };
    }
    throw new Error(`Failed to read openclaw config at ${path}: ${(err as Error).message}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse openclaw JSON at ${path}`);
  }

  const mcp = parsed.mcp as Record<string, unknown> | undefined;
  const entries = mcp?.servers as Record<string, Record<string, unknown>> | undefined;
  if (!entries) {
    return { servers: {}, warnings: ["openclaw.json: no mcp.servers key found"] };
  }

  const servers: Record<string, ServerEntry> = {};
  const warnings: string[] = [];

  for (const [id, entry] of Object.entries(entries)) {
    if (EXCLUDED.has(id)) continue;

    // Remote: has url field (transport: "streamable-http" or similar)
    if (entry.url && typeof entry.url === "string") {
      const remote: RemoteServerEntry = {
        type: "remote",
        url: entry.url,
      };
      if (entry.headers && typeof entry.headers === "object") {
        remote.headers = entry.headers as Record<string, string>;
      }
      servers[id] = remote;
      continue;
    }

    // Local: command + args, type "stdio" → drop type
    if (entry.command && typeof entry.command === "string") {
      const local: LocalServerEntry = {
        command: entry.command,
      };
      if (Array.isArray(entry.args)) {
        local.args = entry.args as string[];
      }
      if (entry.env && typeof entry.env === "object") {
        local.env = entry.env as Record<string, string>;
      }
      servers[id] = local;
    }
  }

  return { servers, warnings };
}
