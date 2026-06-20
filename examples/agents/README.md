# Nexez Agent Examples

Copy-paste workflows for buyer agents and agent builders.

## Flows

- Search by buyer intent.
- Fetch the selected page's `agent.json`.
- Dry-run checkout or negotiation.
- Ask the buyer for approval before side effects.
- Submit a negotiation only after approval.
- Poll `statusUrl` with a normal HTTP GET when a negotiation is created.

## Python

Install the local SDK source while developing:

```bash
python -m pip install -e sdk/python
```

Run:

```bash
python examples/agents/python/find_and_validate.py
python examples/agents/python/submit_negotiation.py
```

## TypeScript

Install the published SDK:

```bash
npm install @nexez/agent-sdk
```

Run the examples inside your own TypeScript runtime or adapt them into an agent tool.
