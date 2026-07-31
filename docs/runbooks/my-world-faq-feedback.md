# My World FAQ feedback delivery

Status: **database inbox implemented; migration required**

The FAQ stores submissions in the existing project Postgres database. New
submissions appear below the form and in the password-protected editor inbox.
The form appears only after the server confirms that the feedback table exists.

## Phase 0 decision record

| Decision | Current state |
|---|---|
| Team-owned review destination | Password-protected FAQ editor inbox |
| Named reviewer group and owner | FAQ editors; page owner still requires team confirmation |
| Existing approved internal submission service | Existing project Postgres database |
| Approved delivery processor | No separate delivery processor |
| Decision owner and deadline | Team check — not supplied |
| Production sender/recipient allowlist | Team check — not supplied |
| Preview/test sink | Environment-specific project database |
| WAF rule and owner | Global database ceiling of 60 submissions per hour; production WAF remains a team check |
| Retention, deletion, access, and incident posture | 90-day opportunistic deletion; public read; editor inbox; submitting-browser removal |

The server stores the selected type, message, creation time and a SHA-256
digest of a random removal key. It does not store a name, email, IP address,
user agent or browser fingerprint. The unhashed removal key stays in the
submitting browser's local storage and is sent only when that browser removes
its own submission.

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
- submissions appear publicly without a name;
- hosting and the database still process the request;
- the team reviews submissions to improve the page and inform the pilot decision;
- the access/retention/deletion posture;
- adding contact details makes the submission identifiable to reviewers;
- an individual reply is impossible without contact details;
- removal works only while the private key remains in the submitting browser.

## Lifecycle

The page owner must publish a last-reviewed date and next review/expiry date.
A missed review, ownership loss, material product change, or leadership
decision to pause/stop must disable submissions or archive the page according
to a recorded decision. The exact-link page must not remain an unmanaged inbox.
