-- Server-side (DB-level) enforcement of the published-page plan limit.
--
-- Why a trigger: the limit was enforced only in the v1 API, but the dashboard
-- publishes is_published directly through the browser Supabase client (RLS) from
-- several paths (PagesManager, DashboardClient, the page editors, the create
-- flow). A trigger is the single chokepoint that covers all of them - including
-- raw PostgREST - without threading a server route through every publish site.
--
-- Grandfathering: enforcing the limit retroactively would freeze existing Free
-- users who published multiple pages before gating existed. So the effective
-- limit is max(plan_limit, grandfathered_baseline), where the baseline is each
-- owner's published-page count snapshotted at migration time (only for owners
-- already over their plan limit). Such owners keep every live page and may
-- unpublish/republish up to their baseline, but cannot grow past it until they
-- upgrade; everyone else is held to their plan limit. New owners have no
-- baseline and are enforced strictly.
--
-- Fail-open by design: the trigger returns NEW on every path except an explicit,
-- definite over-limit case, so a logic gap can never block legitimate publishes.

-- 1. Baseline table (internal; only the SECURITY DEFINER trigger + service role touch it).
create table if not exists public.published_page_grandfather (
  owner_id uuid primary key,
  baseline int not null check (baseline >= 0),
  created_at timestamptz not null default now()
);
alter table public.published_page_grandfather enable row level security;
revoke all on public.published_page_grandfather from anon, authenticated;

-- 2. Plan -> published-page limit. MUST mirror lib/billing.ts getPlanLimits().pages
--    (Free 1 / Launch 3 / Pro 25 / Scale 100 / Enterprise unlimited). Status-aware:
--    only a live subscription confers its plan (mirrors getOwnerPlanId).
create or replace function public.plan_published_page_limit(p_owner uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when s.status not in ('active','trialing','past_due','unpaid') then 1
      when s.plan_id = 'launch' then 3
      when s.plan_id = 'pro' then 25
      when s.plan_id = 'scale' then 100
      when s.plan_id = 'enterprise' then 2147483647  -- effectively unlimited
      else 1                                          -- free / unknown plan
    end
    from public.billing_subscriptions s
    where s.owner_id = p_owner
  ), 1);  -- no subscription row -> free
$$;
-- Internal helper: not a public RPC. Supabase grants EXECUTE to anon +
-- authenticated on new public functions, so revoke those roles explicitly (plus
-- PUBLIC) to keep it off the PostgREST surface.
revoke all on function public.plan_published_page_limit(uuid) from anon, authenticated, public;

-- 3. Snapshot the grandfathered baseline for owners CURRENTLY over their plan limit.
insert into public.published_page_grandfather (owner_id, baseline)
select p.owner_id, count(*)::int
from public.pages p
where p.is_published and p.owner_id is not null
group by p.owner_id
having count(*) > public.plan_published_page_limit(p.owner_id)
on conflict (owner_id) do nothing;

-- 4. Enforcement trigger: only on the draft -> published transition (and publishing inserts).
create or replace function public.enforce_published_page_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective int;
  v_count int;
begin
  -- Not publishing -> nothing to enforce.
  if NEW.is_published is not true then
    return NEW;
  end if;
  -- Already published (editing other fields) -> unrestricted.
  if TG_OP = 'UPDATE' and OLD.is_published is true then
    return NEW;
  end if;
  if NEW.owner_id is null then
    return NEW;  -- nothing to scope a limit to; let other constraints handle it
  end if;

  -- Serialize concurrent publishes for the same owner so the count-then-check
  -- below can't be raced past the limit (transaction-scoped; auto-released at
  -- commit/rollback). Only taken on actual publish transitions, so the common
  -- path is unaffected.
  perform pg_advisory_xact_lock(hashtext('published_page_limit:' || NEW.owner_id::text));

  v_effective := greatest(
    public.plan_published_page_limit(NEW.owner_id),
    coalesce((select baseline from public.published_page_grandfather where owner_id = NEW.owner_id), 0)
  );

  select count(*) into v_count
  from public.pages
  where owner_id = NEW.owner_id and is_published is true and id <> NEW.id;

  if v_count >= v_effective then
    raise exception 'Published page limit reached for your plan (% page(s)).', v_effective
      using errcode = 'check_violation',
            hint = 'Upgrade your plan or unpublish another page to publish this one.';
  end if;

  return NEW;
end;
$$;

-- Trigger function: only ever runs as a trigger; not a public RPC.
revoke all on function public.enforce_published_page_limit() from anon, authenticated, public;

drop trigger if exists trg_enforce_published_page_limit on public.pages;
create trigger trg_enforce_published_page_limit
  before insert or update of is_published on public.pages
  for each row execute function public.enforce_published_page_limit();
