/** Same-origin URL for an Immich thumbnail, proxied so the API key stays on the server. */
export function thumbUrl(assetId: string, size: "thumbnail" | "preview" = "thumbnail") {
  return `/api/immich/assets/${encodeURIComponent(assetId)}/${size}`;
}
