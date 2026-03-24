CREATE TABLE "ge_actions_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_type" varchar(100) NOT NULL,
	"actor" varchar(255),
	"target_object_id" varchar,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"result" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ge_link_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_name" varchar(100) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"source_type_id" varchar NOT NULL,
	"target_type_id" varchar NOT NULL,
	"cardinality" varchar(20) DEFAULT 'one_to_many' NOT NULL,
	"properties_schema" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "ge_link_types_api_name_unique" UNIQUE("api_name")
);
--> statement-breakpoint
CREATE TABLE "ge_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_type_id" varchar NOT NULL,
	"source_object_id" varchar NOT NULL,
	"target_object_id" varchar NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "ge_object_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_name" varchar(100) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"description" text,
	"property_schema" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ge_object_types_api_name_unique" UNIQUE("api_name")
);
--> statement-breakpoint
CREATE TABLE "ge_objects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_type_id" varchar NOT NULL,
	"external_id" varchar(255),
	"title" varchar(500) NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"computed_properties" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ge_raw_imports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" varchar NOT NULL,
	"source_file" varchar(500),
	"row_number" integer,
	"raw_data" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"errors" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"in_production" integer DEFAULT 0 NOT NULL,
	"in_warehouse" integer DEFAULT 0 NOT NULL,
	"total_sold" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "stock_levels_product_id_unique" UNIQUE("product_id")
);
--> statement-breakpoint
CREATE TABLE "stock_movements_v2" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"movement_type" text NOT NULL,
	"quantity" integer NOT NULL,
	"previous_state" jsonb,
	"note" text,
	"created_by" text DEFAULT 'üretim_şefi',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ge_actions_log" ADD CONSTRAINT "ge_actions_log_target_object_id_ge_objects_id_fk" FOREIGN KEY ("target_object_id") REFERENCES "public"."ge_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ge_link_types" ADD CONSTRAINT "ge_link_types_source_type_id_ge_object_types_id_fk" FOREIGN KEY ("source_type_id") REFERENCES "public"."ge_object_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ge_link_types" ADD CONSTRAINT "ge_link_types_target_type_id_ge_object_types_id_fk" FOREIGN KEY ("target_type_id") REFERENCES "public"."ge_object_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ge_links" ADD CONSTRAINT "ge_links_link_type_id_ge_link_types_id_fk" FOREIGN KEY ("link_type_id") REFERENCES "public"."ge_link_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ge_links" ADD CONSTRAINT "ge_links_source_object_id_ge_objects_id_fk" FOREIGN KEY ("source_object_id") REFERENCES "public"."ge_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ge_links" ADD CONSTRAINT "ge_links_target_object_id_ge_objects_id_fk" FOREIGN KEY ("target_object_id") REFERENCES "public"."ge_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ge_objects" ADD CONSTRAINT "ge_objects_object_type_id_ge_object_types_id_fk" FOREIGN KEY ("object_type_id") REFERENCES "public"."ge_object_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements_v2" ADD CONSTRAINT "stock_movements_v2_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ge_links_unique_idx" ON "ge_links" USING btree ("link_type_id","source_object_id","target_object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ge_objects_type_external_idx" ON "ge_objects" USING btree ("object_type_id","external_id");