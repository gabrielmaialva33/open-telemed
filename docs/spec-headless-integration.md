**English** · [Português](spec-headless-integration.pt.md)

# Spec: headless open-telemed with Clínica Fácil branding

The owner's answers to the five questions in `clinicafacil-integration.pt.md` and
`review-report.pt.md`.

## The owner's decisions

1. **Everything through the API, with the product looking like Clínica Fácil.** People using
   Clínica Fácil (doctors, reception staff, patients) should not notice open-telemed: no second
   login, no differently branded screen and no unfamiliar domain. Open-telemed becomes the
   **headless engine** (video, consent, waiting room, audit trail and CFM rules). Its own panel
   remains for platform operations and administration only.
2. **Appointment schedule ↔ teleconsultation reconciliation:** the owner asked you to
   **propose the best approach**, considering both systems.
3. **Who receives the link and which template is used:** likewise, propose the best approach.
4. **A snapshot of the doctor's identity and authorship of data returned to the medical
   record: yes.** Implement it.
5. **Revoking video access at the end of a consultation:** likewise, propose the best approach.

## What to do

### Design

Read both systems before designing. Clínica Fácil remains **read-only**: do not edit files or
run tests, development servers, migrations or seeds there.

For each of items 1, 2, 3 and 5:

- recommend **one** approach, justified by the code on both sides;
- briefly record the rejected alternatives and why they were rejected.

Item 1 must resolve the following:

- **No second login for doctors.** Doctors attend **inside Clínica Fácil**. Clínica Fácil
  already authenticates the user, and open-telemed must trust that identity without creating
  a security gap.
  - The integrator currently has no right to attend; that was a security decision.
  - The new design must preserve the guarantee that only the consultation's assigned doctor
    can admit the patient, obtain a token and end the consultation.
  - One possible approach: a short-lived, single-use assertion signed by Clínica Fácil's
    backend and scoped to a consultation and a mapped professional. Propose the best option.
- **Patient.** The patient page stays on Clínica Fácil's domain. Choose between:
  - an open-telemed page on a clinic host (`custom_hosts` already exists), branded as Clínica
    Fácil;
  - Clínica Fácil rendering the flow itself and calling the headless API through its backend.

  Either way, patients still do not need an account, and consent rules remain unchanged.

- **Video.** Decide whether Clínica Fácil uses `@livekit/components-react` with API-issued
  tokens.
- **Branding.** No "powered by" or other trace of open-telemed branding in the end-user
  experience.

### Implementation in open-telemed

Implement what the design requires, with tests and OpenAPI:

- the doctor and patient **headless API**, following the design for item 1;
- **item 4**: a snapshot of the doctor's identity on the consultation (name, CRM, UF and RQE
  at the time of attendance, immutable afterward), and an export with clear authorship for
  Clínica Fácil to store in its medical record;
- **item 5**, as far as this side can implement it;
- **item 2**: whatever the open-telemed side needs, such as events and states.

Authorization rules may only become stricter, never weaker. Any authentication change must
include a short threat model in the document and negative tests (another doctor, another
clinic, a replayed or expired assertion, and a manager trying to attend).

### Documentation for the Clínica Fácil side

Update `docs/clinicafacil-integration.md` and its `.pt.md` counterpart with:

- the chosen design;
- the end-to-end flow, without the doctor leaving Clínica Fácil;
- the Clínica Fácil modules and files that need changes;
- recommendations for items 2, 3 and 5.

This document will be the basis for the ticket and specification Clínica Fácil creates in
its own workflow.

## Conventions

- The main document is in English, with a Portuguese `.pt.md` counterpart. Filenames are in
  English.
- Create `docs/spec-headless-integration.md` in English from the Portuguese source.
- No IP addresses, real hosts or machine paths in tracked files. Test hosts belong in
  `.env.test.local`, which is outside Git.
- The repository has Git again, with a single commit (`6ccf18e`). **Do not commit**: the
  owner handles commits.
- Node 24 (`mise exec node@24.21.0 -- pnpm …`). Run suites in a memory-limited scope, as
  before.
- Gate: `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e`, `pnpm test:ui` and `pnpm build`.

## Deliverables

- `docs/headless-report.md` and its `.pt.md` counterpart: decisions for items 1 through 5,
  what was implemented, what remains on the Clínica Fácil side, and gate results with counts.
- Updated integration documents.
- A short summary in chat.
