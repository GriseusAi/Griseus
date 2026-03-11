CREATE TABLE "capacity_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"line_id" integer,
	"period" text,
	"period_value" text,
	"theoretical_max" integer,
	"actual_output" integer,
	"utilization_pct" numeric,
	"calculated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "certification_requirements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certification_id" varchar NOT NULL,
	"validity_period" integer,
	"renewal_process" text,
	"renewal_cost" double precision,
	"continuing_education_hours" integer
);
--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"issuing_body" text NOT NULL,
	"website" text,
	"validity_years" integer,
	"description" text,
	CONSTRAINT "certifications_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'cukurova',
	"name" text NOT NULL,
	"type" text,
	"location" text,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ge_workers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'cukurova',
	"name" text NOT NULL,
	"department" text,
	"hire_date" date,
	"status" text DEFAULT 'active',
	"trust_score" numeric,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"applied_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "kpi_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'cukurova',
	"name" text NOT NULL,
	"formula" text,
	"unit" text,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "kpi_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"kpi_id" integer,
	"period" text,
	"target" numeric,
	"actual" numeric,
	"achievement_pct" numeric
);
--> statement-breakpoint
CREATE TABLE "ontology_actions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_type" text NOT NULL,
	"actor_id" varchar,
	"target_type" text NOT NULL,
	"target_id" varchar NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"result" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ontology_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_type" text NOT NULL,
	"from_id" varchar NOT NULL,
	"link_type" text NOT NULL,
	"to_type" text NOT NULL,
	"to_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ontology_objects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_type" text NOT NULL,
	"object_id" varchar NOT NULL,
	"name" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"line_id" integer,
	"product_id" integer,
	"work_order_no" text,
	"serial_range" text,
	"planned_qty" integer,
	"actual_qty" integer,
	"planned_date" date,
	"actual_date" date,
	"status" text DEFAULT 'completed',
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "password_reset_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"code" varchar(6) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phase_trade_requirements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_phase_id" varchar NOT NULL,
	"trade_id" varchar NOT NULL,
	"workers_needed" integer DEFAULT 1 NOT NULL,
	"priority" text NOT NULL,
	"duration_weeks" integer NOT NULL,
	"required_certifications" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "production_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"facility_id" integer,
	"name" text NOT NULL,
	"type" text,
	"worker_count" integer,
	"capacity_unit_time_min" numeric,
	"current_unit_time_min" numeric,
	"daily_hours" numeric DEFAULT '9',
	"monthly_days" integer DEFAULT 22,
	"production_months" integer DEFAULT 10,
	"status" text DEFAULT 'active'
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'cukurova',
	"sku" text,
	"name" text NOT NULL,
	"category" text,
	"base_unit_time_min" numeric
);
--> statement-breakpoint
CREATE TABLE "project_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"role" text DEFAULT 'crew' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_phases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_phases_trades" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_phase_id" varchar NOT NULL,
	"trade_id" varchar NOT NULL,
	"required_worker_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_schedules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"project_id" varchar,
	"phase_name" text NOT NULL,
	"phase_start_date" text NOT NULL,
	"sourcing_deadline" text NOT NULL,
	"trades_needed" text[] DEFAULT '{}'::text[],
	"status" text DEFAULT 'planning' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"client" text NOT NULL,
	"location" text NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"description" text,
	"start_date" text,
	"end_date" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"power_capacity" text,
	"tier" text,
	"image_url" text,
	"latitude" double precision,
	"longitude" double precision,
	"trades_needed" text[] DEFAULT '{}'::text[],
	"hourly_rate" text
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"line_id" integer,
	"period_type" text,
	"period_value" text,
	"planned_qty" integer,
	"actual_qty" integer,
	"deviation_pct" numeric
);
--> statement-breakpoint
CREATE TABLE "service_appointments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" varchar NOT NULL,
	"project_id" varchar,
	"assignee_id" varchar,
	"title" text NOT NULL,
	"description" text,
	"appointment_type" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"scheduled_date" text NOT NULL,
	"scheduled_time" text NOT NULL,
	"estimated_duration" integer DEFAULT 60 NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_address" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"trade_id" varchar NOT NULL,
	"description" text,
	"difficulty_level" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_adjacencies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_trade_id" varchar NOT NULL,
	"target_trade_id" varchar NOT NULL,
	"required_certification_id" varchar,
	"transition_difficulty" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	CONSTRAINT "trades_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "trades_certifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" varchar NOT NULL,
	"certification_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" text NOT NULL,
	"name" text,
	"company_name" text,
	"industry" text,
	"position" text,
	"trade" text,
	"years_experience" integer,
	"location" text,
	"company_type" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wage_data" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" varchar NOT NULL,
	"region" text NOT NULL,
	"experience_level" text NOT NULL,
	"hourly_rate_min" double precision NOT NULL,
	"hourly_rate_max" double precision NOT NULL,
	"overtime_multiplier" double precision DEFAULT 1.5 NOT NULL,
	"per_diem_daily" double precision,
	"data_source" text,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"project_id" varchar NOT NULL,
	"assignee_id" varchar,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"trade" text NOT NULL,
	"due_date" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "worker_capabilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer,
	"capability_name" text NOT NULL,
	"capability_type" text,
	"level" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "worker_certifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" varchar NOT NULL,
	"certification_id" varchar NOT NULL,
	"earned_date" text,
	"expiry_date" text
);
--> statement-breakpoint
CREATE TABLE "worker_skills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" varchar NOT NULL,
	"skill_id" varchar NOT NULL,
	"proficiency_level" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"trade" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"location" text NOT NULL,
	"avatar_url" text,
	"experience" integer DEFAULT 0 NOT NULL,
	"certifications" text[] DEFAULT '{}'::text[],
	"available" boolean DEFAULT true NOT NULL,
	"bio" text,
	"wallet_balance" integer DEFAULT 0 NOT NULL,
	"pending_payout" integer DEFAULT 0 NOT NULL,
	"total_hours_worked" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capacity_metrics" ADD CONSTRAINT "capacity_metrics_line_id_production_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."production_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_records" ADD CONSTRAINT "kpi_records_kpi_id_kpi_definitions_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_line_id_production_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."production_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_line_id_production_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."production_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_capabilities" ADD CONSTRAINT "worker_capabilities_worker_id_ge_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."ge_workers"("id") ON DELETE no action ON UPDATE no action;