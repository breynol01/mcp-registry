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
- **Richness-based dedup**: When a server appears in multiple sources, the version with the most populated fields wins. Ties broken by source priority (registry > openclaw > opencode)
- **Pass-through secrets**: `op://` URIs and `${ENV_VAR}` templates are stored as literal strings — resolution happens downstream in the switchboard

## Dependencies

| Package | Purpose |
|---------|---------|
| `zod` | Schema validation for registry file |
| `jsonc-parser` | Parse opencode.json (JSONC with comments) |
