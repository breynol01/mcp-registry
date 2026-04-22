#!/usr/bin/env node

import {
  DEFAULT_REGISTRY_PATH,
  loadRegistry,
  saveRegistry,
  addServer,
  removeServer,
  hasServer,
  getRegisteredServers,
} from "./registry.js";
import type { LocalServerEntry, RemoteServerEntry } from "./types.js";

const USAGE = `mcp-registry — Canonical MCP server registry

Usage:
  mcp-registry list                       List registered servers
  mcp-registry add <id> [options]         Add a local server
  mcp-registry add-remote <id> [options]  Add a remote server
  mcp-registry remove <id>               Remove a server
  mcp-registry migrate                   Migrate legacy configs to registry
    --dry-run                            Show changes without writing
    --source <src1,src2,...>             Sources: opencode,openclaw,registry (default: all)
  mcp-registry validate                   Validate the registry file
  mcp-registry path                       Print the registry file path

Options for 'add':
  --command <cmd>         Server command (required)
  --args <a1,a2,...>      Command arguments (comma-separated)
  --env <KEY=VAL,...>     Environment variables (comma-separated)
  --description <text>    Server description
  --repository <url>      Source repository URL

Options for 'add-remote':
  --url <url>             Server URL (required)
  --headers <K=V,...>     Headers (comma-separated)
  --description <text>    Server description

Environment:
  MCP_REGISTRY_PATH       Override registry file path (default: ${DEFAULT_REGISTRY_PATH})
`;

function getRegistryPath(): string {
  return process.env.MCP_REGISTRY_PATH || DEFAULT_REGISTRY_PATH;
}

const BOOLEAN_FLAGS = new Set(["dry-run"]);

function parseArgs(argv: string[]): { command: string; positional: string[]; flags: Record<string, string> } {
  const command = argv[0] || "help";
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = "true";
      } else if (i + 1 < argv.length) {
        flags[key] = argv[++i];
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

function parseKeyValueList(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) {
      result[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
    }
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const { command, positional, flags } = parseArgs(args);
  const registryPath = getRegistryPath();

  switch (command) {
    case "path": {
      console.log(registryPath);
      break;
    }

    case "list": {
      const registry = await loadRegistry(registryPath);
      const servers = getRegisteredServers(registry);
      if (servers.length === 0) {
        console.log("No servers registered.");
        break;
      }
      for (const s of servers) {
        const type = s.config.type;
        const target = type === "local"
          ? s.config.command.join(" ")
          : s.config.url;
        const desc = s.metadata?.description ? ` — ${s.metadata.description}` : "";
        const status = s.config.enabled === false ? " [disabled]" : "";
        console.log(`  ${s.id}  (${type})  ${target}${desc}${status}`);
      }
      console.log(`\n${servers.length} server(s) registered.`);
      break;
    }

    case "add": {
      const id = positional[0];
      if (!id || !flags.command) {
        console.error("Usage: mcp-registry add <id> --command <cmd> [--args a1,a2] [--env K=V,K=V]");
        process.exit(1);
      }

      const entry: LocalServerEntry = {
        command: flags.command,
      };
      if (flags.args) entry.args = flags.args.split(",");
      if (flags.env) entry.env = parseKeyValueList(flags.env);
      if (flags.description || flags.repository) {
        entry.metadata = {};
        if (flags.description) entry.metadata.description = flags.description;
        if (flags.repository) entry.metadata.repository = flags.repository;
      }

      let registry = await loadRegistry(registryPath);
      if (hasServer(registry, id)) {
        console.error(`Server "${id}" already exists. Remove it first or use a different ID.`);
        process.exit(1);
      }

      registry = addServer(registry, id, entry);
      await saveRegistry(registry, registryPath);
      console.log(`Added server "${id}" → ${flags.command}`);
      break;
    }

    case "add-remote": {
      const id = positional[0];
      if (!id || !flags.url) {
        console.error("Usage: mcp-registry add-remote <id> --url <url> [--headers K=V,K=V]");
        process.exit(1);
      }

      const entry: RemoteServerEntry = {
        type: "remote",
        url: flags.url,
      };
      if (flags.headers) entry.headers = parseKeyValueList(flags.headers);
      if (flags.description) {
        entry.metadata = { description: flags.description };
      }

      let registry = await loadRegistry(registryPath);
      if (hasServer(registry, id)) {
        console.error(`Server "${id}" already exists. Remove it first or use a different ID.`);
        process.exit(1);
      }

      registry = addServer(registry, id, entry);
      await saveRegistry(registry, registryPath);
      console.log(`Added remote server "${id}" → ${flags.url}`);
      break;
    }

    case "remove": {
      const id = positional[0];
      if (!id) {
        console.error("Usage: mcp-registry remove <id>");
        process.exit(1);
      }

      let registry = await loadRegistry(registryPath);
      if (!hasServer(registry, id)) {
        console.error(`Server "${id}" not found.`);
        process.exit(1);
      }

      registry = removeServer(registry, id);
      await saveRegistry(registry, registryPath);
      console.log(`Removed server "${id}".`);
      break;
    }

    case "validate": {
      try {
        const registry = await loadRegistry(registryPath);
        const count = Object.keys(registry.servers).length;
        console.log(`Registry at ${registryPath} is valid. ${count} server(s) defined.`);
      } catch (err) {
        console.error(`Validation failed: ${(err as Error).message}`);
        process.exit(1);
      }
      break;
    }

    case "migrate": {
      const { migrate } = await import("./legacy/index.js");
      type SourceName = "opencode" | "openclaw" | "registry";
      const dryRun = flags["dry-run"] === "true";
      const sources = flags.source
        ? (flags.source.split(",") as SourceName[])
        : undefined;

      const result = await migrate({ dryRun, sources, registryPath });

      for (const w of result.warnings) {
        console.log(`  \u26a0 ${w}`);
      }
      if (result.warnings.length > 0) console.log();

      const ids = Object.keys(result.servers).sort();
      for (const id of ids) {
        const entry = result.servers[id];
        const isRemote = "type" in entry && entry.type === "remote";
        const type = isRemote ? "remote" : "local";
        const target = isRemote
          ? (entry as RemoteServerEntry).url
          : (entry as LocalServerEntry).command;
        const status = entry.enabled === false ? " [disabled]" : "";
        const from = result.sources[id]?.length
          ? ` \u2190 ${result.sources[id].join(", ")}`
          : " \u2190 existing";
        console.log(`  ${id}  (${type})  ${target}${status}${from}`);
      }

      if (dryRun) {
        console.log(`\nDry run: ${ids.length} server(s) would be in registry. No files written.`);
      } else {
        console.log(`\nMigrated to ${registryPath}. ${ids.length} server(s) total.`);
      }
      break;
    }

    case "help":
    case "--help":
    case "-h":
    default:
      console.log(USAGE);
      break;
  }
}

main().catch((err) => {
  console.error(`mcp-registry: ${(err as Error).message}`);
  process.exit(1);
});
