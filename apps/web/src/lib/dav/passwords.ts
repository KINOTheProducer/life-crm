import { createHash, randomBytes } from "node:crypto";

const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";

/** A random app password, easy to type on a phone: five groups of four, about 99 bits. */
export function newDavPassword() {
  const bytes = randomBytes(20);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  const password = [0, 4, 8, 12, 16].map((i) => chars.slice(i, i + 4).join("")).join("-");
  return { password, hash: hashDavPassword(password) };
}

export function hashDavPassword(password: string) {
  return createHash("sha256").update(password.trim().toLowerCase()).digest("hex");
}
