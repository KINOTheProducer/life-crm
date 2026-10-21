CREATE TABLE "eras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"start_year" smallint NOT NULL,
	"end_year" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eras" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "met_year" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "met_month" smallint;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "lost_touch_year" smallint;--> statement-breakpoint
ALTER TABLE "eras" ADD CONSTRAINT "eras_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eras_tenant_idx" ON "eras" USING btree ("tenant_id","start_year");--> statement-breakpoint
CREATE POLICY "eras_tenant_isolation" ON "eras" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);