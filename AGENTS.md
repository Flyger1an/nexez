<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# House style

Do not use em dashes. Not in code, comments, copy, docs, commit messages, or PR
bodies. Use a comma, a colon, parentheses, or a spaced hyphen instead. The one
exception is a standalone quoted em dash used as the "no value" placeholder in a
data cell, which is a typographic symbol rather than prose.

`npm run lint:em-dash` enforces this and runs in CI. Run it before opening a PR.

# Session preflight

Run both checks before starting work, and report the result in the first reply.
Both failure modes are silent, and both have surfaced halfway through a task
after the context budget was already spent.

**1. Repository access.**

```
git clone https://github.com/nexez-ai/nexez.git && cd nexez && git push --dry-run
```

This repo is private. The git proxy only injects a credential for repositories
in the session's authorized source set. If either command fails with "not in
this session's authorized repository set", say so immediately.

Without it, everything routes through the GitHub API: no local typecheck, no
test run, no build, no rendered output to inspect, and pushes that cannot be
diffed against a validated tree before they land. That mode has already
produced a publish date that was wrong for three days across two sessions and
one merge, escape sequences silently decoded in committed source, and
throwaway probe commits in main's history.

One-time fix, owner only: approve the Anthropic GitHub app at the `nexez-ai`
org level, then add `nexez-ai/nexez` to the session's sources in the desktop
app. Private org repos do not appear in the picker until the org approval
exists, which is why this has stalled before.

**2. Workflow write access.**

The GitHub App install lacks the `workflows` permission on selected-repository
installs, so any push touching `.github/workflows/` returns a hard 403. Check
before planning work that needs one, not after writing it. When blocked, stage
the file at `/mnt/user-data/outputs/` and point the owner at
`github.com/nexez-ai/nexez/upload/<branch>/.github/workflows`.

One-time fix: grant the `workflows` permission, or move the install from
selected repositories to all repositories.

# Verification standard

Report only what was actually verified, and name any gate that could not be
run along with the reason. Do not let a partial run imply a full one.

Two gates fail in a sandboxed container for environmental reasons and belong
to CI: `lint:dead` (knip exhausts memory inside oxc-parser, and fails the same
way on a pristine checkout) and `npm run build` (cannot reach Google Fonts).
Say that explicitly rather than reporting the suite as green.

Trust GitHub API timestamps over the container clock. The clock has been stale
before, and an article shipped with a publish date three days wrong because a
session trusted it.

When pushing through the GitHub API rather than git, diff the pushed branch
against the locally validated tree before opening the PR. The API decodes
unicode escape sequences (backslash-u followed by four hex digits) in file
content, which has silently altered committed source, and truncation in a
large payload fails silently too.
