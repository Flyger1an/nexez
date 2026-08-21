-- Resource rows are owner-scoped commerce state. Auth-user deletion cascades
-- through pages and resource_holds; the hold's private ledger children must
-- follow that lifecycle instead of blocking the account deletion transaction.
-- Pool/window allocation FKs stay non-cascading and deferred. That preserves the
-- ordinary merchant-delete guard while allowing one account-deletion transaction
-- to remove the owning holds and their allocations before constraints are checked.

alter table public.resource_pool_windows
  drop constraint resource_pool_windows_pool_id_fkey,
  add constraint resource_pool_windows_pool_id_fkey
    foreign key (pool_id) references public.resource_pools(id) on delete cascade;

alter table public.resource_holds
  drop constraint resource_holds_page_id_fkey,
  add constraint resource_holds_page_id_fkey
    foreign key (page_id) references public.pages(id)
    on delete no action deferrable initially deferred;

alter table public.resource_hold_allocations
  drop constraint resource_hold_allocations_hold_id_fkey,
  add constraint resource_hold_allocations_hold_id_fkey
    foreign key (hold_id) references public.resource_holds(id) on delete cascade,
  drop constraint resource_hold_allocations_pool_id_fkey,
  add constraint resource_hold_allocations_pool_id_fkey
    foreign key (pool_id) references public.resource_pools(id)
    on delete no action deferrable initially deferred,
  drop constraint resource_hold_allocations_window_id_fkey,
  add constraint resource_hold_allocations_window_id_fkey
    foreign key (window_id) references public.resource_pool_windows(id)
    on delete no action deferrable initially deferred;

alter table public.resource_reservations
  drop constraint resource_reservations_hold_id_fkey,
  add constraint resource_reservations_hold_id_fkey
    foreign key (hold_id) references public.resource_holds(id) on delete cascade,
  drop constraint resource_reservations_page_id_fkey,
  add constraint resource_reservations_page_id_fkey
    foreign key (page_id) references public.pages(id)
    on delete no action deferrable initially deferred;

alter table public.resource_allocation_events
  drop constraint resource_allocation_events_hold_id_fkey,
  add constraint resource_allocation_events_hold_id_fkey
    foreign key (hold_id) references public.resource_holds(id) on delete cascade;
