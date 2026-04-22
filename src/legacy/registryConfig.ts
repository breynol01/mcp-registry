import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ServerEntry } from "../types.js";

export const REGISTRY_CONFIG_PATH = join(homedir(), ".config", "mcp-registry.json");

interface ParseResult {
  servers: Record<string, ServerEntry>;
  warnings: string[];
}

export async function parseRegistryConfig(path: string = REGISTRY_CONFIG_PATH): Promise<ParseResult> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { servers: {}, warnings: [] };
    }
    throw new Error(`Failed to read registry config at ${path}: ${(err as Error).message}`);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse registry config JSON at ${path}`);
  }

  const entries = parsed.servers as Record<string, ServerEntry> | undefined;
  if (!entries) {
    return { servers: {}, warnings: ["mcp-registry.json: no servers key found"] };
  }

  // Already near-canonical format — pass through directly.
  // ${ENV_VAR} templates in headers and op:// URIs in env are preserved as-is.
  const servers: Record<string, ServerEntry> = { ...entries };

  return { servers, warnings: [] };
}
