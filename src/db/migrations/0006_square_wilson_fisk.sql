CREATE TABLE "my_world_faq_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "my_world_faq_feedback_kind_check" CHECK ("my_world_faq_feedback"."kind" in ('question', 'concern', 'suggestion')),
	CONSTRAINT "my_world_faq_feedback_message_check" CHECK (length(btrim("my_world_faq_feedback"."message")) between 1 and 2000)
);
--> statement-breakpoint
CREATE INDEX "idx_my_world_faq_feedback_created" ON "my_world_faq_feedback" USING btree ("created_at" DESC NULLS LAST);