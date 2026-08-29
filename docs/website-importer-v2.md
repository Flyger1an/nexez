# Website Importer V2

## Objective

Turn the website importer into an evidence-first migration and synchronization engine. The importer must never present generated merchant facts as detected facts, and it must preserve a reviewable chain from every imported value to its source.

## Architecture

The target pipeline is:

1. Deterministic discovery
2. Deterministic evidence extraction
3. Constrained AI reconciliation
4. Deterministic post-AI validation
5. Merchant review
6. Safe persistence and future sync

AI receives a bounded evidence bundle. It does not browse independently and it cannot promote an unsupported value into a detected fact.

## Passes

### Pass 1: Evidence trust foundation

- Preserve the exact source URL in cache identity.
- Keep detected, inferred, and suggested information separate.
- Remove fabricated fallback offers from detected results.
- Calibrate confidence by evidence source and completeness.
- Cap upstream response bodies.
- Pin production scanner connections to validated public DNS results.
- Limit expensive import requests per authenticated user.
- Fetch robots policy once per import.
- Balance common paths with relevant sitemap discoveries.

Acceptance gate: targeted importer, route, security, review UI, and scanner regressions pass.

### Pass 2: Intelligent crawl planner

- Parse sitemap indexes and robots sitemap declarations.
- Rank internal navigation and commerce links.
- Normalize canonical URLs and remove duplicate content.
- Detect site platforms and route to native adapters where possible.
- Detect when static HTML is insufficient and record that state for a future rendered-page adapter.
- Record skipped pages and crawl reasons.

Acceptance gate: crawl-planner fixtures cover static, nested sitemap, redirected, duplicate, blocked, and JavaScript-shell sites.

### Pass 3: Rich evidence extraction

- Replace isolated line matching with HTML-structure-aware offer cards and heading windows.
- Expand schema.org support for Product, Service, Offer, AggregateOffer, LocalBusiness, Organization, FAQPage, and nested graphs.
- Capture currencies, pricing models, variants, availability, locations, hours, contacts, and action links.
- Distinguish products from services.
- Attach source URL, source text, method, observed time, and confidence to every field.

Acceptance gate: deterministic fixture precision and recall meet the benchmark thresholds with zero unsupported facts.

### Pass 4: AI reconciliation and review

- Give AI evidence IDs instead of unrestricted page prose.
- Require citations for every inferred value.
- Reject AI values that cannot be traced to supplied evidence.
- Show detected, inferred, suggested, and owner-confirmed states in review.
- Add field-level reanalysis diffs and preserve owner-confirmed values.

Acceptance gate: adversarial AI-output tests prove unsupported values cannot reach the draft as facts.

### Pass 5: Bounded execution and measurement

- Keep synchronous imports within explicit page, byte, and time limits.
- Retry transient upstream failures once without retrying permanent failures.
- Version cache entries by importer release and preserve a source fingerprint in telemetry.
- Record latency, pages considered, pages used, extraction methods, skipped pages, and source fingerprints.
- Add benchmark certification to the release process.

Acceptance gate: timeout, retry, cache, concurrency, and telemetry tests pass.

Resumable background jobs and durable cross-instance caching remain a future scale step. They are not required for the current bounded importer and are not represented as complete.

## Twelve-site release benchmark

The branch cannot ship unless every sample scores at least 8.0 out of 10. Any fabricated merchant fact is an automatic failure.

Each sample receives:

- 1 point: business identity
- 2 points: offer precision and coverage
- 1 point: pricing fidelity
- 1 point: action-link fidelity
- 1 point: product and service classification
- 1 point: location, availability, or operating detail fidelity
- 1 point: evidence traceability
- 1 point: safe handling of missing or ambiguous facts
- 1 point: review-ready output with no fabricated facts

The public-web sample set includes local service, professional service, appointment software, WordPress product, multi-location software, marketplace pricing, Shopify catalog, JavaScript-heavy pricing, structured local cleaning, repeated destination plans, and thin or ambiguous sites. Nested sitemap, duplicate-page, redirect, robots, card integrity, and hostile-output cases are covered by controlled deterministic fixtures.

### Certified result

The locked release benchmark scored 9.53 out of 10 across twelve public websites. Every individual sample scored at least 8.6, and no sample triggered the fabricated-fact automatic failure:

- Saulify: 9.0
- Command Staff: 10
- Booksimpl: 8.6
- BookingPress: 10
- Vertex: 10
- Local Gem: 9.67
- Allbirds: 9.25
- Acuity Scheduling: 10
- Linear: 9
- Kismet Pros: 9.07
- Wirect: 9.75
- Example.com: 10

The benchmark is executable with `RUN_LIVE_IMPORTER_BENCHMARK=1 REPORT_IMPORTER_BENCHMARK=1 npx vitest run lib/__tests__/importer-live-benchmark.test.ts`.

## Release rule

Do not push or open a pull request until:

1. Every pass-specific gate completed so far is green.
2. Every sample in the final twelve-site benchmark scores at least 8.0.
3. No sample contains a fabricated detected fact.
4. The final diff passes typecheck, lint, em-dash lint, targeted tests, and the full feasible test suite.
