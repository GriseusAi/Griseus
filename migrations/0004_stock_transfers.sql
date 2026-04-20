CREATE TABLE IF NOT EXISTS "stock_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"component_code" text NOT NULL,
	"component_name" text,
	"from_location" text NOT NULL,
	"to_location" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unit" text DEFAULT 'AD' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "stock_transfers_component_idx" ON "stock_transfers" ("component_code");
CREATE INDEX IF NOT EXISTS "stock_transfers_status_idx" ON "stock_transfers" ("status");
