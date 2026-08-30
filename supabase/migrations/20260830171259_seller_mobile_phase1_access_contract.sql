begin;

-- Seller clients read their own requests through the owner RLS policy. Status
-- transitions must pass through /api/orders/request-status so validation,
-- rate limiting, ownership checks, and activity recording stay centralized.
revoke update on table public.order_requests from authenticated;
grant select on table public.order_requests to authenticated;

-- The canonical server action verifies ownership with the caller's RLS-scoped
-- client, then performs the status transition with the server-only client.
grant select, update on table public.order_requests to service_role;

commit;
