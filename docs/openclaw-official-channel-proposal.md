# Official External Plugin Review: `@nexez/openclaw-nexez`

## Request

We are requesting an official external plugin review for `@nexez/openclaw-nexez`. We are not asking for the plugin to be bundled into OpenClaw core. We are asking whether the OpenClaw maintainers would sponsor or approve the existing ClawHub package for the official channel.

## What Nexez Adds

Nexez is an agent-readable marketplace and transaction layer. The plugin lets an OpenClaw agent:

- search structured Nexez offers by buyer intent and location
- inspect a seller's agent-readable page manifest
- browse the directory with category and readiness filters
- dry-run checkout and negotiation handoffs
- start checkout or submit a negotiation only after explicit user approval

The package exposes exactly seven tools:

- `nexez_search`
- `nexez_get_page`
- `nexez_directory`
- `nexez_validate_checkout`
- `nexez_validate_negotiation`
- `nexez_start_checkout`
- `nexez_submit_negotiation`

## Safety Model

- Public discovery does not require credentials.
- Validation tools force non-mutating dry runs.
- Checkout and negotiation tools require the exact boolean `userApproved: true` after explicit approval.
- Approval metadata is never forwarded to Nexez APIs.
- Fixed-price offers are normalized away from negotiation and toward checkout.
- Invalid pages and API failures remain typed errors instead of being presented as successful results.
- Production gauntlets never invoke mutation-capable paths.

## Release And Verification Evidence

- ClawHub package: `@nexez/openclaw-nexez` `0.1.4`
- npm package: `@nexez/openclaw-nexez` `0.1.4`
- Install: `openclaw plugins install clawhub:@nexez/openclaw-nexez`
- OpenClaw compatibility: `>=2026.6.8 <2027.0.0`
- Built and validated with OpenClaw `2026.7.1`
- ClawHub security scan: clean
- ClawHub source provenance: `Flyger1an/nexez` at an exact commit
- Published artifact: seven runtime-only files with an npm integrity digest and SHA-256 digest
- CI validates the minimum and current supported OpenClaw versions
- Contract gauntlet: 13 checks across all seven tools
- Real gateway gauntlet: three checks through a loopback OpenClaw gateway
- Production gauntlet: 12 non-mutating checks against `https://nexez.app`
- Clean-install gauntlet: release candidate, npm, and ClawHub channels

The companion `nexez-agent-discovery` skill is separately published on ClawHub. Version `0.1.2` has a generated registry card, a clean security verdict, and zero SkillSpector findings.

## Maintenance Commitment

Nexez will:

- test against the minimum supported and current OpenClaw releases
- keep source, package metadata, compatibility ranges, and generated artifacts aligned
- preserve explicit approval gates for seller-facing or payment-related actions
- respond to OpenClaw compatibility regressions and security reports
- publish through a source-pinned GitHub Actions workflow using ClawHub trusted publishing
- keep the public package limited to runtime-required files

## Why Official Recognition Helps

Agent commerce needs a trustworthy boundary between discovery and side effects. Official external recognition would make this capability easier to discover while preserving OpenClaw's security expectations, user approval model, and plugin-first architecture.

We welcome a maintainer review and will address any additional compatibility, provenance, security, documentation, or ownership requirements needed for official-channel consideration.
