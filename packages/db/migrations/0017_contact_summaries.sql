CREATE TABLE "contact_summaries" (
	"contact_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"ask_about" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_key" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_summaries" ADD CONSTRAINT "contact_summaries_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_summaries" ADD CONSTRAINT "contact_summaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "contact_summaries_tenant_isolation" ON "contact_summaries" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);