CREATE TABLE "date_nights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partnership_id" uuid NOT NULL,
	"interaction_id" uuid,
	"occurred_on" date NOT NULL,
	"place" text,
	"cost_cents" integer,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"rating" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "date_nights" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "partnership_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partnership_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"year" smallint,
	"month" smallint NOT NULL,
	"day" smallint NOT NULL,
	"important_date_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partnership_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "partnerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"label" text DEFAULT 'Partner' NOT NULL,
	"status" text DEFAULT 'current' NOT NULL,
	"is_nesting" boolean DEFAULT false NOT NULL,
	"love_languages" text[] DEFAULT '{}' NOT NULL,
	"date_cadence_days" integer,
	"agreements" text,
	"ended_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partnerships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "relationship_status" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "relationship_style" text DEFAULT 'monogamous' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "relationship" text;--> statement-breakpoint
ALTER TABLE "date_nights" ADD CONSTRAINT "date_nights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_nights" ADD CONSTRAINT "date_nights_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "public"."partnerships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_nights" ADD CONSTRAINT "date_nights_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnership_milestones" ADD CONSTRAINT "partnership_milestones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnership_milestones" ADD CONSTRAINT "partnership_milestones_partnership_id_partnerships_id_fk" FOREIGN KEY ("partnership_id") REFERENCES "public"."partnerships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnership_milestones" ADD CONSTRAINT "partnership_milestones_important_date_id_important_dates_id_fk" FOREIGN KEY ("important_date_id") REFERENCES "public"."important_dates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "date_nights_partnership_occurred_idx" ON "date_nights" USING btree ("partnership_id","occurred_on");--> statement-breakpoint
CREATE INDEX "partnership_milestones_partnership_idx" ON "partnership_milestones" USING btree ("partnership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partnerships_contact_idx" ON "partnerships" USING btree ("contact_id");--> statement-breakpoint
CREATE POLICY "date_nights_tenant_isolation" ON "date_nights" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "partnership_milestones_tenant_isolation" ON "partnership_milestones" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "partnerships_tenant_isolation" ON "partnerships" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);