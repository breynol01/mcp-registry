# Memory: mcp-registry

## 2026-04-21 — Initial implementation + server migration

- Created mcp-registry library and CLI with full CRUD for local and remote MCP servers
- Implemented `migrate` command that consolidated 3 legacy config sources into canonical registry
- Migration result: 21 servers total (14 from mcp-registry.json, 5 from openclaw.json, 15 from opencode.json → deduplicated to 20 unique + 1 existing foundry)
- Special-case handling: beeper forced to local proxy version, google-mcp env merged with `enabled: false`, sentry oauth warning emitted
- `mcp-switchboard` excluded from migration (it's the consumer, not a server)

### 2026-04-22 — Hardening pass

- Removed unsafe `as` type casts in `normalizeEntry()` — objects now built fully at construction
- Removed redundant `as RegistryFile` cast from `loadRegistry()` (Zod infers correctly)
- Added error context to `saveRegistry()` with try/catch wrapping mkdir/writeFile
- Legacy parsers (opencode, openclaw, registryConfig) now validate each entry with `serverEntrySchema` before accepting; malformed entries are skipped with warnings
- CLI flag parser errors on `--flag` with no value and rejects `--flag --otherflag` as missing value
- Unknown CLI commands now print "Unknown command: X" and exit 1
- `list` command shows all servers including disabled (was filtering via `getRegisteredServers()`)
- Added `--json` flag to `list` for programmatic output
- `migrate()` no longer writes to disk if Zod validation of merged registry fails
- Exported `serverEntrySchema` from `schema.ts` for use by legacy parsers and external consumers

### 2026-04-21 — Legacy config cleanup completed

- Updated mcp-switchboard `defaultRegistryPath()` to return `~/.config/mcp/servers.json` (was `~/.config/mcp-registry.json`)
- Removed `OPENCODE_CONFIG_PATH` and `SWITCHBOARD_INCLUDE` env vars from openclaw.json switchboard entry
- Removed entire `mcp` key from `~/.config/opencode/opencode.json` (kept permission, plugin, provider, tools)
- Deleted `~/.config/mcp-registry.json` (fully superseded by canonical registry)
- All 46 switchboard tests pass with new default path
