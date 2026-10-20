CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"label" text DEFAULT 'home' NOT NULL,
	"street" text,
	"line2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contact_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text DEFAULT 'other' NOT NULL,
	"value" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_methods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "company" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_methods" ADD CONSTRAINT "contact_methods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_methods" ADD CONSTRAINT "contact_methods_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_contact_idx" ON "addresses" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "addresses_city_idx" ON "addresses" USING btree ("tenant_id","city");--> statement-breakpoint
CREATE INDEX "contact_methods_contact_idx" ON "contact_methods" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_methods_value_idx" ON "contact_methods" USING btree ("tenant_id","kind","value");--> statement-breakpoint
CREATE POLICY "addresses_tenant_isolation" ON "addresses" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "contact_methods_tenant_isolation" ON "contact_methods" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);