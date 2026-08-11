-- pg_net enables async outbound HTTP from Postgres. Used to drive the
-- agent-readiness study batch runner (server-side scan batches triggered via
-- authenticated POSTs) and for scan persistence verification. Supabase-native
-- extension; installed into the extensions schema per platform convention.
create extension if not exists pg_net with schema extensions;
