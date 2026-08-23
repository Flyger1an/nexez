-- Platform admin role. The platform had NO admin concept - access was purely
-- plan-tier (billing_subscriptions → getOwnerPlanId / owner_plan_rank). This adds a
-- minimal, SECURE admin flag whose ONLY effect is to resolve the owner to the TOP
-- plan tier everywhere (entitlements god-mode: every gated feature + unlimited
-- limits), so a test/staff account can exhaustively exercise the product without a
-- paid subscription.
--
-- SCOPE / SECURITY BOUNDARY (deliberate): admin grants ENTITLEMENTS only. It does
-- NOT bypass RLS / tenancy - an admin still cannot read another owner's pages,
-- orders, or negotiations. It is not cross-tenant access or impersonation. Admin
-- status is NOT self-grantable: authenticated users may READ only their own row
-- (so the UI can show a badge); all writes are service-role only.
-- Additive + idempotent.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- Strip Supabase's default anon+authenticated grants, then re-grant ONLY
-- authenticated SELECT (gated to own row by the policy). No insert/update/delete
-- grant to anyone but service-role → admin can never be self-assigned from a client.
revoke all on public.platform_admins from anon;
revoke all on public.platform_admins from authenticated;
grant select on public.platform_admins to authenticated;

drop policy if exists "see own admin row" on public.platform_admins;
create policy "see own admin row"
  on public.platform_admins
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

------------------------------------------------------------------------------
-- Both DB-level plan gates (the hard chokepoints behind trg_enforce_*) must treat
-- an admin as the top tier, mirroring the TS getOwnerPlanId admin short-circuit.
------------------------------------------------------------------------------

-- Plan RANK: admin ⇒ 4 (enterprise). Otherwise the existing status-aware ladder.
create or replace function public.owner_plan_rank(p_owner uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.platform_admins a where a.user_id = p_owner) then 4
    else coalesce((
      select case
        when s.status not in ('active','trialing','past_due','unpaid') then 0
        when s.plan_id = 'launch' then 1
        when s.plan_id = 'pro' then 2
        when s.plan_id = 'scale' then 3
        when s.plan_id = 'enterprise' then 4
        else 0
      end
      from public.billing_subscriptions s
      where s.owner_id = p_owner
    ), 0)
  end;
$$;
revoke all on function public.owner_plan_rank(uuid) from anon, authenticated, public;

-- Published-page limit: admin ⇒ effectively unlimited (max int, same as enterprise).
create or replace function public.plan_published_page_limit(p_owner uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.platform_admins a where a.user_id = p_owner) then 2147483647
    else coalesce((
      select case
        when s.status not in ('active','trialing','past_due','unpaid') then 1
        when s.plan_id = 'launch' then 3
        when s.plan_id = 'pro' then 25
        when s.plan_id = 'scale' then 100
        when s.plan_id = 'enterprise' then 2147483647
        else 1
      end
      from public.billing_subscriptions s
      where s.owner_id = p_owner
    ), 1)
  end;
$$;
revoke all on function public.plan_published_page_limit(uuid) from anon, authenticated, public;
