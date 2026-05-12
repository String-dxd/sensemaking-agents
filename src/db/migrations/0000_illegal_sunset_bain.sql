CREATE TABLE "agent_sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"counselor_id" text,
	"agent_id" text NOT NULL,
	"agent_version" text NOT NULL,
	"env_version" text,
	"anthropic_session_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "agent_sessions_status_check" CHECK (status IN ('running','idle','archived','failed'))
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_traces" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"agent" text NOT NULL,
	"ref_table" text NOT NULL,
	"ref_id" bigint NOT NULL,
	"trace_json" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_traces_agent_check" CHECK (agent IN ('mirror','connector','pathfinder','cartographer'))
);
--> statement-breakpoint
ALTER TABLE "agent_traces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cartographer_outputs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"trajectory_text" text NOT NULL,
	"pathways_json" text NOT NULL,
	"open_questions_json" text NOT NULL,
	"disclaimer" text NOT NULL,
	"raw_output_json" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cartographer_outputs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "connector_outputs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"patterns_json" text NOT NULL,
	"still_unclear" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connector_outputs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "counselor_students" (
	"counselor_id" text NOT NULL,
	"student_id" text NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "counselor_students_counselor_id_student_id_pk" PRIMARY KEY("counselor_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "memory_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"file_path" text NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mirror_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"transcript" text NOT NULL,
	"validation" text NOT NULL,
	"inferred_meaning" text NOT NULL,
	"story_reframe" text NOT NULL,
	"raw_output_json" text NOT NULL,
	"context_type" text DEFAULT 'school' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"story_reframe_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', story_reframe)) STORED,
	CONSTRAINT "mirror_entries_context_type_check" CHECK (context_type IN ('school','family','peer','hobby','civic'))
);
--> statement-breakpoint
ALTER TABLE "mirror_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mirror_entry_tags" (
	"entry_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	CONSTRAINT "mirror_entry_tags_entry_id_tag_id_pk" PRIMARY KEY("entry_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "pathfinder_outputs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"trajectory" text NOT NULL,
	"pathways_json" text NOT NULL,
	"disclaimer" text NOT NULL,
	"connector_output_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pathfinder_outputs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_memory_files" (
	"student_id" text NOT NULL,
	"file_path" text NOT NULL,
	"op_count" integer DEFAULT 0 NOT NULL,
	"memory_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_memory_files_student_id_file_path_pk" PRIMARY KEY("student_id","file_path")
);
--> statement-breakpoint
ALTER TABLE "student_memory_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_memory_stores" (
	"student_id" text PRIMARY KEY NOT NULL,
	"memory_store_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vips_forget_count" (
	"student_id" text NOT NULL,
	"dimension" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "vips_forget_count_student_id_dimension_pk" PRIMARY KEY("student_id","dimension"),
	CONSTRAINT "vips_forget_count_dimension_check" CHECK (dimension IN ('values','interests','personality','skills'))
);
--> statement-breakpoint
ALTER TABLE "vips_forget_count" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vips_pages" (
	"student_id" text NOT NULL,
	"dimension" text NOT NULL,
	"compiled_truth" text NOT NULL,
	"open_question" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vips_pages_student_id_dimension_pk" PRIMARY KEY("student_id","dimension"),
	CONSTRAINT "vips_pages_dimension_check" CHECK (dimension IN ('values','interests','personality','skills'))
);
--> statement-breakpoint
ALTER TABLE "vips_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vips_proposed_diffs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"mirror_entry_id" bigint NOT NULL,
	"payload_json" text NOT NULL,
	"verifier_result_json" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "vips_proposed_diffs_status_check" CHECK (status IN ('pending','confirmed','forgotten'))
);
--> statement-breakpoint
ALTER TABLE "vips_proposed_diffs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vips_timeline_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"dimension" text NOT NULL,
	"canonical_claim_id" text NOT NULL,
	"verbatim_quote" text NOT NULL,
	"reflection_id" bigint,
	"strength" text NOT NULL,
	"parallax_tag_json" text NOT NULL,
	"reinforces_id" bigint,
	"forgotten_at" timestamp with time zone,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verbatim_quote_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', verbatim_quote)) STORED,
	CONSTRAINT "vips_timeline_dimension_check" CHECK (dimension IN ('values','interests','personality','skills')),
	CONSTRAINT "vips_timeline_strength_check" CHECK (strength IN ('low','medium','high'))
);
--> statement-breakpoint
ALTER TABLE "vips_timeline_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mirror_entry_tags" ADD CONSTRAINT "mirror_entry_tags_entry_id_mirror_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."mirror_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirror_entry_tags" ADD CONSTRAINT "mirror_entry_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pathfinder_outputs" ADD CONSTRAINT "pathfinder_outputs_connector_output_id_connector_outputs_id_fk" FOREIGN KEY ("connector_output_id") REFERENCES "public"."connector_outputs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vips_proposed_diffs" ADD CONSTRAINT "vips_proposed_diffs_mirror_entry_id_mirror_entries_id_fk" FOREIGN KEY ("mirror_entry_id") REFERENCES "public"."mirror_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vips_timeline_entries" ADD CONSTRAINT "vips_timeline_entries_reflection_id_mirror_entries_id_fk" FOREIGN KEY ("reflection_id") REFERENCES "public"."mirror_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vips_timeline_entries" ADD CONSTRAINT "vips_timeline_entries_reinforces_id_fkey" FOREIGN KEY ("reinforces_id") REFERENCES "public"."vips_timeline_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_sessions_status_started" ON "agent_sessions" USING btree ("status","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "agent_sessions_anthropic_session_id_uq" ON "agent_sessions" USING btree ("anthropic_session_id");--> statement-breakpoint
CREATE INDEX "idx_agent_traces_ref" ON "agent_traces" USING btree ("ref_table","ref_id");--> statement-breakpoint
CREATE INDEX "idx_cartographer_outputs_student" ON "cartographer_outputs" USING btree ("student_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_connector_outputs_student" ON "connector_outputs" USING btree ("student_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_memory_snapshots_student_file_version" ON "memory_snapshots" USING btree ("student_id","file_path","version");--> statement-breakpoint
CREATE INDEX "idx_mirror_entries_student" ON "mirror_entries" USING btree ("student_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_mirror_entries_story_reframe_tsv" ON "mirror_entries" USING gin ("story_reframe_tsv");--> statement-breakpoint
CREATE INDEX "idx_pathfinder_outputs_student" ON "pathfinder_outputs" USING btree ("student_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "tags_student_label_uq" ON "tags" USING btree ("student_id","label");--> statement-breakpoint
CREATE INDEX "idx_vips_pages_student" ON "vips_pages" USING btree ("student_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_vips_proposed_diffs_student_status" ON "vips_proposed_diffs" USING btree ("student_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "vips_proposed_diffs_pending_per_student" ON "vips_proposed_diffs" USING btree ("student_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "idx_vips_timeline_student_dim" ON "vips_timeline_entries" USING btree ("student_id","dimension","committed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_vips_timeline_verbatim_quote_tsv" ON "vips_timeline_entries" USING gin ("verbatim_quote_tsv");--> statement-breakpoint
CREATE POLICY "agent_sessions_rls" ON "agent_sessions" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));--> statement-breakpoint
CREATE POLICY "agent_traces_rls" ON "agent_traces" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));--> statement-breakpoint
CREATE POLICY "cartographer_outputs_rls" ON "cartographer_outputs" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));--> statement-breakpoint
CREATE POLICY "connector_outputs_rls" ON "connector_outputs" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));--> statement-breakpoint
CREATE POLICY "memory_snapshots_rls" ON "memory_snapshots" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));--> statement-breakpoint
CREATE POLICY "mirror_entries_rls" ON "mirror_entries" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));--> statement-breakpoint
CREATE POLICY "pathfinder_outputs_rls" ON "pathfinder_outputs" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));--> statement-breakpoint
CREATE POLICY "student_memory_files_rls" ON "student_memory_files" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));--> statement-breakpoint
CREATE POLICY "tags_rls" ON "tags" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));--> statement-breakpoint
CREATE POLICY "vips_forget_count_rls" ON "vips_forget_count" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));--> statement-breakpoint
CREATE POLICY "vips_pages_rls" ON "vips_pages" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));--> statement-breakpoint
CREATE POLICY "vips_proposed_diffs_rls" ON "vips_proposed_diffs" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));--> statement-breakpoint
CREATE POLICY "vips_timeline_entries_rls" ON "vips_timeline_entries" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));