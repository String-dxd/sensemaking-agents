CREATE TABLE "my_world_faq_editor_sessions" (
	"token_digest" text PRIMARY KEY NOT NULL,
	"audit_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"credential_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"mutation_window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mutation_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "my_world_faq_editor_sessions_audit_id_uq" UNIQUE("audit_id"),
	CONSTRAINT "my_world_faq_editor_sessions_token_digest_check" CHECK ("my_world_faq_editor_sessions"."token_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "my_world_faq_editor_sessions_credential_fingerprint_check" CHECK ("my_world_faq_editor_sessions"."credential_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "my_world_faq_editor_sessions_display_name_check" CHECK (length(btrim("my_world_faq_editor_sessions"."display_name")) between 1 and 80),
	CONSTRAINT "my_world_faq_editor_sessions_time_order_check" CHECK ("my_world_faq_editor_sessions"."absolute_expires_at" > "my_world_faq_editor_sessions"."created_at"
          and "my_world_faq_editor_sessions"."last_seen_at" >= "my_world_faq_editor_sessions"."created_at"
          and "my_world_faq_editor_sessions"."mutation_window_started_at" >= "my_world_faq_editor_sessions"."created_at"),
	CONSTRAINT "my_world_faq_editor_sessions_mutation_count_check" CHECK ("my_world_faq_editor_sessions"."mutation_count" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "my_world_faq_heads" (
	"page_key" text PRIMARY KEY NOT NULL,
	"current_revision_id" uuid NOT NULL,
	"current_version" integer NOT NULL,
	"current_digest" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "my_world_faq_heads_page_key_check" CHECK ("my_world_faq_heads"."page_key" = 'my-world-faq'),
	CONSTRAINT "my_world_faq_heads_version_check" CHECK ("my_world_faq_heads"."current_version" > 0),
	CONSTRAINT "my_world_faq_heads_digest_check" CHECK ("my_world_faq_heads"."current_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "my_world_faq_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_key" text NOT NULL,
	"version" integer NOT NULL,
	"document" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"structure_version" integer NOT NULL,
	"canonical_digest" text NOT NULL,
	"attribution_kind" text NOT NULL,
	"saved_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"restored_from_revision_id" uuid,
	"attempt_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	CONSTRAINT "my_world_faq_revisions_page_version_uq" UNIQUE("page_key","version"),
	CONSTRAINT "my_world_faq_revisions_page_attempt_uq" UNIQUE("page_key","attempt_id"),
	CONSTRAINT "my_world_faq_revisions_head_pointer_uq" UNIQUE("page_key","id","version","canonical_digest"),
	CONSTRAINT "my_world_faq_revisions_page_key_check" CHECK ("my_world_faq_revisions"."page_key" = 'my-world-faq'),
	CONSTRAINT "my_world_faq_revisions_version_check" CHECK ("my_world_faq_revisions"."version" > 0),
	CONSTRAINT "my_world_faq_revisions_schema_version_check" CHECK ("my_world_faq_revisions"."schema_version" > 0),
	CONSTRAINT "my_world_faq_revisions_structure_version_check" CHECK ("my_world_faq_revisions"."structure_version" > 0),
	CONSTRAINT "my_world_faq_revisions_document_object_check" CHECK (jsonb_typeof("my_world_faq_revisions"."document") = 'object'),
	CONSTRAINT "my_world_faq_revisions_digest_check" CHECK ("my_world_faq_revisions"."canonical_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "my_world_faq_revisions_fingerprint_check" CHECK ("my_world_faq_revisions"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "my_world_faq_revisions_attribution_check" CHECK (("my_world_faq_revisions"."attribution_kind" = 'system-import' and "my_world_faq_revisions"."saved_by_name" is null)
          or ("my_world_faq_revisions"."attribution_kind" = 'self-declared'
              and "my_world_faq_revisions"."saved_by_name" is not null
              and length(btrim("my_world_faq_revisions"."saved_by_name")) between 1 and 80))
);
--> statement-breakpoint
ALTER TABLE "my_world_faq_heads" ADD CONSTRAINT "my_world_faq_heads_revision_fk" FOREIGN KEY ("page_key","current_revision_id","current_version","current_digest") REFERENCES "public"."my_world_faq_revisions"("page_key","id","version","canonical_digest") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "my_world_faq_revisions" ADD CONSTRAINT "my_world_faq_revisions_restored_from_revision_id_my_world_faq_revisions_id_fk" FOREIGN KEY ("restored_from_revision_id") REFERENCES "public"."my_world_faq_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_my_world_faq_editor_sessions_active_expiry" ON "my_world_faq_editor_sessions" USING btree ("absolute_expires_at","last_seen_at") WHERE "my_world_faq_editor_sessions"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "idx_my_world_faq_editor_sessions_revoked" ON "my_world_faq_editor_sessions" USING btree ("revoked_at") WHERE "my_world_faq_editor_sessions"."revoked_at" is not null;--> statement-breakpoint
CREATE INDEX "idx_my_world_faq_revisions_page_version" ON "my_world_faq_revisions" USING btree ("page_key","version" DESC NULLS LAST);--> statement-breakpoint
CREATE FUNCTION "reject_my_world_faq_revision_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'my_world_faq_revisions is append-only'
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "my_world_faq_revisions_append_only"
BEFORE UPDATE OR DELETE ON "my_world_faq_revisions"
FOR EACH ROW
EXECUTE FUNCTION "reject_my_world_faq_revision_mutation"();
