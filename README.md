# Nexez

**Pages AI agents can actually book from.**

Nexez is the infrastructure layer for **agentic commerce**. Businesses create clean, structured agent-ready pages alongside their main website. AI agents (ChatGPT, Claude, Grok, Perplexity, etc.) can discover offers, negotiate, and complete bookings autonomously.

One source of truth. Two audiences: beautiful for humans, brutally structured for agents.

---

## ✨ Features

### Core
- **Agent-optimized pages** with JSON-LD, llms.txt, agent.json, MCP endpoint, and semantic HTML
- **Hybrid booking system**:
  - Fixed Pricing → instant direct booking
  - Negotiable services → smart rules + LLM-powered negotiation
- **Persistent negotiation links** – agents can continue conversations even when offline
- **Smart Rules Engine** – business owners define per-offer rules (price floors, notice periods, blackout dates, etc.)
- **AI Co-Pilot** – intelligent suggestions for offers, pricing, and agent optimization
- **Agent Simulator** – preview how different models interpret your page
- **Competitor Analyzer** – see how agents perceive any competitor website

### Analytics & Trust
- Real-time agent detection and traffic split
- Detailed analytics: agent visits, conversions, pipeline value, top queries
- Trust Score and verification system

### Payments & Monetization
- **Dual revenue model**:
  - Subscription plans: **Free**, **Launch**, **Pro**, **Scale**, **Enterprise** (contact sales)
  - Platform commission on every agent-driven transaction (configurable per plan)
- Stripe Connect (business is Merchant of Record) + automatic platform fee deduction
- Stripe Billing for subscriptions

### Technical
- Fully pluggable LLM engine (Gemini, Grok, Claude, OpenAI – swap with one env variable)
- Persistent state for all negotiations
- Supabase backend with clean schema
- Production-ready error handling, logging, and webhooks

---

## 🛠 Tech Stack

- **Frontend**: Next.js 16 (App Router) + Tailwind + shadcn/ui
- **Backend**: Next.js API routes + Supabase
- **Database**: Supabase (PostgreSQL)
- **Payments**: Stripe Connect + Stripe Billing
- **LLM Layer**: Pluggable (Gemini primary, with adapters for Grok, Claude, OpenAI)
- **Deployment**: Vercel

---

## 🚀 Quick Start

```bash
git clone https://github.com/yourusername/nexez.git
cd nexez
npm install
cp .env.example .env.local
# Fill in your Supabase, Stripe, and LLM keys
npm run dev
Visit http://localhost:3000 to start creating agent pages.

📋 How It Works

Connect your offers (Calendly, Stripe, Shopify, CSV, or manual)
Define rules per offer (pricing floors, availability, scope limits)
Publish – on Nexez subdomain or your own custom domain
Agents discover & negotiate – fixed offers book instantly, negotiable offers go through smart rules + LLM
Get paid – platform commission is automatically deducted, rest goes to you


💰 Revenue Model

Subscription: Free, Launch, Pro, Scale, Enterprise (contact sales for Enterprise)
Platform Commission: Applied to every successful agent-driven transaction (configurable per plan, including Free)
Business owners are the Merchant of Record for transactions


🛣 Roadmap

 Agent detection & analytics
 Negotiations inbox
 LLM pluggable architecture
 Full Smart Rules Engine + LLM auto-actions
 Persistent negotiation UI + structured JSON for agents
 Advanced escrow & dispute handling
 Marketplace directory of agent pages


🤝 Contributing
We welcome contributions! Please see CONTRIBUTING.md for guidelines.

📄 License
MIT © Nexez

Built with ❤️ for the agent economy
