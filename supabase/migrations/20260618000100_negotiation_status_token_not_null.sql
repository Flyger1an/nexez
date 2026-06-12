-- Red-team gauntlet (IDOR re-run, INFO-1): loadNegotiation skipped the token
-- credential check for any row whose status_token was NULL/empty. Backfill the
-- tokenless rows, then enforce NOT NULL so the guard can never be skipped again.
UPDATE agent_negotiations
SET status_token = replace(gen_random_uuid()::text, '-', '')
WHERE status_token IS NULL OR status_token = '';

ALTER TABLE agent_negotiations ALTER COLUMN status_token SET NOT NULL;
