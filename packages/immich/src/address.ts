import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Loopback, private, link-local, CGNAT and other non-public ranges, IPv4 and IPv6. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/**
 * On the hosted service, refuse Immich URLs that point into our own network. Self-hosted
 * installs skip this, since Immich usually lives on the same LAN.
 */
export async function assertPublicHost(url: string): Promise<void> {
  const { hostname } = new URL(url);
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new Error("Couldn't find that address");
  if (addresses.some(isPrivateAddress)) throw new Error("That address is on a private network. Use a public URL, e.g. through Cloudflare Tunnel or Tailscale Funnel.");
}
