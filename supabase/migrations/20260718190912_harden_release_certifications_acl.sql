-- Supabase's public-schema default privileges grant service_role every table
-- permission. This audit trail only needs server-side reads and appends.
revoke all privileges on table public.release_certifications from service_role;
grant select, insert on table public.release_certifications to service_role;
