-- Nexxi BUYER FACET: the in-app activity feed. Every BUYER-FACING push (one that carries a `category`
-- - orders / alerts / tasks) also persists a row here so the buyer can see a history of what happened
-- even if a push was missed or muted. Seller-facing pushes carry no category and are NOT recorded here,
-- so this feed never mixes in the seller facet. Written by the SERVICE ROLE (push fan-out); owner-scoped
-- reads. Cleaned on buyer-account deletion.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,               -- 'orders' | 'alerts' | 'tasks' (buyer-facing only)
  type text,                            -- data.type: 'order' | 'negotiation' | 'saved_search' | 'agent_task'
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
-- No INSERT grant: rows are written by the service role (push fan-out) only, so a buyer can't forge one.
grant select, update, delete on public.notifications to authenticated;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
  on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications"
  on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own notifications" on public.notifications;
create policy "Users delete own notifications"
  on public.notifications for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.notifications is 'Buyer-facet: in-app activity feed of buyer-facing pushes (category set). Service-role writes; owner-scoped reads.';
