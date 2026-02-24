CREATE TYPE "public"."claim_status" AS ENUM('pending', 'verified', 'expired');--> statement-breakpoint
CREATE TABLE "agent_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"claim_token" text NOT NULL,
	"verification_code" text NOT NULL,
	"x_handle" text,
	"status" "claim_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_claims_agent_id_unique" UNIQUE("agent_id"),
	CONSTRAINT "agent_claims_claim_token_unique" UNIQUE("claim_token"),
	CONSTRAINT "agent_claims_verification_code_unique" UNIQUE("verification_code")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "x_claim_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_claims" ADD CONSTRAINT "agent_claims_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;