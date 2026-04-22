import { loadRegistry, saveRegistry } from "../registry.js";
import { registryFileSchema } from "../schema.js";
import type { ServerEntry, LocalServerEntry, RegistryFile } from "../types.js";
import { parseOpenCode } from "./opencode.js";
import { parseOpenClaw } from "./openclaw.js";
import { parseRegistryConfig } from "./registryConfig.js";

export type SourceName = "opencode" | "openclaw" | "registry";

export interface MigrationResult {
  servers: Record<string, ServerEntry>;
  sources: Record<string, SourceName[]>;
  warnings: string[];
}

const ALL_SOURCES: SourceName[] = ["opencode", "openclaw", "registry"];

// Source priority for tie-breaking (higher index = higher priority)
const SOURCE_PRIORITY: Record<SourceName, number> = {
  opencode: 0,
  openclaw: 1,
  registry: 2,
};

export async function loadAllSources(
  selected?: SourceName[],
): Promise<{ bySource: Record<SourceName, Record<string, ServerEntry>>; warnings: string[] }> {
  const sources = selected ?? ALL_SOURCES;
  const bySource: Record<string, Record<string, ServerEntry>> = {};
  const warnings: string[] = [];

  for (const name of sources) {
    let result: { servers: Record<string, ServerEntry>; warnings: string[] };
    switch (name) {
      case "opencode":
        result = await parseOpenCode();
        break;
      case "openclaw":
        result = await parseOpenClaw();
        break;
      case "registry":
        result = await parseRegistryConfig();
        break;
    }
    bySource[name] = result.servers;
    warnings.push(...result.warnings);
  }

  return { bySource: bySource as Record<SourceName, Record<string, ServerEntry>>, warnings };
}

function countFields(entry: ServerEntry): number {
  let count = 0;
  if ("command" in entry && entry.command) count++;
  if ("args" in entry && entry.args && entry.args.length > 0) count++;
  if ("env" in entry && entry.env && Object.keys(entry.env).length > 0) count++;
  if ("url" in entry && entry.url) count++;
  if ("headers" in entry && entry.headers && Object.keys(entry.headers).length > 0) count++;
  if (entry.enabled !== undefined) count++;
  if (entry.metadata) count++;
  if (entry.timeout !== undefined) count++;
  return count;
}

function isLocal(entry: ServerEntry): entry is LocalServerEntry {
  return !("type" in entry && entry.type === "remote");
}

export function mergeServers(
  bySource: Record<SourceName, Record<string, ServerEntry>>,
): { servers: Record<string, ServerEntry>; sources: Record<string, SourceName[]>; warnings: string[] } {
  // Collect all unique server IDs
  const allIds = new Set<string>();
  for (const entries of Object.values(bySource)) {
    for (const id of Object.keys(entries)) {
      allIds.add(id);
    }
  }

  const servers: Record<string, ServerEntry> = {};
  const sources: Record<string, SourceName[]> = {};
  const warnings: string[] = [];

  for (const id of allIds) {
    // Track which sources have this server
    const presentIn: SourceName[] = [];
    for (const [source, entries] of Object.entries(bySource)) {
      if (id in entries) presentIn.push(source as SourceName);
    }
    sources[id] = presentIn;

    // Hard-coded override: beeper always uses registry version (local proxy)
    if (id === "beeper" && bySource.registry?.[id]) {
      servers[id] = bySource.registry[id];
      if (presentIn.length > 1) {
        warnings.push("beeper: using registry version (local proxy) over openclaw (remote)");
      }
      continue;
    }

    // Hard-coded override: google-mcp merges env from opencode, keeps registry base
    if (id === "google-mcp" && bySource.registry?.[id] && bySource.opencode?.[id]) {
      const base = bySource.registry[id];
      const opencode = bySource.opencode[id];
      if (isLocal(base) && isLocal(opencode)) {
        const mergedEnv = { ...(opencode.env ?? {}), ...(base.env ?? {}) };
        servers[id] = { ...base, env: mergedEnv, enabled: false };
        warnings.push("google-mcp: merged env vars from opencode; set enabled: false");
        continue;
      }
    }

    if (presentIn.length === 1) {
      servers[id] = bySource[presentIn[0]][id];
      continue;
    }

    // Dedup: richest config wins, break ties by source priority
    let best: { source: SourceName; entry: ServerEntry; score: number } | undefined;
    for (const source of presentIn) {
      const entry = bySource[source][id];
      const score = countFields(entry);
      if (
        !best ||
        score > best.score ||
        (score === best.score && SOURCE_PRIORITY[source] > SOURCE_PRIORITY[best.source])
      ) {
        best = { source, entry, score };
      }
    }
    servers[id] = best!.entry;
  }

  return { servers, sources, warnings };
}

export async function migrate(options: {
  dryRun?: boolean;
  sources?: SourceName[];
  registryPath?: string;
}): Promise<MigrationResult> {
  const { dryRun = false, sources, registryPath } = options;

  // Load all legacy sources
  const loaded = await loadAllSources(sources);
  const warnings = [...loaded.warnings];

  // Merge/dedup
  const merged = mergeServers(loaded.bySource);
  warnings.push(...merged.warnings);

  // Load existing canonical registry (preserves foundry, etc.)
  const existing = await loadRegistry(registryPath);
  const finalServers = { ...existing.servers, ...merged.servers };
  const finalRegistry: RegistryFile = {
    version: existing.version,
    servers: finalServers,
  };

  // Validate
  const validation = registryFileSchema.safeParse(finalRegistry);
  if (!validation.success) {
    for (const issue of validation.error.issues) {
      warnings.push(`validation: ${issue.path.join(".")}: ${issue.message}`);
    }
  }

  // Write unless dry-run
  if (!dryRun) {
    await saveRegistry(finalRegistry, registryPath);
  }

  // Include existing servers in source tracking
  for (const id of Object.keys(existing.servers)) {
    if (!(id in merged.sources)) {
      merged.sources[id] = [];
    }
  }

  return { servers: finalServers, sources: merged.sources, warnings };
}
