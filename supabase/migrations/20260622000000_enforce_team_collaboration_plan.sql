-- Server-side (DB-level) enforcement of the teamCollaboration (Scale+) gate.
--
-- Why: team_invites rows are written DIRECTLY through the browser Supabase client
-- (components/TeamInvites.tsx) under an RLS policy that only scopes by owner_id -
-- it enforces tenancy, not plan. And a non-revoked team_invites row is not
-- cosmetic: migration 20260603220000 grants the invited email SELECT (and, for
-- role='editor', UPDATE) on the owner's pages. So an unguarded INSERT is a real
-- Scale ($149/mo) paywall bypass with live cross-tenant edit consequences. The
-- client PlanGate is only a teaser; this trigger is the actual enforcement, the
-- same chokepoint pattern as the published-page limit (20260621000000).

-- Reusable status-aware plan RANK (free 0 / launch 1 / pro 2 / scale 3 / ent 4),
-- mirroring lib/billing.ts plan ranks. Only a live subscription confers its rank
-- (mirrors getOwnerPlanId). Returns 0 (free) when there's no live subscription.
create or replace function public.owner_plan_rank(p_owner uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
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
  ), 0);
$$;
revoke all on function public.owner_plan_rank(uuid) from anon, authenticated, public;

-- Gate only INSERT (creating an invite is the paid action). Revoking an invite
-- (UPDATE status='revoked') stays open so a downgraded owner can still clean up.
-- Existing invites are grandfathered (not retroactively revoked).
create or replace function public.enforce_team_collaboration_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.owner_id is null then
    return NEW;
  end if;
  if public.owner_plan_rank(NEW.owner_id) < 3 then  -- 3 = Scale (teamCollaboration min rank)
    raise exception 'Team collaboration is a Scale plan feature.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Scale to invite team members.';
  end if;
  return NEW;
end;
$$;
revoke all on function public.enforce_team_collaboration_plan() from anon, authenticated, public;

drop trigger if exists trg_enforce_team_collaboration on public.team_invites;
create trigger trg_enforce_team_collaboration
  before insert on public.team_invites
  for each row execute function public.enforce_team_collaboration_plan();
