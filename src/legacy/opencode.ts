import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import type { ServerEntry, LocalServerEntry, RemoteServerEntry } from "../types.js";

export const OPENCODE_PATH = join(homedir(), ".config", "opencode", "opencode.json");

const EXCLUDED = new Set(["mcp-switchboard"]);

interface ParseResult {
  servers: Record<string, ServerEntry>;
  warnings: string[];
}

export async function parseOpenCode(path: string = OPENCODE_PATH): Promise<ParseResult> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { servers: {}, warnings: [] };
    }
    throw new Error(`Failed to read opencode config at ${path}: ${(err as Error).message}`);
  }

  const parsed = parseJsonc(raw);
  const mcp = parsed?.mcp;
  if (!mcp || typeof mcp !== "object") {
    return { servers: {}, warnings: ["opencode.json: no mcp key found"] };
  }

  const servers: Record<string, ServerEntry> = {};
  const warnings: string[] = [];

  for (const [id, raw] of Object.entries(mcp)) {
    if (EXCLUDED.has(id)) continue;
    const entry = raw as Record<string, unknown>;

    if (entry.type === "remote") {
      const remote: RemoteServerEntry = {
        type: "remote",
        url: entry.url as string,
      };
      if (entry.enabled !== undefined) remote.enabled = entry.enabled as boolean;
      if (entry.oauth) {
        warnings.push(`${id}: oauth field detected but not yet supported in canonical format`);
        if (remote.enabled !== true) remote.enabled = false;
      }
      servers[id] = remote;
      continue;
    }

    // Local entry — command is an array in opencode format
    const cmdArray = entry.command as string[] | undefined;
    if (!cmdArray || !Array.isArray(cmdArray) || cmdArray.length === 0) continue;

    const local: LocalServerEntry = {
      command: cmdArray[0],
    };
    if (cmdArray.length > 1) local.args = cmdArray.slice(1);

    // opencode uses "environment" instead of "env"
    const environment = entry.environment as Record<string, string> | undefined;
    if (environment && Object.keys(environment).length > 0) {
      local.env = environment;
    }

    if (entry.enabled !== undefined) local.enabled = entry.enabled as boolean;

    servers[id] = local;
  }

  return { servers, warnings };
}
