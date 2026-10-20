CREATE TABLE "immich_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key_enc" text NOT NULL,
	"account_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "immich_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"reason" text,
	"started_on" date NOT NULL,
	"ended_on" date,
	"location" text,
	"story" text,
	"cover_asset_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory_assets" (
	"tenant_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"asset_id" text NOT NULL,
	"type" text DEFAULT 'IMAGE' NOT NULL,
	"taken_at" timestamp,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_assets_memory_id_asset_id_pk" PRIMARY KEY("memory_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "memory_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memory_people" (
	"tenant_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	CONSTRAINT "memory_people_memory_id_contact_id_pk" PRIMARY KEY("memory_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "memory_people" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "immich_connections" ADD CONSTRAINT "immich_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "immich_connections" ADD CONSTRAINT "immich_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_assets" ADD CONSTRAINT "memory_assets_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_people" ADD CONSTRAINT "memory_people_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_people" ADD CONSTRAINT "memory_people_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_people" ADD CONSTRAINT "memory_people_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "immich_connections_user_idx" ON "immich_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memories_tenant_started_idx" ON "memories" USING btree ("tenant_id","started_on");--> statement-breakpoint
CREATE INDEX "memory_people_contact_idx" ON "memory_people" USING btree ("contact_id");--> statement-breakpoint
CREATE POLICY "immich_connections_tenant_isolation" ON "immich_connections" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "memories_tenant_isolation" ON "memories" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "memory_assets_tenant_isolation" ON "memory_assets" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "memory_people_tenant_isolation" ON "memory_people" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);