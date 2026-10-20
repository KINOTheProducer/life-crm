/** Same-origin URL for an Immich thumbnail, proxied so the API key stays on the server. */
export function thumbUrl(assetId: string, size: "thumbnail" | "preview" = "thumbnail") {
  return `/api/immich/assets/${encodeURIComponent(assetId)}/${size}`;
}

export function personThumbUrl(personId: string) {
  return `/api/immich/people/${encodeURIComponent(personId)}/thumbnail`;
}

const immichPerson = "immich-person:";

export function immichAvatarRef(personId: string) {
  return `${immichPerson}${personId}`;
}

/** Image URL for a contact's avatar_ref, or null to show initials. */
export function avatarSrc(ref: string | null | undefined): string | null {
  if (ref?.startsWith(immichPerson)) return personThumbUrl(ref.slice(immichPerson.length));
  return null;
}
