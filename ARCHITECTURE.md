# Architecture: mcp-registry

## System Design

```
┌─────────────────────────────────────────────┐
│              CLI (src/cli.ts)                │
│  add | add-remote | remove | list           │
│  validate | migrate | path                  │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼───────┐   ┌────────▼────────┐
│  Registry API │   │  Legacy Parsers │
│ (registry.ts) │   │ (src/legacy/)   │
│               │   │                 │
│ load / save   │   │ opencode.ts     │
│ add / remove  │   │ openclaw.ts     │
│ normalize     │   │ registryConfig  │
│ validate      │   │ index.ts (orch) │
└───────┬───────┘   └────────┬────────┘
        │                    │
        └────────┬───────────┘
                 │
        ┌────────▼────────┐
        │  Schema / Types │
        │ (schema.ts,     │
        │  types.ts)      │
        └────────┬────────┘
                 │
        ┌────────▼────────┐
        │  servers.json   │
        │ ~/.config/mcp/  │
        └─────────────────┘
```

## Layers

1. **Types** (`types.ts`) — On-disk format (`ServerEntry`, `RegistryFile`) and normalized format (`NormalizedServerConfig`, `RegisteredServer`). On-disk is what users/tools write; normalized is what MCP clients consume.

2. **Schema** (`schema.ts`) — Zod validation. Discriminated union: remote requires `type: "remote"` + valid URL; local requires non-empty `command` string, type is optional.

3. **Registry** (`registry.ts`) — File I/O and pure mutation functions. `loadRegistry()` reads + validates; `saveRegistry()` writes. Mutations (`addServer`, `removeServer`) return new objects.

4. **Legacy Parsers** (`src/legacy/`) — One parser per legacy source format. Each returns `Record<string, ServerEntry>` plus warnings. The orchestrator (`legacy/index.ts`) merges with dedup scoring and hard-coded overrides for special cases (beeper, google-mcp).

5. **CLI** (`cli.ts`) — Thin command dispatcher. Parses args, calls registry/legacy functions, formats output. The `migrate` command uses dynamic `import()` to avoid loading jsonc-parser for non-migrate commands.

## Key Patterns

- **Pure mutations**: `addServer()` / `removeServer()` return new registry objects — no in-place mutation
- **ENOENT-graceful reads**: Missing files return empty defaults, not errors
- **Validation at boundaries**: All data entering the system (file reads, legacy parser output, CLI input) is validated through Zod schemas before acceptance. Legacy parsers validate each entry individually via `serverEntrySchema` and emit warnings for rejected entries rather than silently passing through malformed data
- **Richness-based dedup**: When a server appears in multiple sources, the version with the most populated fields wins. Ties broken by source priority (registry > openclaw > opencode)
- **Pass-through secrets**: `op://` URIs and `${ENV_VAR}` templates are stored as literal strings — resolution happens downstream in the switchboard
- **Fail-safe migration**: `migrate()` validates the merged registry with Zod before writing; if validation fails, no file is written and warnings are returned

## CLI

Commands: `list [--json]`, `add`, `add-remote`, `remove`, `validate`, `migrate [--dry-run] [--source]`, `path`

The CLI uses a custom arg parser (no dependencies). Boolean flags are declared in `BOOLEAN_FLAGS`. Non-boolean flags require a value — the parser rejects flags at end-of-argv or followed by another `--flag` with a specific error message. Unknown commands exit 1 with an error.

`list` operates directly on `registry.servers` (not `getRegisteredServers()`) so disabled servers are visible. `getRegisteredServers()` is the library API for consumers that want only enabled, normalized servers.

## Dependencies

| Package | Purpose |
|---------|---------|
| `zod` | Schema validation for registry file and individual entries |
| `jsonc-parser` | Parse opencode.json (JSONC with comments) |

## Testing

Tests use Node's built-in test runner (`node --test`). Test files live alongside source in `src/` as `*.test.ts`. No additional test dependencies.

Coverage targets: schema validation, registry CRUD, CLI arg parsing, legacy parser transformation and validation, migration merge logic.
