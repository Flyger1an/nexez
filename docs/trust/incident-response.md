# Security and privacy incident response

Security event: an observable occurrence that may be benign.<br>
Security incident: an event that threatens confidentiality, integrity, availability, privacy,
funds, or authorized operation and requires coordinated response.

## Report and activate

Personnel must immediately report suspected credential compromise, unauthorized access,
malware, data disclosure, payment abuse, agent-action abuse, service compromise, or material
availability loss through the private incident channel. Do not investigate using a compromised
account or discuss sensitive details in public tickets.

The Incident Commander opens a private record, assigns severity, records the initial facts and
times, names functional owners, and begins a chronological decision log.

## Severity

| Level | Typical impact | Response target |
| --- | --- | --- |
| SEV-1 Critical | Active compromise, Restricted-data exposure, stolen funds, systemic unauthorized actions, or broad outage | Immediate activation and executive notification |
| SEV-2 High | Confirmed limited compromise, material customer impact, or serious control failure | Activate as soon as possible, target within 1 hour |
| SEV-3 Medium | Contained event with limited impact and no known sensitive-data loss | Same business day |
| SEV-4 Low | Suspicious or minor event handled through normal operations | Triage within 2 business days |

These are operational targets, not legal notification deadlines.

## Response lifecycle

1. **Triage:** preserve the report, validate signals, identify affected systems/data/actors,
   assess whether the event is ongoing, and avoid destroying volatile evidence.
2. **Contain:** revoke sessions, disable accounts, rotate exposed secrets, block abusive paths,
   isolate affected components, or pause risky functionality. Prefer reversible measures.
3. **Investigate:** preserve provider logs and identifiers, construct a timeline, determine
   root cause and scope, and track confidence and unknowns separately from facts.
4. **Eradicate and recover:** remove the cause, patch, validate integrity, restore safely,
   monitor for recurrence, and obtain System Owner approval before normal operation.
5. **Notify and communicate:** Privacy Owner and counsel assess contractual, regulatory,
   insurer, law-enforcement, customer, seller, payment-provider, and public notifications.
   Only authorized communicators make external statements.
6. **Review:** within 10 business days of closure for SEV-1/2, record root cause, impact,
   response effectiveness, evidence gaps, corrective actions, owners, and due dates.

## Incident record

- incident ID, title, severity, status, commander, and participants;
- discovery, occurrence, containment, recovery, and closure times with time zone;
- reporter and detection source;
- affected systems, regions, vendors, data classes, people, transactions, and funds;
- known facts, hypotheses, decisions, and preserved evidence locations;
- credentials or keys rotated (identifiers only, never values);
- notification analysis and approvals;
- customer-facing statements and support instructions;
- root cause, lessons, corrective actions, owners, deadlines, and validation.

## Tabletop scenarios

Run at least annually and after major architecture changes. Rotate scenarios among leaked
Supabase service credentials, compromised deployment access, Stripe webhook manipulation,
seller-account takeover, prompt injection causing unauthorized agent actions, accidental log
exposure, and critical vendor outage. Record gaps and track them through remediation.
