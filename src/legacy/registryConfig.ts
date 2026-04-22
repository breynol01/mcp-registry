import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { serverEntrySchema } from "../schema.js";
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

  const rawEntries = parsed.servers as Record<string, unknown> | undefined;
  if (!rawEntries || typeof rawEntries !== "object") {
    return { servers: {}, warnings: ["mcp-registry.json: no servers key found"] };
  }

  // Validate each entry individually — reject malformed ones with warnings.
  // ${ENV_VAR} templates in headers and op:// URIs in env are preserved as-is.
  const servers: Record<string, ServerEntry> = {};
  const warnings: string[] = [];

  for (const [id, entry] of Object.entries(rawEntries)) {
    const result = serverEntrySchema.safeParse(entry);
    if (result.success) {
      servers[id] = result.data as ServerEntry;
    } else {
      const issues = result.error.issues.map((i) => i.message).join("; ");
      warnings.push(`mcp-registry.json: skipping "${id}": ${issues}`);
    }
  }

  return { servers, warnings };
}
