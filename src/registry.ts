import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { registryFileSchema } from "./schema.js";
import type {
  RegistryFile,
  ServerEntry,
  NormalizedServerConfig,
  RegisteredServer,
} from "./types.js";

export const DEFAULT_REGISTRY_PATH = join(homedir(), ".config", "mcp", "servers.json");
const CURRENT_VERSION = 1;

// --- Read ---

export async function loadRegistry(
  path: string = DEFAULT_REGISTRY_PATH,
): Promise<RegistryFile> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: CURRENT_VERSION, servers: {} };
    }
    throw new Error(`Failed to read registry at ${path}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse registry JSON at ${path}`);
  }

  const result = registryFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid registry at ${path}:\n${issues}`);
  }

  return result.data;
}

// --- Write ---

export async function saveRegistry(
  registry: RegistryFile,
  path: string = DEFAULT_REGISTRY_PATH,
): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    const json = JSON.stringify(registry, null, 2) + "\n";
    await writeFile(path, json, "utf-8");
  } catch (err) {
    throw new Error(`Failed to write registry at ${path}: ${(err as Error).message}`);
  }
}

// --- Normalize ---

export function normalizeEntry(entry: ServerEntry): NormalizedServerConfig | undefined {
  if (!entry || typeof entry !== "object") return undefined;

  if ("type" in entry && entry.type === "remote") {
    if (!entry.url || typeof entry.url !== "string") return undefined;
    const headers = entry.headers && Object.keys(entry.headers).length > 0
      ? entry.headers
      : undefined;
    return {
      type: "remote" as const,
      url: entry.url,
      ...(headers && { headers }),
      ...(entry.enabled !== undefined && { enabled: entry.enabled }),
      ...(entry.timeout !== undefined && { timeout: entry.timeout }),
    };
  }

  const local = entry;
  if (!("command" in local) || typeof local.command !== "string" || local.command.trim() === "") {
    return undefined;
  }

  const args = Array.isArray(local.args)
    ? local.args.filter((a): a is string => typeof a === "string")
    : [];

  const environment = local.env && Object.keys(local.env).length > 0
    ? local.env
    : undefined;

  return {
    type: "local" as const,
    command: [local.command, ...args],
    ...(environment && { environment }),
    ...(local.enabled !== undefined && { enabled: local.enabled }),
    ...(local.timeout !== undefined && { timeout: local.timeout }),
  };
}

export function getRegisteredServers(registry: RegistryFile): RegisteredServer[] {
  const results: RegisteredServer[] = [];
  for (const [id, entry] of Object.entries(registry.servers)) {
    const config = normalizeEntry(entry);
    if (!config || config.enabled === false) continue;
    results.push({ id, config, metadata: entry.metadata });
  }
  return results;
}

// --- Mutate ---

export function addServer(
  registry: RegistryFile,
  id: string,
  entry: ServerEntry,
): RegistryFile {
  return {
    ...registry,
    servers: { ...registry.servers, [id]: entry },
  };
}

export function removeServer(
  registry: RegistryFile,
  id: string,
): RegistryFile {
  const { [id]: _, ...rest } = registry.servers;
  return { ...registry, servers: rest };
}

export function hasServer(registry: RegistryFile, id: string): boolean {
  return id in registry.servers;
}
