#!/usr/bin/env python3
"""Run adversarial payment races against an explicitly selected local test DB."""
import json
import os
import subprocess
import uuid
from urllib.parse import parse_qs, urlparse

url = os.environ.get('NEXEZ_TEST_DATABASE_URL', '')
parsed = urlparse(url)
host = parsed.hostname or parse_qs(parsed.query).get('host', [''])[0]
if not url or not (host in ('localhost', '127.0.0.1', '::1') or host.startswith(('/private/tmp/', '/tmp/'))):
    raise SystemExit('NEXEZ_TEST_DATABASE_URL must identify an isolated local test database.')
command = [os.environ.get('PSQL', 'psql'), '-XAtq', '--set=ON_ERROR_STOP=1', '--dbname', url]
owner, page, order = (str(uuid.uuid4()) for _ in range(3))
operation, competing = str(uuid.uuid4()), str(uuid.uuid4())
slug = 'payment-race-' + page

def sql(statement, expected=True):
    result = subprocess.run(command, input=statement, text=True, capture_output=True)
    if expected and result.returncode:
        raise AssertionError(result.stderr)
    return result

def held_transaction(statement):
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    process.stdin.write("begin; " + statement + "; select 'LOCK_READY'; select pg_sleep(1); commit;\n")
    process.stdin.close()
    while True:
        line = process.stdout.readline()
        if not line:
            raise AssertionError(process.stderr.read())
        if line.strip() == 'LOCK_READY':
            return process

def finish(process):
    process.stdout.read()
    errors = process.stderr.read()
    assert process.wait() == 0, errors

def begin(op, amount):
    return f"select public.nz_begin_refund('{op}','{owner}','order','{order}',{amount},'usd')"

try:
    sql(f"""insert into auth.users(id,email,email_confirmed_at) values('{owner}','race-{owner}@example.invalid',now());
    insert into public.pages(id,owner_id,name,slug,is_published) values('{page}','{owner}','Race fixture','{slug}',false);
    insert into public.checkout_orders(id,owner_id,page_id,stripe_session_id,stripe_payment_intent_id,stripe_connect_account_id,amount_cents,currency,status,refunded_cents)
      values('{order}','{owner}','{page}','cs_test_{order}','pi_{order}','acct_test',10000,'usd','paid',0);""")
    first = held_transaction(begin(operation, 2000))
    second = sql(begin(competing, 3000), expected=False)
    finish(first)
    assert second.returncode and 'awaiting reconciliation' in second.stderr
    assert sql(f"select count(*) from public.refund_operations where order_id='{order}'").stdout.strip() == '1'
    print('PASS concurrent different refunds reserve only one provider operation')

    first = held_transaction(begin(operation, 2000))
    second = sql(begin(operation, 2000))
    finish(first)
    assert json.loads(second.stdout)['id'] == operation
    print('PASS concurrent identical retries resolve the same reservation')

    sql(f"select public.nz_record_refund('{operation}','re_{operation}','succeeded',2000); select public.nz_complete_refund('{operation}',2000);")
    sql(begin(competing, 3000))
    sql(f"select public.nz_record_refund('{competing}','re_{competing}','succeeded',3000); select public.nz_complete_refund('{competing}',5000);")
    assert sql(f"select refunded_cents from public.checkout_orders where id='{order}'").stdout.strip() == '5000'
    print('PASS sequential independent partials reconcile their full provider total')

    first = held_transaction(f"select public.nz_apply_payment_reversal('order','{order}','charge.refunded','{{\"amount\":10000,\"amount_refunded\":8000}}')")
    second = sql(f"select public.nz_apply_payment_reversal('order','{order}','charge.refunded','{{\"amount\":10000,\"amount_refunded\":6000}}')")
    finish(first)
    assert json.loads(second.stdout)['changed'] is False
    assert sql(f"select refunded_cents from public.checkout_orders where id='{order}'").stdout.strip() == '8000'
    print('PASS a blocked older webhook cannot overwrite a newer committed total')

    event = 'evt_concurrency_' + order
    token1, token2 = str(uuid.uuid4()), str(uuid.uuid4())
    first = held_transaction(f"select public.nz_claim_stripe_event('{event}','charge.refunded','acct_test','{{}}','{token1}')")
    second = sql(f"select public.nz_claim_stripe_event('{event}','charge.refunded','acct_test','{{}}','{token2}')")
    finish(first)
    assert second.stdout.strip() == 'busy'
    print('PASS concurrent event delivery has one processing lease')
finally:
    sql(f"""delete from public.stripe_webhook_events where event_id='evt_concurrency_{order}';
      delete from public.refund_operations where owner_id='{owner}';
      delete from public.checkout_orders where id='{order}';
      delete from public.pages where id='{page}';
      delete from auth.users where id='{owner}';""")
