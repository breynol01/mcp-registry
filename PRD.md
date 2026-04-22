# PRD: mcp-registry

## Problem

MCP server configurations were scattered across three independent config files (opencode.json, openclaw.json, mcp-registry.json) with overlapping, sometimes conflicting entries. No single tool could discover all available servers, and adding or removing a server required editing multiple files.

## Solution

A canonical registry library and CLI at `~/.config/mcp/servers.json` that:

1. Defines a single schema for local and remote MCP servers
2. Provides CRUD operations via CLI (`add`, `add-remote`, `remove`, `list`, `validate`)
3. Exposes a library API for programmatic access by MCP clients (switchboard, Claude Code, OpenCode)
4. Includes a `migrate` command to consolidate legacy configs into the canonical registry

## Success Criteria

- [x] All MCP-aware tools read from `~/.config/mcp/servers.json` as the sole source of truth
- [x] `mcp-registry migrate` consolidates all legacy sources (21 servers, 0 validation errors)
- [x] Schema validation via Zod catches malformed entries at load time
- [x] CLI supports full CRUD lifecycle for both local and remote servers
- [x] Legacy config files cleaned up (opencode mcp key removed, mcp-registry.json deleted, openclaw servers trimmed)
- [x] Legacy parsers validate entries with Zod before accepting (hardened 2026-04-22)
- [x] CLI robustness: unknown command errors, flag validation, disabled server visibility, JSON output

## Assumptions

- Server IDs are globally unique across all sources
- `op://` URIs and `${ENV_VAR}` templates are resolved downstream (switchboard, not registry)
- The registry is a flat file — no locking or concurrent-write protection needed for single-user use

## Constraints

- Node >=18, ESM only
- Minimal dependencies (zod for validation, jsonc-parser for JSONC)
- No network calls — the registry is a local file
