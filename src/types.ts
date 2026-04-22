/**
 * Canonical MCP server registry types.
 *
 * These types define the on-disk format at ~/.config/mcp/servers.json
 * and the normalized in-memory representation consumed by MCP clients
 * (switchboard, Claude Code, OpenCode, etc.).
 */

// --- On-disk format (what users write in servers.json) ---

export interface LocalServerEntry {
  type?: "local";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
  metadata?: ServerMetadata;
}

export interface RemoteServerEntry {
  type: "remote";
  url: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
  metadata?: ServerMetadata;
}

export type ServerEntry = LocalServerEntry | RemoteServerEntry;

export interface ServerMetadata {
  description?: string;
  repository?: string;
}

export interface RegistryFile {
  version: number;
  servers: Record<string, ServerEntry>;
}

// --- Normalized format (what consumers receive) ---

export type NormalizedServerConfig =
  | {
      type: "local";
      command: string[];
      environment?: Record<string, string>;
      enabled?: boolean;
      timeout?: number;
    }
  | {
      type: "remote";
      url: string;
      headers?: Record<string, string>;
      enabled?: boolean;
      timeout?: number;
    };

export interface RegisteredServer {
  id: string;
  config: NormalizedServerConfig;
  metadata?: ServerMetadata;
}
