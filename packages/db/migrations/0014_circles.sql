CREATE TABLE "circle_members" (
	"tenant_id" uuid NOT NULL,
	"circle_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	CONSTRAINT "circle_members_circle_id_contact_id_pk" PRIMARY KEY("circle_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "circle_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "circles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tone" text DEFAULT 'sage' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "circles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circle_members_contact_idx" ON "circle_members" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "circles_tenant_name_idx" ON "circles" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE POLICY "circle_members_tenant_isolation" ON "circle_members" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "circles_tenant_isolation" ON "circles" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);