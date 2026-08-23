-- Phase 1 of the no-Free re-tier: team collaboration moves from Scale (rank 3) to Pro
-- (rank 2) and gains a per-plan SEAT quota, so Scale/Enterprise differentiate by LIMITS
-- (seats, listings, domains) rather than exclusive features. Mirrors lib/billing.ts
-- (FEATURE_MIN_RANK.teamCollaboration 3→2, PlanLimits.teamSeats pro 3 / scale 10 / ent ∞).

-- Per-plan team seat quota (mirrors lib/billing.ts limits.teamSeats). Only a live
-- subscription confers seats (mirrors owner_plan_rank). MUST stay in lockstep with
-- owner_plan_rank's status logic - Phase 2 updates both together for paused/legacy.
create or replace function public.owner_team_seat_limit(p_owner uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when s.status not in ('active','trialing','past_due','unpaid') then 0
      when s.plan_id = 'pro' then 3
      when s.plan_id = 'scale' then 10
      when s.plan_id = 'enterprise' then 2147483647
      else 0   -- launch / free: team collaboration not available
    end
    from public.billing_subscriptions s
    where s.owner_id = p_owner
  ), 0);
$$;
revoke all on function public.owner_team_seat_limit(uuid) from anon, authenticated, public;

-- Gate INSERT: Pro+ unlocks team collaboration AND it's seat-capped per plan. Revoking an
-- invite stays open (a downgraded owner can clean up). The count >= limit check naturally
-- grandfathers existing over-limit owners - they keep their seats but can't add more, no
-- baseline table needed (unlike pages, whose count fluctuates via publish/unpublish).
create or replace function public.enforce_team_collaboration_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_count int;
begin
  if NEW.owner_id is null then
    return NEW;
  end if;

  if public.owner_plan_rank(NEW.owner_id) < 2 then  -- 2 = Pro (teamCollaboration min rank)
    raise exception 'Team collaboration is a Pro plan feature.'
      using errcode = 'check_violation',
            hint = 'Upgrade to Pro to invite team members.';
  end if;

  v_limit := public.owner_team_seat_limit(NEW.owner_id);
  select count(*) into v_count
  from public.team_invites
  where owner_id = NEW.owner_id and coalesce(status, '') <> 'revoked';
  if v_count >= v_limit then
    raise exception 'Team seat limit reached for your plan (% seats).', v_limit
      using errcode = 'check_violation',
            hint = 'Upgrade for more team seats.';
  end if;

  return NEW;
end;
$$;
revoke all on function public.enforce_team_collaboration_plan() from anon, authenticated, public;
-- trigger trg_enforce_team_collaboration already points at this function (create-or-replace).
