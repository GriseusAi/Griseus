CREATE TABLE "stock_movements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" integer NOT NULL,
	"movement_type" varchar(20) NOT NULL,
	"quantity" integer NOT NULL,
	"source" varchar(50) NOT NULL,
	"reference_id" varchar(255),
	"entered_by" varchar(255),
	"entered_at" timestamp DEFAULT now() NOT NULL,
	"synced_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_states" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" integer NOT NULL,
	"confirmed_quantity" integer DEFAULT 0 NOT NULL,
	"confirmed_updated_at" timestamp,
	"predicted_quantity" integer DEFAULT 0 NOT NULL,
	"predicted_updated_at" timestamp,
	"pending_production" integer DEFAULT 0 NOT NULL,
	"pending_sales" integer DEFAULT 0 NOT NULL,
	"blind_spot_hours" integer DEFAULT 999 NOT NULL,
	"confidence_score" numeric DEFAULT '20' NOT NULL,
	"status" varchar(20) DEFAULT 'critical' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "weekly_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"line_id" integer,
	"week_label" text NOT NULL,
	"planned_qty" integer NOT NULL,
	"predicted_qty" integer,
	"actual_qty" integer,
	"realization_rate" numeric,
	"prediction_accuracy" numeric,
	"status" text DEFAULT 'planned' NOT NULL,
	"notes" text,
	"deviation_reason" text,
	"deviation_notes" text,
	"week_number" integer,
	"month_number" integer,
	"risk_flag" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_states" ADD CONSTRAINT "stock_states_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;