# Nexez Buyer plugin

Nexez Buyer helps ChatGPT, Codex, and Claude find published Nexez offers, compare candidates, and validate one exact checkout or negotiation before a buyer chooses a next step.

This is version `0.1.0`. It deliberately stops before any action that moves money, creates an order, reserves inventory, submits negotiation terms, or contacts a seller.

## The beginner mental model

A useful AI plugin has two layers:

1. Skills teach the assistant how to reason through a task, which tools to use, and where to stop.
2. MCP gives the assistant controlled access to live Nexez data and dry-run validation.

The same three skills are shared by ChatGPT, Codex, and Claude. The two manifest folders contain the small amount of platform-specific packaging each ecosystem needs.

## What is included

| Component | Purpose |
| --- | --- |
| `.codex-plugin/plugin.json` | ChatGPT and Codex package metadata |
| `.claude-plugin/plugin.json` | Claude Code package metadata |
| `.mcp.json` | Connection to the public Nexez MCP endpoint |
| `skills/find-offers` | Search and directory browsing workflow |
| `skills/compare-offers` | Evidence-based comparison workflow |
| `skills/validate-purchase` | Checkout and negotiation dry-run workflow |
| `evals/cases.json` | Stable scenarios for checking routing and safety |

The MCP server is available at `https://nexez.app/mcp`. Version 0.1 uses these tools:

- `nexez_search`
- `nexez_directory`
- `nexez_get_page`
- `nexez_validate_checkout`
- `nexez_validate_negotiation`

No API key is required for these public tools.

The endpoint supports the stateless MCP `2026-07-28` protocol and the 2025-era handshake used by clients that have not opted into the new protocol yet. All five tools publish explicit read-only, non-destructive annotations.

## Safety boundary

The MCP surface exposes reads and forced dry runs only. Checkout validation never charges, and negotiation validation never submits. If a validation response includes handoff information, the skill preserves it for review but does not execute it.

The assistant must say: `This was a dry run. Nothing was charged or submitted.`

## Try it with Claude Code

With Claude Code installed, start a local development session from the repository root:

```bash
claude --plugin-dir ./plugins/nexez-buyer
```

Then try:

```text
Find a photographer near Austin on Nexez.
```

Validate the package before distributing it:

```bash
claude plugin validate ./plugins/nexez-buyer
```

The `.mcp.json` file is discovered automatically by Claude Code.

## Try it with ChatGPT

ChatGPT first requires the remote MCP server to be registered in developer mode for the account or workspace that will test it:

1. Enable developer mode in ChatGPT.
2. Create an app or connector that points to `https://nexez.app/mcp`.
3. Test the five tools and their schemas.
4. Record the account-generated connection ID, which starts with `plugin_asdk_app`.
5. Add that real ID to a root `.app.json`, then add `"apps": "./.app.json"` to `.codex-plugin/plugin.json`.

The repository does not contain a fake connection ID. That final binding is account-specific and is intentionally deferred until ChatGPT creates the real value.

## Example prompts

- Find an agent-ready web designer for a five-page site.
- Show me negotiable professional services near Chicago.
- Compare these offers for price, timing, and checkout readiness.
- Validate this exact offer before I continue to checkout.
- Check whether my budget and timeline fit the seller's negotiation rules.

## Release checklist

1. Validate both plugin manifests and all three skills.
2. Confirm `https://nexez.app/mcp` initializes and lists exactly the expected public tools.
3. Run the cases in `evals/cases.json` and preserve the results.
4. Test locally with Claude Code.
5. Register and test the MCP connection in ChatGPT developer mode.
6. Add the real ChatGPT connection ID without changing the safety boundary.
7. Review the public privacy policy, terms, support path, and store listing copy.
8. Submit to each marketplace only after the owner approves the final listing.
