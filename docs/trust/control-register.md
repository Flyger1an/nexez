# Security and privacy control register

This catalog is the operating index. Replace `Unassigned` with named owners in the private
operations system. Links here should point to procedures; actual evidence should remain private.

| ID | Control | Owner | Frequency | Evidence | Initial state |
| --- | --- | --- | --- | --- | --- |
| GOV-01 | Policies are approved and reviewed | Executive approver | Annual/change | Dated approval and revision record | Unassigned |
| GOV-02 | Security risks and exceptions are tracked to closure | Security Owner | Quarterly | Risk register and approvals | Unassigned |
| IAM-01 | MFA is enabled for critical systems | System Owners | Continuous/quarterly review | Provider export or screenshots | Unassigned |
| IAM-02 | Access is approved and least-privileged | System Owners | Each change | Access request/approval | Unassigned |
| IAM-03 | Privileged and general access are periodically reviewed | Security Owner | Quarterly/semiannual | Signed access review | Unassigned |
| IAM-04 | Departed users are removed promptly | Security Owner | Each departure | Offboarding checklist and provider evidence | Unassigned |
| SDLC-01 | Production changes receive review and automated checks | Engineering Owner | Each change | PR, CI, deployment record | Partially implemented |
| SDLC-02 | Emergency changes are documented and retrospectively reviewed | Engineering Owner | Each emergency | Change record and follow-up | Unassigned |
| SDLC-03 | Secrets are excluded from code and rotated after exposure | Engineering Owner | Continuous | Scan results and rotation record | Partially implemented |
| APP-01 | Authorization is enforced server-side and at the data layer | Engineering Owner | Each change | Tests, migrations, review | Partially implemented |
| APP-02 | Consequential agent actions require approval and idempotency | Engineering Owner | Each change/release | Safety and certification tests | Implemented; verify operation |
| LOG-01 | Security-relevant events are logged without sensitive values | Engineering Owner | Continuous/quarterly review | Log samples and review | Unassigned |
| LOG-02 | Critical alerts are routed and investigated | Security Owner | Continuous | Alert configuration and cases | Unassigned |
| VUL-01 | Dependencies and code are scanned and findings triaged | Engineering Owner | CI/monthly | Scan and triage results | Unassigned |
| VUL-02 | Vulnerabilities meet remediation targets or approved exceptions | Security Owner | Monthly | Tickets and exception approvals | Unassigned |
| BCM-01 | Critical data is backed up with defined RPO/RTO | System Owners | Continuous/annual review | Configuration and objectives | Unassigned |
| BCM-02 | Restore and incident tabletop exercises succeed | Security Owner | Annual | Exercise report and actions | Unassigned |
| VEN-01 | New vendors receive risk and privacy review | Privacy Owner | Before use | Completed vendor assessment | Unassigned |
| VEN-02 | Critical vendors are reassessed | Privacy Owner | Annual/change | Review and assurance documents | Unassigned |
| PRI-01 | Processing activities and retention are inventoried | Privacy Owner | Quarterly/change | Approved data register | Unassigned |
| PRI-02 | Privacy requests are authenticated and completed on time | Privacy Owner | Each request | Request case without excess personal data | Unassigned |
| PRI-03 | Scheduled deletion is performed and sampled | System Owners | Per schedule/semiannual test | Deletion job and sample | Unassigned |
| PRI-04 | High-risk/new processing receives a privacy assessment | Privacy Owner | Before launch | Approved assessment | Unassigned |
| HR-01 | Personnel sign commitments and complete training | Executive approver | Onboarding/annual | Agreements and training record | Unassigned |
| IR-01 | Incidents follow the response procedure and preserve a timeline | Incident Commander | Each incident | Incident record and retrospective | Unassigned |

## Exception record fields

Every exception must include control ID, affected system, reason, risk, compensating controls,
approver, owner, approval date, expiry date, and remediation plan. Expired exceptions are failures,
not automatically renewed approvals.
