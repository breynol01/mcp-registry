import { z } from "zod";

const serverMetadataSchema = z.object({
  description: z.string().optional(),
  repository: z.string().optional(),
});

const localServerSchema = z.object({
  type: z.literal("local").optional(),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
  timeout: z.number().positive().optional(),
  metadata: serverMetadataSchema.optional(),
});

const remoteServerSchema = z.object({
  type: z.literal("remote"),
  url: z.url(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
  timeout: z.number().positive().optional(),
  metadata: serverMetadataSchema.optional(),
});

export const serverEntrySchema = z.union([remoteServerSchema, localServerSchema]);

export const registryFileSchema = z.object({
  version: z.number().int().positive(),
  servers: z.record(z.string(), serverEntrySchema),
});

export type ValidatedRegistryFile = z.infer<typeof registryFileSchema>;
