# Memory: mcp-registry

## 2026-04-21 — Initial implementation + server migration

- Created mcp-registry library and CLI with full CRUD for local and remote MCP servers
- Implemented `migrate` command that consolidated 3 legacy config sources into canonical registry
- Migration result: 21 servers total (14 from mcp-registry.json, 5 from openclaw.json, 15 from opencode.json → deduplicated to 20 unique + 1 existing foundry)
- Special-case handling: beeper forced to local proxy version, google-mcp env merged with `enabled: false`, sentry oauth warning emitted
- `mcp-switchboard` excluded from migration (it's the consumer, not a server)

### Pending: Legacy config cleanup

After confirming the switchboard loads correctly from `~/.config/mcp/servers.json`:

1. Remove the `mcp` key from `~/.config/opencode/opencode.json` (keep other opencode settings like provider, permission, plugin, tools)
2. Delete `~/.config/mcp-registry.json` (fully superseded)
3. Update `~/.openclaw/openclaw.json` — remove `servers` entries that are now in the canonical registry; keep the `mcp-switchboard` entry since OpenClaw needs it as its MCP transport
4. Remove `SWITCHBOARD_INCLUDE` env var from all configs (no longer needed — switchboard reads the full canonical registry)
