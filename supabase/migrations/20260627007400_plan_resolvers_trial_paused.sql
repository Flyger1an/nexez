-- Phase 2 of the no-Free trial model: make the three DB plan resolvers trial/paused/origin
-- aware, in lockstep with lib/server/plan.ts. All three now:
--   1. short-circuit platform_admins to the top tier (mirrors getOwnerPlanId; the TS comment
--      already claimed this SQL short-circuit existed - now it actually does);
--   2. only let a CONFERRING subscription grant its plan: active/past_due/unpaid, OR a
--      trialing row still inside its window (trial_ends_at in the future / null);
--   3. deny an expired trial or a paused row.
-- Page-limit additionally splits the non-conferring case: a NEW trial account → 0 (paused,
-- can't publish), a 'legacy' (grandfathered) account or no row → 1 (Free, fail-open). Rank +
-- seats deny everyone non-conferring (no paid features either way), so they need no split.

-- ── feature/limit RANK (free 0 / launch 1 / pro 2 / scale 3 / ent 4) ──────────────────────
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
        when (s.status in ('active','past_due','unpaid')
              or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at >= now())))
          then case s.plan_id
            when 'launch' then 1
            when 'pro' then 2
            when 'scale' then 3
            when 'enterprise' then 4
            else 0
          end
        else 0   -- expired trial / paused / canceled / legacy-no-sub → free (no paid features)
      end
      from public.billing_subscriptions s
      where s.owner_id = p_owner
    ), 0)
  end;
$$;
revoke all on function public.owner_plan_rank(uuid) from anon, authenticated, public;

-- ── published-listing LIMIT (mirrors lib/billing.ts limits.pages) ─────────────────────────
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
        when (s.status in ('active','past_due','unpaid')
              or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at >= now())))
          then case s.plan_id
            when 'launch' then 3
            when 'pro' then 25
            when 'scale' then 100
            when 'enterprise' then 2147483647
            else 1                              -- 'free'/unknown conferring plan
          end
        -- not conferring: a NEW trial account that expired/paused can't publish (0); a
        -- grandfathered legacy account (or unknown origin) falls open to Free (1).
        when s.account_origin = 'trial' then 0
        else 1
      end
      from public.billing_subscriptions s
      where s.owner_id = p_owner
    ), 1)  -- no row → Free (fail-open; covers pre-cutover empty accounts)
  end;
$$;
revoke all on function public.plan_published_page_limit(uuid) from anon, authenticated, public;

-- ── team SEAT limit (mirrors lib/billing.ts limits.teamSeats) ─────────────────────────────
create or replace function public.owner_team_seat_limit(p_owner uuid)
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
        when (s.status in ('active','past_due','unpaid')
              or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at >= now())))
          then case s.plan_id
            when 'pro' then 3
            when 'scale' then 10
            when 'enterprise' then 2147483647
            else 0
          end
        else 0
      end
      from public.billing_subscriptions s
      where s.owner_id = p_owner
    ), 0)
  end;
$$;
revoke all on function public.owner_team_seat_limit(uuid) from anon, authenticated, public;
