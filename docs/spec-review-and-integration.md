**English** · [Português](spec-review-and-integration.pt.md)

# Spec: code review and integration with Clínica Fácil

Two parts, in this order. The tree is clean: the last commit is `8eca669`, the UX delivery.

## Part 1: code review, with fixes

Review the entire repo through the eyes of someone who will maintain the code. The baseline is the diff against the kit (the initial `adonis-web-kit` commit in the history) plus everything telemed. Compare against:

- **the kit's rules** (`CLAUDE.md`, `AGENTS.md`):
  - module in `app/modules/<domain>/`, in the controller → service → repository → model chain, with its own `routes.ts`;
  - only the `#modules/*` and `#shared/*` aliases, no relative `../../` imports;
  - VineJS on every input;
  - typed `app/types/inertia.ts`, no `Record<string, any>`;
  - schema in the original `create_*` (we are pre-1.0);
  - code in English and interface text in pt-BR;
- **security**:
  - isolation between tenants in every query (a foreign resource answers 404);
  - the public page does not leak data of whoever is logged in;
  - `X-Forwarded-Host` only counts with `TRUST_PROXY`;
  - encrypted secrets (`webhook_secret`);
  - constant-time comparison wherever there is a hash and a signature;
  - rate limit on the public routes and on the API;
  - logs without CPF (Brazilian individual taxpayer ID) or clinical data;
  - LiveKit metadata carries only `{ role }`;
- **clinical rules** (`docs/brazil-telemedicine-rules.md`):
  - versioned consent, with a hash;
  - no video token before consenting and being admitted;
  - `canAttend` exclusive to the consultation's doctor;
  - append-only audit;
- **quality**:
  - dead kit code that the product does not use (demos, generic screens): remove what is safe to remove and list the rest;
  - duplication;
  - services that are too fat;
  - N+1;
  - tests that only repeat the implementation;
  - names that do not say what they do.

Fix what is clear. Each finding becomes one line in the report: **applied** or **discarded because…**. Business and authorization rules **are not loosened**. If the fix is to tighten a rule, tighten it, with a test. A decision that belongs to the owner goes to "Questions for the owner" in the report, without implementing it.

Known pending items, which enter the review:

- the `telemed_patient` cookie is one per browser and should be per consultation;
- `PublicClinicService` loads all active tenants on every request;
- the 60 s video JWT is not revocable, but `finish` deletes the room: check whether that is enough;
- `pnpm build` has not run since the first round.

## Part 2: integration with Clínica Fácil

Clínica Fácil (`~/Projects/personal/clinicafacil`) is the first integrator. open-telemed exists so that it can offer teleconsultation.

**Clínica Fácil is read-only.** Do not edit anything there. Do not run its tests, `pnpm dev`, migrations or seed: the dev database is shared and other sessions are working in that checkout.

### Understand the other side

Read its `CLAUDE.md` and the area rules, mainly:

- `.claude/rules/agenda.md`, `agenda-atendimento.md`, `agenda-equipe.md` and `agenda-assistente*.md`;
- `whatsapp.md`, `whatsapp-envio.md` and `whatsapp-assistente*.md`;
- `features.md` (modules and gate), `tenancy.md` and `rbac.md`.

Then, the code in `app/modules/agenda/`, `whatsapp/`, `team/`, `features/` and `patient_records/`.

Answer for yourself:

- What a consultation is over there: table, status, professional and patient.
- How the professional is modeled and whether a CRM exists.
- How the patient receives a message (WhatsApp sending, templates).
- How a new module would be wired in (`FEATURE_KEYS`).
- Where the teleconsultation outcome should flow back to: attendance or the medical record.

### Adjust open-telemed so the integration works well

Implement here, with tests and an updated OpenAPI, whatever is clearly necessary and contained. The list below is the starting point; whatever the reading shows makes more sense takes precedence over it.

- **Idempotency**: `external_id` unique per tenant. Repeating `POST /consultations` with the same `external_id` returns the existing consultation, without duplicating, and does not generate a new link unless requested.
- **Reschedule and update**: change the time or professional of a consultation that is still `scheduled`.
- **Reissue the patient link through the API**, so the integrator can resend it on WhatsApp. The secret only appears in the issuance response.
- **Professional**: how the integrator points to the doctor (by open-telemed id, by CRM/UF or by an `external_id` of the professional) and, if it makes sense, provisioning the professional through the API.
- **Outbound webhook** with what Clínica Fácil needs to reconcile:
  - `external_id`, unique `event_id` (for deduplication), status, outcome, times and professional (CRM/UF);
  - HMAC signature with a timestamp, against replay;
  - the documented contract.
- **Tenant mapping**: one Clínica Fácil business corresponds to one open-telemed clinic. Decide between one service token per clinic and a platform integrator with `X-Tenant-Id`, justifying the choice.

**Proposal, without implementing** (it touches auth, so it is the owner's decision): how the doctor enters the room from Clínica Fácil's schedule without a second login. Example: a signed, single-use, short-lived entry link, requested by the integrator. Describe in the document the design, the risks and the alternative.

### Document for the Clínica Fácil side

Create `docs/clinicafacil-integration.md`, which becomes the basis for the ticket and the spec that Clínica Fácil will write in its own workflow. It covers:

- the contract (endpoints, payloads, webhook, errors, idempotency);
- the end-to-end flow: schedule a teleconsultation in the agenda → create in open-telemed → link via WhatsApp → patient consents and waits → doctor admits → outcome comes back;
- what changes in Clínica Fácil, with its modules and files that would be touched, the new module or feature key and the migration;
- its invariants that the integration must respect, citing the rule;
- the questions for the owner.

Up to 200 lines.

## Environment and gate

- `pnpm dev` on 3333 may be running: if it gets in the way, stop it and, at the end, leave it running again.
- Node 24: `mise exec node@24.21.0 -- pnpm …`.
- The suites run in a scope with limited memory and few workers, as in the previous round.
- **Do not commit**: the owner commits.
- Gate: `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e`, `pnpm test:ui` and `pnpm build` pass.

## Delivery

- `docs/review-report.md`: the review findings (applied or discarded, with the reason), what changed for the integration, the questions for the owner and the gate with numbers.
- `docs/clinicafacil-integration.md`.
- In the chat, a short summary with the gate.
