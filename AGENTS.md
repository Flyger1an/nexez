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

