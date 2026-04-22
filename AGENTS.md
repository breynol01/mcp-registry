# mcp-registry

Canonical MCP server registry — tool-agnostic discovery and management of Model Context Protocol servers.

## What This Is

A shared library and CLI that owns the canonical server registry at `~/.config/mcp/servers.json`. Any MCP-aware tool (switchboard, Claude Code, OpenCode) imports this library to discover registered servers.

## Project Structure

- `src/types.ts` — On-disk and normalized type definitions
- `src/schema.ts` — Zod validation schema for servers.json
- `src/registry.ts` — Load, save, normalize, mutate registry
- `src/cli.ts` — CLI entry point (`mcp-registry add|remove|list|validate|path`)
- `src/index.ts` — Public API exports

## Build and Run

- `npm install` — install dependencies
- `npm run build` — compile TypeScript to `dist/`
- `node dist/cli.js <command>` — run CLI
- `npm link` — makes `mcp-registry` available globally

## Registry Format

File: `~/.config/mcp/servers.json`

```json
{
  "version": 1,
  "servers": {
    "server-id": {
      "command": "node",
      "args": ["dist/server.js"],
      "env": { "KEY": "value" },
      "metadata": {
        "description": "What this server does",
        "repository": "https://github.com/..."
      }
    }
  }
}
```

## Coding Conventions

- TypeScript strict mode, ESM (`"type": "module"`)
- 2-space indentation, camelCase functions, PascalCase types
- Zod for validation, no runtime dependencies beyond zod
- Library exports from `src/index.ts`; CLI is `src/cli.ts`

## Environment Variables

- `MCP_REGISTRY_PATH` — override registry file path (default: `~/.config/mcp/servers.json`)
