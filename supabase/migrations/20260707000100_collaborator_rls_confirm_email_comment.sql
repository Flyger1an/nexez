-- R5 deferred item (5): document the implicit dependency of the collaborator
-- RLS policies on Supabase Auth "Confirm email" staying ON.
--
-- These policies grant a signed-in user read/update on another owner's pages
-- when their JWT email matches a non-revoked team_invites row. That email is
-- trustworthy ONLY because sign-up requires email confirmation - with
-- "Confirm email" OFF, anyone could register claiming a pending invitee's
-- address and inherit that page access without ever controlling the inbox.
-- The app layer also gates on email_confirmed_at (lib/server/page-access.ts),
-- but this RLS grant is enforced independently, so the invariant lives here too.
--
-- Comment-only migration: no schema/behavior change. It exists so the next
-- person reading the policy (or an auditor) sees the Supabase-dashboard
-- setting this depends on, which is not otherwise visible in the repo.

comment on policy "collaborators read shared pages" on public.pages is
  'Grants cross-owner page READ via JWT-email match against team_invites. SECURITY INVARIANT: depends on Supabase Auth "Confirm email" staying ON — an unconfirmed email in the JWT would let an attacker claim a pending invitee''s address and inherit access. App layer also gates on email_confirmed_at.';

comment on policy "editor collaborators update shared pages" on public.pages is
  'Grants cross-owner page UPDATE (editor role) via JWT-email match against team_invites. SECURITY INVARIANT: depends on Supabase Auth "Confirm email" staying ON (see the read policy comment).';
