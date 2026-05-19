CREATE TABLE "vips_share_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"show_quotes" boolean DEFAULT false NOT NULL,
	"name_snapshot" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "vips_share_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "idx_vips_share_tokens_student" ON "vips_share_tokens" USING btree ("student_id");--> statement-breakpoint
CREATE POLICY "vips_share_tokens_rls" ON "vips_share_tokens" AS PERMISSIVE FOR ALL TO public USING (student_id = current_setting('app.student_id', true)) WITH CHECK (student_id = current_setting('app.student_id', true));
--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- share_token_resolve(p_token) — SECURITY DEFINER resolver for the public
-- /share/$token route. The caller (loadPublicProfileHandler) has no auth
-- context, so it cannot satisfy the RLS predicate on vips_share_tokens. This
-- function runs as its owner (the migration role) and is the SINGLE permitted
-- path for unauth reads of the table.
--
-- Security properties enforced by code review:
--   1. Body touches ONLY vips_share_tokens. No DML. No other tables.
--   2. Returns only (student_id, show_quotes, name_snapshot) — minimal surface.
--   3. STABLE — read-only; cannot mutate row state.
--   4. SET search_path = pg_catalog, public — defeats search-path injection.
--   5. Filters revoked_at IS NULL — revoked tokens are indistinguishable from
--      typos at this layer; the caller calls a separate path (or repeats the
--      lookup with a relaxed predicate) when it needs to distinguish for UX.
--
-- Future contributors: do NOT extend the return signature or add joins inside
-- this function without a fresh security review. If you need more fields,
-- write a new SECURITY DEFINER function rather than widening this one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION share_token_resolve(p_token text)
RETURNS TABLE (student_id text, show_quotes boolean, name_snapshot text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT student_id, show_quotes, name_snapshot
  FROM vips_share_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
  LIMIT 1
$$;
--> statement-breakpoint
-- Companion resolver for distinguishing revoked vs not-found in the public
-- route's terminal-state UX. Returns revoked_at so the caller can branch.
-- Same security envelope: definer-locked search_path, STABLE, single table.
CREATE OR REPLACE FUNCTION share_token_resolve_with_status(p_token text)
RETURNS TABLE (student_id text, show_quotes boolean, name_snapshot text, revoked_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT student_id, show_quotes, name_snapshot, revoked_at
  FROM vips_share_tokens
  WHERE token = p_token
  LIMIT 1
$$;