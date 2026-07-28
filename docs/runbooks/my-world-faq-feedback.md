# My World FAQ feedback delivery

Status: **disabled**

The repository contains no approved anonymous-feedback delivery integration.
`FAQ_FEEDBACK_ENABLED` must remain absent or false until every gate in this
runbook is completed. Hiding the browser form is not an adequate control; the
server endpoint must fail closed independently.

## Phase 0 decision record

| Decision | Current state |
|---|---|
| Team-owned review destination | Team check — not supplied |
| Named reviewer group and owner | Team check — not supplied |
| Existing approved internal submission service | Not found in this repository; organisation check required |
| Approved delivery processor | Team check — not selected |
| Decision owner and deadline | Team check — not supplied |
| Production sender/recipient allowlist | Team check — not supplied |
| Preview/test sink | Team check — not supplied |
| WAF rule and owner | Team check — not configured in repository |
| Retention, deletion, access, and incident posture | Team check — not supplied |

If no delivery path satisfies the gates below, do not enable the form and do
not substitute a fake success state.

## Processor approval gate

Record and approve:

- processor/service name and accountable owner;
- DPA and data-residency decision;
- message, dashboard, log, bounce, forwarding, reply, and backup retention;
- deletion-request process and automatic retention enforcement;
- scoped credentials, rotation, revocation, and environment separation;
- fixed production sender/recipient and non-production sink;
- timeout, retry, acceptance, and bounce/failure behavior;
- idempotency scope, TTL, and same-key/changed-payload behavior;
- sandbox/test behavior and provider outage response.

## Deployment enablement gate

Before setting `FAQ_FEEDBACK_ENABLED=true` in an environment:

1. confirm the environment-specific processor credential and destination match;
2. attach evidence for the exact Vercel project/environment WAF rule, route,
   threshold/window, identity basis, rule ID/export, owner, monitoring, and
   rollback;
3. verify the server returns no-store `503` while the flag is disabled;
4. run an end-to-end canary and confirm arrival in the named review destination;
5. verify bounce/failure alerts, quota monitoring, and reviewer access;
6. record the next canary deadline and the failure/overdue threshold that
   disables the endpoint again.

## Reviewer safety

Submission content is untrusted:

- no submitted value may enter sender, recipient, subject, or mail headers;
- send plain text only under an `UNTRUSTED USER SUBMISSION` banner;
- remove or visibly encode bidi/control characters;
- defang submitted URLs so clients do not auto-link them;
- use the organisation-approved safe-link check before reconstructing a URL;
- never authenticate through a submitted link;
- do not copy question text, contact details, source URLs, provider bodies,
  idempotency values, payload digests, cookies, or raw errors into application
  logs.

## Reader disclosure

When enabled, the form must say:

- no account or contact details are required;
- hosting, WAF, and the selected delivery processor still process the request;
- who reviews submissions and for what purpose;
- the access/retention/deletion posture;
- adding contact details makes the submission identifiable to reviewers;
- an individual reply is impossible without contact details;
- provider acceptance means “accepted for delivery,” not mailbox receipt,
  reading, or resolution.

## Lifecycle

The page owner must publish a last-reviewed date and next review/expiry date.
A missed review, ownership loss, material product change, or leadership
decision to pause/stop must disable submissions or archive the page according
to a recorded decision. The exact-link page must not remain an unmanaged inbox.
