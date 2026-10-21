-- Your own face picked in Settings used to live only on the Immich connection, so the "You"
-- entry had no avatar or photos. Link it to the self contact like any other face.
INSERT INTO "contact_faces" ("tenant_id", "contact_id", "person_id")
SELECT c."tenant_id", c."id", ic."self_person_id"
FROM "immich_connections" ic
JOIN "contacts" c ON c."tenant_id" = ic."tenant_id" AND c."is_self"
WHERE ic."self_person_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "contacts" c
SET "avatar_ref" = 'immich-person:' || ic."self_person_id"
FROM "immich_connections" ic
WHERE c."tenant_id" = ic."tenant_id" AND c."is_self" AND c."avatar_ref" IS NULL AND ic."self_person_id" IS NOT NULL;
