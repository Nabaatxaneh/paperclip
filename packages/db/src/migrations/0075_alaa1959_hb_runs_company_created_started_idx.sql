-- ALAA-1959: durable equivalents of the two live-hotfixed indexes on heartbeat_runs.
-- IF NOT EXISTS makes this a no-op on the prod DB after the alamut_* shadows are
-- renamed to these names at deploy (see ops/runbooks/alaa1959-hb-runs-index-deploy.md),
-- avoiding a blocking on-line index build on the ~490MB table. On fresh rebuilds the
-- table is empty so the build is instant.
CREATE INDEX IF NOT EXISTS "heartbeat_runs_company_created_idx" ON "heartbeat_runs" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "heartbeat_runs_company_started_idx" ON "heartbeat_runs" USING btree ("company_id","started_at" DESC NULLS LAST);
