This is a [Next.js](https://nextjs.org) project for Nexez — AI-optimized agent pages for services & products.

**Tech (lean MVP):** Next.js 16 (App Router), React 19, Supabase (auth + Postgres with RLS), Stripe (checkout + billing), Tailwind, Recharts, react-hook-form + zod patterns, dnd-kit (future), Lucide icons.

**Data model:** Simple flat `public.pages` table (Supabase) + `checkout_events`. JSONB for offers/services/faqs. No Prisma (deprecated & removed — see prior schema in git history if needed for future normalized refactor).

See the full MVP vision in conversation history for the 12-screen breakdown. The implementation is already very advanced.

## Current MVP Status (post 1-7 autonomous build session)
All 12 core screens are functional and polished. Major autonomous work completed:
- Real Stripe catalog import (price/product IDs → offer lines)
- Strong local AI optimization helpers for agent copy (no LLM key required)
- Stripe Billing Portal + usage vs plan hints
- Custom domain field + DNS guidance + embed snippet (data path + migration ready)
- Prisma fully removed (dead weight cleaned)
- Simulator, analytics, directory, public pages, builder/editor all deepened
- Build clean, new API routes added, many small agent-friendly improvements

Next natural user-driven steps: real Calendly OAuth, LLM-powered rewrites, production custom domain verification, plan enforcement middleware, tests.

Run `npm run dev` and create your first agent page.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
