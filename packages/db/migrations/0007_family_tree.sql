CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partner1_id" uuid,
	"partner2_id" uuid,
	"status" text DEFAULT 'unknown' NOT NULL,
	"start_year" smallint,
	"end_year" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "families" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "family_children" (
	"tenant_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"kind" text DEFAULT 'biological' NOT NULL,
	CONSTRAINT "family_children_family_id_child_id_pk" PRIMARY KEY("family_id","child_id")
);
--> statement-breakpoint
ALTER TABLE "family_children" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "is_self" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "is_deceased" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "death_year" smallint;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_partner1_id_contacts_id_fk" FOREIGN KEY ("partner1_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_partner2_id_contacts_id_fk" FOREIGN KEY ("partner2_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_children" ADD CONSTRAINT "family_children_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_children" ADD CONSTRAINT "family_children_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_children" ADD CONSTRAINT "family_children_child_id_contacts_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "families_partner1_idx" ON "families" USING btree ("partner1_id");--> statement-breakpoint
CREATE INDEX "families_partner2_idx" ON "families" USING btree ("partner2_id");--> statement-breakpoint
CREATE INDEX "family_children_child_idx" ON "family_children" USING btree ("child_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_self_idx" ON "contacts" USING btree ("tenant_id") WHERE "contacts"."is_self";--> statement-breakpoint
CREATE POLICY "families_tenant_isolation" ON "families" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "family_children_tenant_isolation" ON "family_children" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);