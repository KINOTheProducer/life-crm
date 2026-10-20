CREATE TABLE "contact_faces" (
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"person_id" text NOT NULL,
	"immich_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_faces_contact_id_person_id_pk" PRIMARY KEY("contact_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "contact_faces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "avatar_ref" text;--> statement-breakpoint
ALTER TABLE "immich_connections" ADD COLUMN "self_person_id" text;--> statement-breakpoint
ALTER TABLE "contact_faces" ADD CONSTRAINT "contact_faces_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_faces" ADD CONSTRAINT "contact_faces_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_faces_person_idx" ON "contact_faces" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE POLICY "contact_faces_tenant_isolation" ON "contact_faces" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);