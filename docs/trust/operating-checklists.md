# Trust program operating checklists

Store completed copies in the private evidence system. Each copy needs an owner, date, scope,
result, reviewer, exceptions, and links to remediation. Never paste passwords, tokens, card data,
or unnecessary personal data into a checklist.

## Personnel onboarding

- [ ] Identity and role confirmed; start date recorded.
- [ ] Confidentiality, acceptable-use, and relevant employment/contract terms complete.
- [ ] Security and privacy training complete.
- [ ] System Owner approved each requested system and role.
- [ ] Named accounts created with least privilege and MFA.
- [ ] Password manager and approved device/security configuration established.
- [ ] Production, payment, and Restricted-data access separately justified.
- [ ] Personnel acknowledged incident-reporting and data-handling requirements.
- [ ] Completion reviewed and evidence stored.

## Role change

- [ ] New responsibilities and effective date recorded.
- [ ] New access approved before grant.
- [ ] Access no longer required removed promptly.
- [ ] Privileged access and segregation conflicts reviewed.
- [ ] Relevant training completed and evidence stored.

## Personnel offboarding

- [ ] Departure type and exact termination time confirmed privately.
- [ ] Interactive sessions revoked and identity/email access disabled.
- [ ] Source control, deployment, database, payment, monitoring, support, and vendor access removed.
- [ ] Personal access tokens, SSH keys, app passwords, and owned service credentials revoked.
- [ ] Shared or potentially known secrets rotated using the risk of the role/departure.
- [ ] Company devices, files, and records returned or remotely secured through approved means.
- [ ] Ownership of repositories, alerts, integrations, and scheduled tasks transferred.
- [ ] System evidence reviewed against the access inventory; omissions remediated.
- [ ] Completion time and reviewer recorded.

## Periodic access review

- [ ] Scope includes every in-scope system and service identity.
- [ ] Current export obtained directly from each provider.
- [ ] Each identity, role, privilege, MFA state, and business owner reviewed.
- [ ] Dormant, duplicate, shared, departed, excessive, and unknown access investigated.
- [ ] Changes completed, not merely requested.
- [ ] Service identities have an active owner and documented purpose.
- [ ] Reviewer is independent from the access grant where practical.
- [ ] Review date, population, decisions, exceptions, and completion evidence stored.

## Privacy request

- [ ] Request received date, jurisdiction, request type, and response deadline recorded.
- [ ] Requester identity verified proportionately without collecting excessive new data.
- [ ] Applicable exceptions, legal holds, and controller/processor responsibilities assessed.
- [ ] Search covers production, vendors, logs, support systems, exports, and relevant backups.
- [ ] Third-party and other-person information protected before disclosure.
- [ ] Correction, deletion, restriction, portability, or opt-out propagated to applicable vendors.
- [ ] Response approved and delivered through a secure channel.
- [ ] Completion and any denial/extension rationale recorded without retaining excess request data.

## Vendor review

- [ ] Service, owner, data, permissions, regions, users, and criticality documented.
- [ ] Security controls and independent assurance reviewed proportionately.
- [ ] Privacy terms/DPA, subprocessors, transfers, retention, deletion, and AI/model use reviewed.
- [ ] Incident notification, availability, support, audit, and termination terms reviewed.
- [ ] Least data/access configuration selected and verified.
- [ ] Risks, compensating controls, approval, next review, and exit plan recorded.

## Backup restore test

- [ ] System, dataset, backup source, RPO, RTO, and test boundary approved.
- [ ] Test uses an isolated authorized destination and protects production personal data.
- [ ] Backup integrity and encryption/access controls confirmed.
- [ ] Restore completed and application/data integrity validated.
- [ ] Actual recovery point and elapsed recovery time compared with objectives.
- [ ] Temporary restore securely removed after evidence is captured.
- [ ] Failures have owners and due dates; retest scheduled.

## Annual program review

- [ ] Scope, architecture, data flows, products, regions, laws, contracts, and vendors reviewed.
- [ ] Policies and control register updated and approved.
- [ ] Data and vendor registers reconciled with actual systems.
- [ ] Training, access reviews, restore test, tabletop, vulnerabilities, incidents, privacy requests,
      vendor reviews, and exceptions sampled for completion.
- [ ] Metrics and recurring failures reviewed by the executive approver.
- [ ] Risks and remediation plan accepted with named owners and deadlines.
- [ ] Public privacy/security statements checked against verified practice.
