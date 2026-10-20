import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  DEPLOY_MODE: z.enum(["self-hosted", "cloud"]).default("self-hosted"),
});

export const env = envSchema.parse(process.env);
