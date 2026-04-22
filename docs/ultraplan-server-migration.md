# Ultraplan: Migrate All MCP Servers to Canonical Registry

**Goal:** Consolidate all MCP server entries from three legacy config sources into `~/.config/mcp/servers.json`, producing a single source of truth.

---

## Context

Three config files currently define MCP servers with overlapping, sometimes conflicting entries:

| Source | Path | Format | Servers |
|--------|------|--------|---------|
| opencode.json | `~/.config/opencode/opencode.json` | JSONC, `mcp` key | 15 (most `enabled: false`, gated by SWITCHBOARD_INCLUDE) |
| openclaw.json | `~/.openclaw/openclaw.json` | JSON, `servers` key | 5 (mcp-switchboard, typeform, qmd, beeper, railway) |
| mcp-registry.json | `~/.config/mcp-registry.json` | JSON, `servers` key | 14 (mixed local + remote, most `enabled: true`) |

The canonical registry at `~/.config/mcp/servers.json` currently has 1 server (foundry). After migration it should contain every unique server from all three sources.

---

## Architecture

```
Legacy sources (read-only after migration):
  ~/.config/opencode/opencode.json       ─┐
  ~/.openclaw/openclaw.json              ─┼── deduplicate + merge ──▶ ~/.config/mcp/servers.json
  ~/.config/mcp-registry.json            ─┘

Canonical registry (single source of truth):
  ~/.config/mcp/servers.json
    └── version: 1
        └── servers: { all unique servers }
```

---

## Server Inventory (deduplicated)

Cross-referencing all three sources, here is the complete set of unique servers. Where a server appears in multiple sources, the richest config (most fields populated) takes precedence.

### Local servers

| ID | Command | Source(s) | Notes |
|----|---------|-----------|-------|
| `foundry` | `node .../foundryVTT-MCP/mcp-server/dist/server.js` | canonical | Already registered |
| `context7` | `npx -y @upstash/context7-mcp` | opencode, registry | No env vars |
| `bitwig` | `node .../bitwig-MCP/mcp-server/dist/index.js` | opencode | Disabled in opencode |
| `fabric-lakehouse-files` | `npx -y @microsoft/fabric-mcp@latest server start --mode all --read-only` | opencode, registry | No env vars |
| `google-mcp` | `node .../google-mcp/dist/server.js` | opencode, registry | Has op:// env vars; disabled in registry |
| `memory` | `npx -y @modelcontextprotocol/server-memory` | opencode | Disabled |
| `playwright` | `npx -y @playwright/mcp@latest` | opencode, registry | No env vars |
| `postgres` | `npx -y mcp-postgres-server` | opencode | Disabled; needs connection env vars |
| `powerbi-semantic-model` | `~/.mcpservers/powerbi-mcp-fabric/run.sh` | opencode, registry | Shell script |
| `mgrep` | `mgrep mcp` | opencode, registry | Binary |
| `pencil` | `/Applications/Pencil.app/.../mcp-server-darwin-arm64 --app desktop` | opencode, registry | macOS app |
| `typeform` | `op run --no-masking -- uvx ...typeform-mcp` | openclaw | Has op:// env for TYPEFORM_TOKEN |
| `qmd` | `~/.local/bin/qmd mcp` | openclaw | Binary |
| `beeper` | `node .../proxy.js http://localhost:23373/v0/mcp ...` | registry | Complex args (MCP remote proxy) |

### Remote servers

| ID | URL | Source(s) | Notes |
|----|-----|-----------|-------|
| `atlassian` | `https://mcp.atlassian.com/v1/mcp` | opencode, registry | Has `${ATLASSIAN_API_TOKEN}` header |
| `openaiDeveloperDocs` | `https://developers.openai.com/mcp` | opencode | Disabled |
| `sentry` | `https://mcp.sentry.dev/mcp` | opencode | Has `oauth: {}` — needs oauth support |
| `tavily-remote-mcp` | `https://mcp.tavily.com/mcp/` | registry | No auth |
| `railway` | `https://mcp.railway.com` | openclaw, registry | No auth |
| `github` | `https://api.githubcopilot.com/mcp/` | registry | Has `${GITHUB_PERSONAL_ACCESS_TOKEN}` header |
| `stripe` | `https://mcp.stripe.com` | registry | No auth |

### Excluded from migration

| ID | Reason |
|----|--------|
| `mcp-switchboard` | The switchboard itself — it's the consumer, not a downstream server. Present in opencode.json and openclaw.json as the entry point, not as a routable server. |

---

## Implementation Steps

### Step 1: Add `migrate` command to mcp-registry CLI

Add a `mcp-registry migrate` command in `src/cli.ts` that:
1. Reads all three legacy sources (opencode.json, openclaw.json, mcp-registry.json)
2. Deduplicates by server ID (richest config wins)
3. Excludes `mcp-switchboard` (it's the consumer, not a server)
4. Normalizes to the canonical `ServerEntry` format
5. Merges into the existing `~/.config/mcp/servers.json` (preserving foundry)
6. Writes the result

Support flags:
- `--dry-run` — show what would be migrated without writing
- `--source opencode,openclaw,registry` — select which sources to import from

### Step 2: Add legacy config parsers to mcp-registry

Create `src/legacy/` with parsers for each source format:

**`src/legacy/opencode.ts`** — parse JSONC (`mcp` key, already `OpencodeMcpServerConfig` format)
- Needs `jsonc-parser` dependency (same one the switchboard uses)
- Converts `command: string[]` back to `command: string` + `args: string[]` for the canonical format
- Reads env from `environment` field → writes to `env` field

**`src/legacy/openclaw.ts`** — parse JSON (`servers` key)
- Format: `{ command, args, env, type: "stdio" }`
- Map `type: "stdio"` to `type: "local"` (or omit, since local is default)
- Handle remote entries (beeper, railway)

**`src/legacy/registryConfig.ts`** — parse JSON (`servers` key)
- Already matches the canonical format closely
- Copy entries directly, adding `metadata` where useful

### Step 3: Run the migration

```bash
# Preview
mcp-registry migrate --dry-run

# Execute
mcp-registry migrate

# Verify
mcp-registry validate
mcp-registry list
```

### Step 4: Handle special cases

**`op://` URIs:** Pass through as-is. The switchboard resolves them at transport time.

**`${ENV_VAR}` in headers:** Pass through as-is. The switchboard's header template resolution handles this.

**`oauth` field (sentry):** The canonical registry format doesn't have `oauth` yet. Options:
  - Add `oauth?: Record<string, unknown> | false` to `RemoteServerEntry` in mcp-registry types
  - Or omit sentry until oauth support is needed (it's currently disabled anyway)

**`beeper` has two different configs:**
  - openclaw.json: remote (`url: http://localhost:23373/v0/mcp`, streamable-http transport, auth header)
  - mcp-registry.json: local (node proxy.js wrapper for MCP remote)
  - Use the registry version (local proxy) since it works with stdio transport

**`google-mcp` is disabled in registry but has env vars in opencode:**
  - Merge: take the entry with env vars, mark `enabled: false`
  - User enables when ready

### Step 5: Verify end-to-end

After migration:
1. `mcp-registry list` shows all servers with correct types and targets
2. `mcp-registry validate` passes
3. Switchboard starts and loads all servers from `~/.config/mcp/servers.json`
4. `switchboard_registry_list` shows full roster
5. `switchboard_search("foundry")` finds foundry
6. `switchboard_call("context7", "resolve-library-id", ...)` works (verifies a migrated server)

### Step 6: Clean up legacy configs

After confirming everything works:
1. Remove the `mcp` key from `~/.config/opencode/opencode.json` (keep other opencode settings)
2. Remove `~/.config/mcp-registry.json` (fully superseded)
3. Update `~/.openclaw/openclaw.json` — remove `servers` entries that are now in the canonical registry; keep `mcp-switchboard` entry since OpenClaw needs it as its MCP transport
4. Remove `SWITCHBOARD_INCLUDE` from all configs (no longer needed)

---

## Key Files

| File | Role |
|------|------|
| `~/Documents/Codex/mcp-registry/src/cli.ts` | Add `migrate` command |
| `~/Documents/Codex/mcp-registry/src/legacy/opencode.ts` | New — JSONC parser for opencode.json |
| `~/Documents/Codex/mcp-registry/src/legacy/openclaw.ts` | New — parser for openclaw.json |
| `~/Documents/Codex/mcp-registry/src/legacy/registryConfig.ts` | New — parser for mcp-registry.json |
| `~/.config/opencode/opencode.json` | Source — 15 servers |
| `~/.openclaw/openclaw.json` | Source — 5 servers |
| `~/.config/mcp-registry.json` | Source — 14 servers |
| `~/.config/mcp/servers.json` | Target — canonical registry |

## Dependencies to Add

- `jsonc-parser` — for reading opencode.json (JSONC format with comments)

---

## Verification

1. `mcp-registry migrate --dry-run` — shows all servers that would be migrated
2. `mcp-registry migrate` — writes to `~/.config/mcp/servers.json`
3. `mcp-registry validate` — schema validation passes
4. `mcp-registry list` — shows ~20 unique servers
5. Switchboard starts cleanly from canonical registry
6. At least 3 servers tested end-to-end via `switchboard_call`
7. Legacy configs cleaned up without breaking OpenClaw or OpenCode
