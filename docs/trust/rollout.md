# Trust program rollout

This is the implementation path for the security and privacy foundation. The goal is to make
the documented controls true, repeatable, and evidenced before pursuing an external audit.

## 1. Name accountable people

Create one private ownership record and assign a person, not a team, to each role in the framework.
At an early-stage company, the founder may be Executive Approver, Security Owner, and Privacy
Owner, while the lead engineer owns systems. That is acceptable initially if approvals and
reviews remain explicit.

Record for each role: person, backup, effective date, systems owned, decision authority, and
review date. Do not put employee personal information in the public repository.

## 2. Establish a private system of record

Create access-controlled locations for:

- policies and dated approvals;
- control evidence by year and control ID;
- access inventory and completed access reviews;
- security risks and time-bounded exceptions;
- vendor contracts, DPAs, assessments, and assurance reports;
- incidents, exercises, and corrective actions;
- privacy requests and response deadlines;
- training and personnel lifecycle evidence.

A simple initial evidence structure is:

```text
trust-program/
  2026/
    GOV-01-policy-approval/
    IAM-01-mfa/
    IAM-03-access-reviews/
    SDLC-01-change-management/
    LOG-02-alerts/
    VUL-01-vulnerability-management/
    BCM-02-recovery-tests/
    VEN-01-vendor-reviews/
    PRI-01-data-inventory/
    HR-01-training/
    IR-01-incidents-and-exercises/
```

Each evidence item should show the control ID, date or period, scope/population, performer,
reviewer, result, exceptions, and remediation. Store links to source evidence when possible
instead of screenshots that become stale.

## 3. Verify the production inventory

Do a screen-shared walkthrough of every production provider and complete the data and vendor
registers from observed configuration rather than source-code assumptions.

Start with:

- Vercel projects, domains, deployments, environment variables, team access, and logs;
- Supabase organizations/projects, Auth, tables, Storage, backups, regions, service keys,
  database roles, and access;
- Stripe account/Connect configuration, products, Billing, webhooks, API keys, team access,
  and PCI responsibility;
- GitHub repository access, branch protection, Actions secrets, environments, and dependencies;
- email, monitoring, support, analytics, DNS/domain, calendar, and integration providers;
- employee devices, password manager, communication, and identity systems.

For each system, record owner, administrators, data, region, authentication method, MFA state,
backup/recovery responsibility, log availability, contract, and exit/deletion method.

## 4. Close the first control gaps

Work in this order because it reduces immediate account-takeover and data-loss risk:

1. Enforce MFA and remove unknown, shared, dormant, or excessive privileged access.
2. Confirm production secrets are only in approved stores; rotate any copied into unsafe places.
3. Verify production branch protection, required CI checks, and restricted deploy authority.
4. Configure security/error/payment alerts with a tested destination and backup recipient.
5. Confirm backup configuration and perform a documented isolated restore test.
6. Enable dependency and secret scanning; open tickets for findings using the remediation targets.
7. Review critical vendor terms, DPAs, breach notice, subprocessors, and deletion procedures.
8. Verify privacy notices against actual data use, model use, cookies, vendors, and retention.
9. Exercise account export/deletion and confirm downstream vendor and backup behavior.
10. Run an incident tabletop and close the resulting actions.

## 5. Turn controls into recurring work

Put every periodic activity from the framework into the company task/calendar system. Each task
must have an owner, due date, checklist link, evidence destination, escalation path, and backup.
Recurring work should create a new completed record rather than overwrite the prior record.

Recommended starting schedule:

| When | Activity |
| --- | --- |
| First Monday monthly | Vulnerability, dependency, risk, and exception review |
| First week each quarter | Privileged-access and critical-vendor change review |
| January and July | Full access review and retention/deletion sample |
| Annually | Policy approval, training, vendor reassessment, restore test, and incident tabletop |
| Every release | Reviewed change, CI evidence, deployment evidence, and release certification |
| Every personnel/vendor/system change | Trigger the corresponding checklist immediately |

## 6. Measure whether the program operates

Track a small set of honest metrics:

- percentage of critical systems with verified MFA and named owners;
- access reviews completed on time and access items removed;
- open vulnerabilities by severity and age;
- critical vendors reviewed on time;
- backup restore success and achieved recovery time/point;
- incidents by severity, detection source, containment time, and overdue corrective actions;
- privacy requests completed on time;
- control exceptions and overdue expirations;
- security training completion;
- releases with a passing durable certificate.

Metrics are decision tools, not proof by themselves. A green dashboard must link to underlying
evidence and must not hide exceptions.

## 7. Prepare for external readiness review

After at least one full cycle of the recurring controls:

- map the control register to SOC 2 Security criteria;
- identify control/design gaps and unsupported policy claims;
- define the exact systems, entities, locations, people, and vendors in audit scope;
- have counsel review privacy, payments, marketplace, and contractual obligations;
- complete a readiness assessment before choosing the formal audit period;
- pursue Type I when buyer demand warrants a point-in-time report, then Type II after controls
  have operated consistently for the selected observation period.

Do not manufacture or backdate evidence. A documented gap with a remediation plan is more useful
than unreliable evidence and protects the credibility of a future assessment.

## Two-week kickoff checklist

### Week 1

- [ ] Name owners and approve the framework.
- [ ] Create the private evidence, risk, incident, privacy-request, and vendor systems.
- [ ] Export the current user/admin lists for every critical provider.
- [ ] Complete the first privileged-access review and enforce MFA.
- [ ] Populate critical rows in the data and vendor registers.
- [ ] Confirm alert destinations and incident contact paths.

### Week 2

- [ ] Verify branch/deployment protection and secret storage.
- [ ] Review Supabase backup configuration and schedule a restore test.
- [ ] Triage dependency/security scanning results.
- [ ] Test account export and deletion in a non-production-safe manner.
- [ ] Review Stripe/Connect PCI responsibilities and critical vendor terms.
- [ ] Run a 60-minute credential-compromise tabletop.
- [ ] Assign every finding an owner and due date; schedule recurring controls.
