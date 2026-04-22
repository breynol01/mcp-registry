# Memory: mcp-registry

## 2026-04-21 — Initial implementation + server migration

- Created mcp-registry library and CLI with full CRUD for local and remote MCP servers
- Implemented `migrate` command that consolidated 3 legacy config sources into canonical registry
- Migration result: 21 servers total (14 from mcp-registry.json, 5 from openclaw.json, 15 from opencode.json → deduplicated to 20 unique + 1 existing foundry)
- Special-case handling: beeper forced to local proxy version, google-mcp env merged with `enabled: false`, sentry oauth warning emitted
- `mcp-switchboard` excluded from migration (it's the consumer, not a server)

### 2026-04-21 — Legacy config cleanup completed

- Updated mcp-switchboard `defaultRegistryPath()` to return `~/.config/mcp/servers.json` (was `~/.config/mcp-registry.json`)
- Removed `OPENCODE_CONFIG_PATH` and `SWITCHBOARD_INCLUDE` env vars from openclaw.json switchboard entry
- Removed entire `mcp` key from `~/.config/opencode/opencode.json` (kept permission, plugin, provider, tools)
- Deleted `~/.config/mcp-registry.json` (fully superseded by canonical registry)
- All 46 switchboard tests pass with new default path
