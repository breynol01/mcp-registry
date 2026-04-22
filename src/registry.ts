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

  return result.data as RegistryFile;
}

// --- Write ---

export async function saveRegistry(
  registry: RegistryFile,
  path: string = DEFAULT_REGISTRY_PATH,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const json = JSON.stringify(registry, null, 2) + "\n";
  await writeFile(path, json, "utf-8");
}

// --- Normalize ---

export function normalizeEntry(entry: ServerEntry): NormalizedServerConfig | undefined {
  if (!entry || typeof entry !== "object") return undefined;

  if ("type" in entry && entry.type === "remote") {
    if (!entry.url || typeof entry.url !== "string") return undefined;
    const config: NormalizedServerConfig = {
      type: "remote",
      url: entry.url,
      enabled: entry.enabled,
      timeout: entry.timeout,
    };
    if (entry.headers && Object.keys(entry.headers).length > 0) {
      (config as { headers: Record<string, string> }).headers = entry.headers;
    }
    return config;
  }

  const local = entry;
  if (!("command" in local) || typeof local.command !== "string" || local.command.trim() === "") {
    return undefined;
  }

  const args = Array.isArray(local.args)
    ? local.args.filter((a): a is string => typeof a === "string")
    : [];

  const config: NormalizedServerConfig = {
    type: "local",
    command: [local.command, ...args],
    enabled: local.enabled,
    timeout: local.timeout,
  };

  if (local.env && Object.keys(local.env).length > 0) {
    (config as { environment: Record<string, string> }).environment = local.env;
  }

  return config;
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
