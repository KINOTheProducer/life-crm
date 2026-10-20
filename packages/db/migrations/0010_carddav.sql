CREATE TABLE "contact_tombstones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"dav_name" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_tombstones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dav_passwords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dav_passwords_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "dav_name" text;--> statement-breakpoint
ALTER TABLE "contact_tombstones" ADD CONSTRAINT "contact_tombstones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dav_passwords" ADD CONSTRAINT "dav_passwords_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_tombstones_tenant_idx" ON "contact_tombstones" USING btree ("tenant_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_dav_name_idx" ON "contacts" USING btree ("tenant_id","dav_name");--> statement-breakpoint
CREATE POLICY "contact_tombstones_tenant_isolation" ON "contact_tombstones" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);