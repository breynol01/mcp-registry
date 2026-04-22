# mcp-registry

Canonical MCP server registry — a shared library and CLI for managing [Model Context Protocol](https://modelcontextprotocol.io/) server configurations.

## What it does

Owns the single source of truth at `~/.config/mcp/servers.json`. Any MCP-aware tool (switchboard, Claude Code, OpenCode) imports this library to discover and manage registered servers.

## Install

```bash
# From source
git clone https://github.com/breynol01/mcp-registry.git
cd mcp-registry
npm install
npm link
```

Or as a dependency:

```bash
npm install breynol01/mcp-registry
```

## CLI

```bash
mcp-registry list [--json]              # List all servers (including disabled)
mcp-registry add <id> --command <cmd>   # Add a local server
mcp-registry add-remote <id> --url <u>  # Add a remote server
mcp-registry remove <id>               # Remove a server
mcp-registry validate                   # Check registry file validity
mcp-registry migrate [--dry-run]        # Consolidate legacy configs
mcp-registry path                       # Print registry file path
```

### Add options

```bash
# Local server
mcp-registry add my-server \
  --command node \
  --args dist/server.js,--port,3000 \
  --env API_KEY=secret,DEBUG=true \
  --description "My MCP server" \
  --repository https://github.com/user/repo

# Remote server
mcp-registry add-remote my-remote \
  --url https://example.com/mcp \
  --headers "Authorization=Bearer token" \
  --description "Remote MCP endpoint"
```

## Library API

```typescript
import {
  loadRegistry,
  saveRegistry,
  addServer,
  removeServer,
  hasServer,
  getRegisteredServers,
  normalizeEntry,
} from "mcp-registry";

// Load the registry
const registry = await loadRegistry();

// Get enabled servers in normalized format
const servers = getRegisteredServers(registry);

// Add a server
const updated = addServer(registry, "my-server", {
  command: "node",
  args: ["dist/server.js"],
  metadata: { description: "My server" },
});
await saveRegistry(updated);
```

### Exports

| Export | Description |
|--------|-------------|
| `loadRegistry(path?)` | Read and validate `servers.json` |
| `saveRegistry(registry, path?)` | Write registry to disk |
| `addServer(registry, id, entry)` | Return new registry with server added |
| `removeServer(registry, id)` | Return new registry with server removed |
| `hasServer(registry, id)` | Check if server exists |
| `getRegisteredServers(registry)` | Get enabled servers in normalized format |
| `normalizeEntry(entry)` | Convert on-disk entry to normalized config |
| `registryFileSchema` | Zod schema for the registry file |
| `serverEntrySchema` | Zod schema for individual server entries |
| `migrate(options)` | Consolidate legacy configs into registry |

## Registry format

```json
{
  "version": 1,
  "servers": {
    "my-server": {
      "command": "node",
      "args": ["dist/server.js"],
      "env": { "API_KEY": "op://vault/item/key" },
      "metadata": {
        "description": "What this server does",
        "repository": "https://github.com/..."
      }
    },
    "my-remote": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "${AUTH_TOKEN}" }
    }
  }
}
```

Secrets use `op://` URIs or `${ENV_VAR}` templates — resolved downstream by the consumer, not the registry.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_REGISTRY_PATH` | `~/.config/mcp/servers.json` | Override registry file path |

## Development

```bash
npm run build    # Compile TypeScript
npm run check    # Type check without emit
npm test         # Run tests
```

## License

MIT
