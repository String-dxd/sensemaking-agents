CREATE TABLE "vips_island_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload_json" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vips_island_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "idx_vips_island_snapshots_student" ON "vips_island_snapshots" USING btree ("student_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "vips_island_snapshots_rls" ON "vips_island_snapshots" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));