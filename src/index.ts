export type {
  LocalServerEntry,
  RemoteServerEntry,
  ServerEntry,
  ServerMetadata,
  RegistryFile,
  NormalizedServerConfig,
  RegisteredServer,
} from "./types.js";

export {
  DEFAULT_REGISTRY_PATH,
  loadRegistry,
  saveRegistry,
  normalizeEntry,
  getRegisteredServers,
  addServer,
  removeServer,
  hasServer,
} from "./registry.js";

export { registryFileSchema, serverEntrySchema } from "./schema.js";

export { migrate } from "./legacy/index.js";
export type { SourceName, MigrationResult } from "./legacy/index.js";
