import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { serverEntrySchema } from "../schema.js";
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
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;

    let candidate: ServerEntry;

    if (entry.type === "remote") {
      if (!entry.url || typeof entry.url !== "string") {
        warnings.push(`opencode: skipping "${id}": remote entry missing url`);
        continue;
      }
      const remote: RemoteServerEntry = {
        type: "remote",
        url: entry.url,
      };
      if (typeof entry.enabled === "boolean") remote.enabled = entry.enabled;
      if (entry.oauth) {
        warnings.push(`${id}: oauth field detected but not yet supported in canonical format`);
        if (remote.enabled !== true) remote.enabled = false;
      }
      candidate = remote;
    } else {
      // Local entry — command is an array in opencode format
      const cmdArray = entry.command;
      if (!Array.isArray(cmdArray) || cmdArray.length === 0 || typeof cmdArray[0] !== "string") continue;

      const local: LocalServerEntry = {
        command: cmdArray[0],
      };
      if (cmdArray.length > 1) local.args = cmdArray.slice(1).filter((a): a is string => typeof a === "string");

      // opencode uses "environment" instead of "env"
      if (entry.environment && typeof entry.environment === "object") {
        const env = entry.environment as Record<string, string>;
        if (Object.keys(env).length > 0) local.env = env;
      }

      if (typeof entry.enabled === "boolean") local.enabled = entry.enabled;
      candidate = local;
    }

    // Validate the transformed entry against the schema
    const result = serverEntrySchema.safeParse(candidate);
    if (result.success) {
      servers[id] = candidate;
    } else {
      const issues = result.error.issues.map((i) => i.message).join("; ");
      warnings.push(`opencode: skipping "${id}": ${issues}`);
    }
  }

  return { servers, warnings };
}
