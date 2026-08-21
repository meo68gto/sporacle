import "server-only";
import { z } from "zod";

const schema = z.object({
  AUTH_SECRET: z.string().min(8).default("dev-auth-secret-change-me"),
  AUTH_ALLOWLIST: z
    .string()
    .default("admin@sporacle.test:admin,analyst@sporacle.test:analyst,viewer@sporacle.test:viewer"),
  SPORACLE_DATA_DIR: z.string().default(".data"),
  INTAKE_DIR: z.string().optional(),
  VELUMA_BASE_URL: z.string().optional(),
  VELUMA_API_KEY: z.string().optional(),
  VELUMA_WEBHOOK_SECRET: z.string().optional(),
  VELUMA_POLL_INTERVAL: z.string().optional(),
  // I13/I2 — expected property id for the Veluma events feed, pinned server-side.
  // Records whose envelope disagrees are acked skipped (property_mismatch), never stored.
  VELUMA_PROPERTY_ID: z.string().min(1).default("FSP"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  cached = schema.parse({
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_ALLOWLIST: process.env.AUTH_ALLOWLIST,
    SPORACLE_DATA_DIR: process.env.SPORACLE_DATA_DIR,
    INTAKE_DIR: process.env.INTAKE_DIR,
    VELUMA_BASE_URL: process.env.VELUMA_BASE_URL,
    VELUMA_API_KEY: process.env.VELUMA_API_KEY,
    VELUMA_WEBHOOK_SECRET: process.env.VELUMA_WEBHOOK_SECRET,
    VELUMA_POLL_INTERVAL: process.env.VELUMA_POLL_INTERVAL,
    VELUMA_PROPERTY_ID: process.env.VELUMA_PROPERTY_ID,
  });
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}

export const CLIENT_FORBIDDEN_ENV = [
  "VELUMA_BASE_URL",
  "VELUMA_API_KEY",
  "VELUMA_WEBHOOK_SECRET",
  "VELUMA_POLL_INTERVAL",
  "AUTH_SECRET",
] as const;
