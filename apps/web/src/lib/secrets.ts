import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "./env";

// Integration secrets (Immich API keys) are encrypted with a key derived from the app secret.
// Rotating BETTER_AUTH_SECRET means reconnecting integrations.
const key = Buffer.from(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "life-crm", "integration-secrets:v1", 32));

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
