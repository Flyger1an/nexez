# Nexez Python Agent SDK

Dependency-free Python client for buyer agents and agent builders that need to discover Nexez pages, read structured seller context, validate checkout, or submit negotiation intent.

```bash
python -m pip install -e sdk/python
```

```python
from nexez_agent_sdk import create_client

nexez = create_client(buyer_agent="example-python-agent")

matches = nexez.search(
    "book a strategy session next week",
    location="Chicago, IL",
    limit=5,
)

first = matches["results"][0]
page = nexez.get_agent_page(first["page"]["slug"])

validation = nexez.validate_checkout(
    slug=first["page"]["slug"],
    offer=first["offer"]["key"] if first.get("offer") else "services-0",
    query="Buyer wants a strategy session next week.",
)
```

## API

- `create_client(**options)` - create a client. Defaults to `https://nexez.app`.
- `search_nexez(query, **options)` - search published agent pages by buyer intent.
- `get_agent_page(slug, **options)` - fetch `/{slug}/agent.json`.
- `validate_checkout(payload=None, **kwargs)` - dry-run checkout through `/api/checkout`.
- `validate_negotiation(payload=None, **kwargs)` - dry-run proposal validation through `/api/negotiations`.
- `submit_negotiation(payload=None, **kwargs)` - submit a buyer proposal after user approval.

Client methods accept Pythonic `snake_case` aliases for API fields:

- `buyer_agent` -> `buyerAgent`
- `buyer_email` -> `buyerEmail`
- `buyer_name` -> `buyerName`
- `buyer_reference` -> `buyerReference`
- `requested_terms` -> `requestedTerms`
- `negotiation_id` -> `negotiationId`
- `status_token` -> `statusToken`

## Safety

Use `validate_checkout` or `validate_negotiation` before side-effecting actions. Only call `submit_negotiation` after the buyer has approved the proposal details.

## Tests

```bash
python -m unittest discover -s sdk/python/tests
```
