DO $$ BEGIN
 CREATE TYPE "public"."message_type" AS ENUM('text', 'voice', 'image', 'document', 'video');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payment_method_type" AS ENUM('cash', 'e_wallet', 'bank_transfer', 'credit_card', 'debit_card', 'qris', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."processing_status" AS ENUM('pending', 'processing', 'pending_confirmation', 'done', 'failed', 'skipped');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."processing_step" AS ENUM('transcription', 'ocr', 'ai_extraction', 'categorization', 'notification');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."report_type" AS ENUM('daily', 'weekly', 'monthly', 'custom');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."transaction_type" AS ENUM('expense', 'income', 'transfer');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "ai_processing_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_message_id" uuid NOT NULL,
	"step" "processing_step" NOT NULL,
	"status" "processing_status" NOT NULL,
	"provider" text,
	"duration_ms" integer,
	"input_snapshot" jsonb,
	"output_snapshot" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"category" "analytics_event_category" NOT NULL,
	"event" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"last_warning_sent_at" timestamp,
	"last_alert_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_budgets_user_cat_month_year" UNIQUE("user_id","category_id","month","year")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"type" "payment_method_type" NOT NULL,
	"icon" text,
	"color" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_ai_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_message_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"response" text NOT NULL,
	"parsed_output" jsonb,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"is_valid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"wa_message_id" text NOT NULL,
	"from" text NOT NULL,
	"type" "message_type" NOT NULL,
	"body" text,
	"media_url" text,
	"media_mimetype" text,
	"media_size" integer,
	"storage_path" text,
	"raw_payload" jsonb NOT NULL,
	"processing_status" "processing_status" DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"received_at" timestamp NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "raw_messages_wa_message_id_unique" UNIQUE("wa_message_id")
);
--> statement-breakpoint
CREATE TABLE "recurring_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(15, 2),
	"payment_method_id" uuid,
	"category_id" uuid,
	"frequency" text DEFAULT 'MONTHLY' NOT NULL,
	"day_of_month" integer,
	"day_of_week" integer,
	"reminder_day_offset" integer DEFAULT -1 NOT NULL,
	"next_reminder_at" timestamp NOT NULL,
	"last_reminder_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "report_type" NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"opening_balance" numeric DEFAULT '0' NOT NULL,
	"closing_balance" numeric DEFAULT '0' NOT NULL,
	"summary" text,
	"data" jsonb NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"magic_token" text,
	"magic_token_expires_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_magic_token_unique" UNIQUE("magic_token")
);
--> statement-breakpoint
CREATE TABLE "transaction_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" "transaction_type" NOT NULL,
	"icon" text,
	"color" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_tag_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"user_id" uuid NOT NULL,
	"raw_message_id" uuid,
	"category_id" uuid,
	"payment_method_id" uuid,
	"to_payment_method_id" uuid,
	"type" "transaction_type" NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"fee" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(15, 2) NOT NULL,
	"fee_note" text,
	"merchant" text,
	"location" text,
	"notes" text,
	"source_type" "message_type" NOT NULL,
	"confidence_score" real,
	"is_confirmed" boolean DEFAULT true NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"transaction_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	CONSTRAINT "transactions_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"onboarded_at" timestamp,
	"report_schedule" text DEFAULT 'monthly',
	"report_time" text DEFAULT '07:00',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status_code" integer,
	"duration_ms" integer,
	"success" boolean DEFAULT false NOT NULL,
	"error" text,
	"delivered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"event_types" text[] DEFAULT ARRAY['*'] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"timeout_ms" integer DEFAULT 10000 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"last_triggered_at" timestamp,
	"last_response_status" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_subscriptions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "ai_processing_logs" ADD CONSTRAINT "ai_processing_logs_raw_message_id_raw_messages_id_fk" FOREIGN KEY ("raw_message_id") REFERENCES "public"."raw_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_transaction_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."transaction_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_ai_outputs" ADD CONSTRAINT "raw_ai_outputs_raw_message_id_raw_messages_id_fk" FOREIGN KEY ("raw_message_id") REFERENCES "public"."raw_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_messages" ADD CONSTRAINT "raw_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_category_id_transaction_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."transaction_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_categories" ADD CONSTRAINT "transaction_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tag_mappings" ADD CONSTRAINT "transaction_tag_mappings_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tag_mappings" ADD CONSTRAINT "transaction_tag_mappings_tag_id_transaction_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."transaction_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_raw_message_id_raw_messages_id_fk" FOREIGN KEY ("raw_message_id") REFERENCES "public"."raw_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_transaction_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."transaction_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("to_payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_subscription_id_webhook_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."webhook_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_processing_logs_raw_message_id" ON "ai_processing_logs" USING btree ("raw_message_id");--> statement-breakpoint
CREATE INDEX "idx_ai_processing_logs_step" ON "ai_processing_logs" USING btree ("step");--> statement-breakpoint
CREATE INDEX "idx_ai_processing_logs_status" ON "ai_processing_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_analytics_events_category" ON "analytics_events" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_analytics_events_event" ON "analytics_events" USING btree ("event");--> statement-breakpoint
CREATE INDEX "idx_analytics_events_user_id" ON "analytics_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_events_created_at" ON "analytics_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_budgets_user_month_year" ON "budgets" USING btree ("user_id","month","year");--> statement-breakpoint
CREATE INDEX "idx_payment_methods_user_id" ON "payment_methods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_payment_methods_type" ON "payment_methods" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_raw_ai_outputs_raw_message_id" ON "raw_ai_outputs" USING btree ("raw_message_id");--> statement-breakpoint
CREATE INDEX "idx_raw_ai_outputs_provider" ON "raw_ai_outputs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_raw_messages_user_id" ON "raw_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_raw_messages_processing_status" ON "raw_messages" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "idx_raw_messages_received_at" ON "raw_messages" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "idx_raw_messages_wa_message_id" ON "raw_messages" USING btree ("wa_message_id");--> statement-breakpoint
CREATE INDEX "idx_recurring_bills_user_id" ON "recurring_bills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_recurring_bills_next_reminder" ON "recurring_bills" USING btree ("next_reminder_at");--> statement-breakpoint
CREATE INDEX "idx_recurring_bills_is_active" ON "recurring_bills" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_reports_user_id_type_period" ON "reports" USING btree ("user_id","type","period_start");--> statement-breakpoint
CREATE INDEX "idx_sessions_user_id" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_magic_token" ON "user_sessions" USING btree ("magic_token");--> statement-breakpoint
CREATE INDEX "idx_transaction_categories_type" ON "transaction_categories" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_transaction_categories_user_id" ON "transaction_categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_transaction_categories_is_default" ON "transaction_categories" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "idx_transaction_tag_mappings_transaction_id" ON "transaction_tag_mappings" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_transaction_tag_mappings_tag_id" ON "transaction_tag_mappings" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_transaction_tag_mappings_unique" ON "transaction_tag_mappings" USING btree ("transaction_id","tag_id");--> statement-breakpoint
CREATE INDEX "idx_transaction_tags_user_id" ON "transaction_tags" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_transaction_tags_user_id_name" ON "transaction_tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "idx_transactions_user_id_date" ON "transactions" USING btree ("user_id","transaction_date");--> statement-breakpoint
CREATE INDEX "idx_transactions_user_id_type" ON "transactions" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "idx_transactions_category_id" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_payment_method_id" ON "transactions" USING btree ("payment_method_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_to_payment_method_id" ON "transactions" USING btree ("to_payment_method_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_is_deleted" ON "transactions" USING btree ("is_deleted");--> statement-breakpoint
CREATE INDEX "idx_transactions_is_confirmed" ON "transactions" USING btree ("is_confirmed");--> statement-breakpoint
CREATE INDEX "idx_transactions_unpublished" ON "transactions" USING btree ("is_published") WHERE is_published = FALSE;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_transactions_event_id" ON "transactions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_users_phone" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_webhook_delivery_logs_event_id" ON "webhook_delivery_logs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_delivery_logs_subscription_id" ON "webhook_delivery_logs" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_delivery_logs_success" ON "webhook_delivery_logs" USING btree ("success");--> statement-breakpoint
CREATE INDEX "idx_webhook_subscriptions_name" ON "webhook_subscriptions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_webhook_subscriptions_active" ON "webhook_subscriptions" USING btree ("is_active");
