# Nexez Python Agent SDK

Dependency-free, typed Python client for buyer agents and agent builders that need to discover Nexez pages, read structured seller context, validate checkout, start an approved checkout handoff, or negotiate with a seller.

```bash
python -m pip install nexez-agent-sdk
```

```python
from nexez_agent_sdk import create_client

nexez = create_client(buyer_agent="example-python-agent")

matches = nexez.search(
    "book a strategy session next week",
    location="Chicago, IL",
    limit=5,
)

first = matches["results"][0] if matches["results"] else None
if not first or not first.get("offer"):
    raise RuntimeError("No actionable Nexez offer was found.")

page = nexez.get_agent_page(first["page"]["slug"])
offer_key = first["offer"]["key"]
if not any(offer.get("key") == offer_key for offer in page.get("offers", [])):
    raise RuntimeError("The selected offer is no longer available.")

validation = nexez.validate_checkout(
    slug=first["page"]["slug"],
    offer=offer_key,
    query="Buyer wants a strategy session next week.",
)
```

Side-effecting calls require a separate, explicit approval flag. Forward the dry-run token and use one stable retry key for that exact action:

```python
checkout = nexez.start_checkout(
    slug=first["page"]["slug"],
    offer=offer_key,
    query="Buyer wants a strategy session next week.",
    approval_token=validation.get("approvalToken"),
    user_approved=True,
    idempotency_key="buyer-order-1234567890",
)
```

## API

- `create_client(base_url=..., buyer_agent=..., timeout=..., transport=...)` - create a client. Defaults to `https://nexez.app`.
- `search_nexez(query, **options)` - search published agent pages by buyer intent, category, industry, readiness/trust, verification, checkout/negotiation capability, price band, and text location. `lat`/`lng` are context only.
- `browse_directory(**options)` - browse published pages by category, minimum readiness, query, and location.
- `get_agent_page(slug, **options)` - fetch `/{slug}/agent.json`.
- `validate_checkout(payload=None, **kwargs)` - dry-run checkout through `/api/checkout`.
- `start_checkout(payload=None, user_approved=True, **kwargs)` - start checkout only after explicit buyer approval.
- `validate_negotiation(payload=None, **kwargs)` - dry-run proposal validation through `/api/negotiations`.
- `submit_negotiation(payload=None, user_approved=True, **kwargs)` - submit a buyer proposal after explicit user approval.
- `get_negotiation_status(negotiation_id, status_token, **options)` - safely poll an asynchronous negotiation.
- `wait_for_negotiation_decision(negotiation_id, status_token, timeout=30, poll_interval=2, **options)` - poll until `decisionPending` is false, with a hard five-minute maximum.

Client methods accept Pythonic `snake_case` aliases for API fields:

- `buyer_agent` -> `buyerAgent`
- `buyer_email` -> `buyerEmail`
- `buyer_name` -> `buyerName`
- `buyer_reference` -> `buyerReference`
- `requested_terms` -> `requestedTerms`
- `negotiation_id` -> `negotiationId`
- `status_token` -> `statusToken`
- `approval_token` -> `approvalToken`

`user_approved` is a local SDK safety gate. It is stripped before the request and is never sent to Nexez. The package also exports `TypedDict` contracts for checkout, negotiation, search, manifests, and status responses.

Custom `base_url` values may include a deployment path prefix, such as `https://example.test/nexez`; the SDK preserves that prefix for every request. Only `http` and `https` URLs without credentials, query strings, or fragments are accepted.

## Safety

Use `validate_checkout` or `validate_negotiation` before side-effecting actions. `start_checkout` and `submit_negotiation` reject calls unless their keyword-only `user_approved=True` gate is present and always send `dryRun: false`. An approval-like value embedded in a payload does not satisfy this gate. Approval tokens bind validated commercial terms while allowing buyer identity to remain local until consent.

Treat `statusToken` as a bearer credential: never log it or show it in buyer-facing output. SDK-generated API, transport, and protocol errors redact the token from their public `url` attribute. `wait_for_negotiation_decision` raises `TimeoutError` when its bounded wait expires.

## Errors

- `NexezApiError` - the API returned a non-2xx status; inspect `status` and `body`.
- `NexezTransportError` - DNS, connection, timeout, or custom-transport failure.
- `NexezProtocolError` - a 2xx response was not a JSON object or violated the status contract.

## Tests

```bash
python -m unittest discover -s sdk/python/tests
```

## License

The SDK source in this package is licensed under the MIT License. Use of Nexez hosted APIs and services is governed separately by the [Nexez Terms of Service](https://nexez.ai/terms). The MIT License does not grant rights to Nexez trademarks, logos, hosted services, or service data.
