CREATE TABLE "contact_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"start_year" smallint,
	"start_month" smallint,
	"end_year" smallint,
	"end_month" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_periods" ADD CONSTRAINT "contact_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_periods" ADD CONSTRAINT "contact_periods_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_periods_contact_idx" ON "contact_periods" USING btree ("contact_id");--> statement-breakpoint
-- Carry over when you met, lost touch and caught back up as periods.
INSERT INTO "contact_periods" ("tenant_id", "contact_id", "start_year", "start_month", "end_year")
SELECT "tenant_id", "id", "met_year", CASE WHEN "met_year" IS NULL THEN NULL ELSE "met_month" END, "lost_touch_year"
FROM "contacts"
WHERE "met_year" IS NOT NULL OR "lost_touch_year" IS NOT NULL;--> statement-breakpoint
INSERT INTO "contact_periods" ("tenant_id", "contact_id", "start_year")
SELECT "tenant_id", "id", "reconnected_year"
FROM "contacts"
WHERE "lost_touch_year" IS NOT NULL AND "reconnected_year" IS NOT NULL AND "reconnected_year" >= "lost_touch_year";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN "met_year";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN "met_month";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN "lost_touch_year";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN "reconnected_year";--> statement-breakpoint
CREATE POLICY "contact_periods_tenant_isolation" ON "contact_periods" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);