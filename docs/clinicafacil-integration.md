**English** · [Português](clinicafacil-integration.pt.md)

# Clínica Fácil integration

Status: open-telemed implementation and tests complete; Clínica Fácil was inspected read-only. The changes proposed for Clínica Fácil and SSO below are not implemented. See [OpenAPI](openapi.yaml), [review report](review-report.md) and [clinical requirements](brazil-telemedicine-rules.md).

## Identity and tenant boundary

One Clínica Fácil business maps to one open-telemed clinic. Use **one dedicated service user and opaque token per clinic**, with exactly one active clinic membership. This limits the impact of a leaked credential and makes attribution and rotation explicit. A shared platform-wide integrator would increase that impact and is not the proposed deployment.

Send `Authorization: Bearer <service-token>` and the mapped `X-Tenant-Id`. Membership, active tenant, RBAC and token abilities are checked. Single-clinic membership is a provisioning requirement, not a new token-level tenant restriction: do not add other memberships to that user. Login JWTs do not authenticate the integration API.

Grant only `consultations.create`, `consultations.read`, `consultations.update`, `consultations.link`, `consultations.cancel`, `consultations.audit` and `professionals.read`. There is no integrator attendance privilege. Store tokens and webhook secrets encrypted on the server; never expose them to the browser, assistant or logs. On existing open-telemed installations run `pnpm ace permission:sync`; existing tokens need explicit reissuance to gain new abilities. Do not rerun seeders for provisioning.

## HTTP contract

All paths below start with `/api/v1`; JSON bodies and responses. The OpenAPI contains full schemas.

| Method and path                           | Ability                | Successful result and constraints                                                                                                                                |
| ----------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /consultations`                     | `consultations.create` | 201 `{created:true, consultation, patient_url, doctor_url}` on creation; 200 `{created:false, consultation, patient_url:null, doctor_url}` on idempotent replay. |
| `GET /consultations/:id`                  | `consultations.read`   | 200 `{data}` containing professional, consent version/hash, timestamps and retention date.                                                                       |
| `PATCH /consultations/:id`                | `consultations.update` | 200 `{data}`; change `scheduled_at` and/or `professional_id` only while `scheduled`.                                                                             |
| `POST /consultations/:id/patient-link`    | `consultations.link`   | 200 `{patient_url}`; explicitly revokes previous links and patient sessions. Terminal consultations return 409.                                                  |
| `POST /consultations/:id/cancel`          | `consultations.cancel` | 200 `{data}` for scheduled/waiting; in-progress or terminal consultations return 409.                                                                            |
| `GET /consultations/:id/audit`            | `consultations.audit`  | 200 `{data:[...]}`; append-only audit events.                                                                                                                    |
| `GET /professionals?crm=123456&crm_uf=SP` | `professionals.read`   | 200 `{data:[...]}` with id/name/CRM/UF/RQE; filters optional, scoped to the selected clinic; no match returns an empty list.                                     |

Example create body (synthetic values):

```json
{
  "external_id": "appointment:1234",
  "professional_id": 42,
  "patient_name": "Example Patient",
  "patient_location": "São Paulo/SP",
  "scheduled_at": "2026-12-10T14:00:00-03:00"
}
```

`patient_document` is optional. Use the actual attendee, not automatically the WhatsApp contact or paying customer. Patient location must be supplied explicitly. Timestamps require an ISO 8601 offset or `Z` and a valid calendar date.

`external_id` is unique **within the clinic**. Concurrent retries are serialized and create one consultation, initial link and scheduled event. A replay must still contain a valid create body; differences are ignored, not applied. Without `external_id`, each POST creates a new consultation. If the first response is lost, GET/repeated POST cannot recover its secret: explicitly issue a replacement link. Persist the appointment-to-consultation mapping before delivery.

Create and link responses use `Cache-Control: no-store`. A patient link carries its secret in the URL fragment. Treat the full URL as a credential, including in WhatsApp storage and error traces. Its initial expiry is the later of scheduled time + 1 day or issuance + 3 hours. PATCH preserves the link and never renews its expiry; explicitly reissue when needed. Reissuance revokes cookies/links, **not previously issued LiveKit JWTs**. Do not automatically reissue during a call.

Errors: 401 invalid/missing/expired authentication; 403 missing membership/permission/ability; 404 missing or foreign resource; 409 incompatible state; 422 invalid input; 429 rate limit (100 requests/minute per service user). Preserve structured errors, avoid logging patient fields, and retry transport/5xx/429 with bounded backoff; resolve 4xx semantically. Cancellation/end are state transitions, not idempotent success responses: reconcile via GET after uncertain delivery.

## Signed outbound webhook

Configure a clinic webhook URL and encrypted secret in open-telemed. Its origin must be approved by the operator in `WEBHOOK_ALLOWED_ORIGINS`; the empty list denies delivery. Production requires HTTPS, no URL credentials or fragments, and redirects are refused. Trust the approved origin and its DNS; this is an operator allowlist, not DNS pinning. Changing a clinic URL does not rewrite already queued deliveries.

```json
{
  "event_id": "b4ac396e-c9a8-47b4-bf18-83f8d50a1d9a",
  "id": "b4ac396e-c9a8-47b4-bf18-83f8d50a1d9a",
  "event": "consultation.status_changed",
  "occurred_at": "2026-12-10T17:30:00.000Z",
  "tenant_id": 7,
  "consultation": {
    "id": 81,
    "external_id": "appointment:1234",
    "status": "ended",
    "outcome": "completed",
    "modality": "teleconsulta",
    "professional": { "id": 42, "crm": "123456", "crm_uf": "SP" },
    "scheduled_at": "2026-12-10T17:00:00.000Z",
    "admitted_at": "2026-12-10T17:02:00.000Z",
    "started_at": "2026-12-10T17:02:00.000Z",
    "ended_at": "2026-12-10T17:30:00.000Z"
  }
}
```

`id` is a legacy alias of `event_id`. Updates emit `consultation.updated`; transitions emit `consultation.status_changed`. Statuses: `scheduled`, `waiting`, `in_progress`, `ended`, `cancelled`. Outcomes: `completed`, `referred_in_person`, `patient_declined`, `no_show`, or null. No patient name/document is included. Joined/left times and consent details are available in the authenticated GET record, not this event.

Headers: `X-OpenTelemed-Timestamp: <Unix seconds>` and `X-OpenTelemed-Signature: sha256=<64 hex digits>`. Compute HMAC-SHA256 over **timestamp + `.` + exact raw UTF-8 body** using the shared secret; never reserialize JSON before verification. This timestamp-prefixed signing format replaces body-only signing.

The receiver must reject malformed timestamp/signature, enforce absolute clock skew ≤300 seconds, decode and compare equal-length digests with `timingSafeEqual`, and verify mapped clinic + consultation + external_id. Use a unique `(connection_id, event_id)` inbox key and commit deduplication with local effects/outbox in one transaction. Return 2xx only after durable acceptance. The timestamp window alone does not stop replay within the window. Duplicate events must return success without repeating effects.

Retries retain body/event_id, refresh timestamp/signature and can arrive out of order. GET the current consultation before applying state-dependent reconciliation; do not blindly overwrite newer state. Queue policy: six attempts, exponential backoff starting at 1 second, 10-second HTTP timeout. Monitor exhausted jobs. `pnpm ace telemed:dispatch-webhooks` recovers pending enqueue work; exhausted jobs require operator handling. Drain pending deliveries before secret rotation because each outbox row retains an encrypted secret snapshot. A periodic dispatch/reconciliation job must be operated explicitly.

## End-to-end flow and Clínica Fácil changes

Paths in this section are relative to the read-only Clínica Fácil repository.

1. Existing agenda flow confirms booking through `app/modules/agenda/services/book_appointment_service.ts`. In the same local transaction, persist a telemed creation intent; call open-telemed asynchronously after commit. Never replace agenda's capacity/idempotency/locking checks with the remote call.
2. Resolve a verified professional mapping, send POST with `external_id=appointment:<id>`, persist remote id/status and securely deliver the returned link. Retry creation safely; explicit reissuance is a separate action when a secret was lost or expired.
3. Send through `app/modules/whatsapp/services/send_message_service.ts` with a stable `client_request_id` for that delivery intent. Respect conversation ownership, assignment, pending-message transaction and enqueue-after-commit. Outside the 24-hour window use an approved template; a template does not reopen the window. Do not fabricate a lead/conversation for a panel booking.
4. The patient opens the clinic-branded page, consents to the current version/hash and enters waiting. The link is exchanged for an HttpOnly cookie scoped by consultation; separate tabs remain independent. No video before consent and admission.
5. The assigned doctor opens `doctor_url` using the existing open-telemed session/login and explicitly admits. Neither the scheduler nor a manager gains attendance rights through the integration.
6. Receive the signed event into an inbox, reconcile the remote record and store operational outcome/timestamps. Apply agenda transitions only through its existing status service and an owner-approved mapping. Do not create or sign clinical notes automatically.

| Proposed change in Clínica Fácil                                                                                                            | Responsibility                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New `app/modules/telemed/` with controllers, validators, services, repositories, models, jobs and `routes.ts`                               | Connection setup, verified mappings, create/update/cancel/link commands, inbox and reconciliation; remote calls isolated in a client.                                                                                                  |
| `app/modules/features/feature_catalog.ts`, `inertia/lib/feature_keys.ts`                                                                    | Add `telemed`, initially disabled, non-metered, depending on `agenda`; billing policy remains an owner decision.                                                                                                                       |
| `app/modules/features/support/module_permissions.ts`, `app/modules/team/support/team_permissions.ts`                                        | Explicit configure/schedule/read/link capabilities, wired into existing feature and team enforcement. Gate by owning business in services, including jobs/webhooks; disabling does not delete records.                                 |
| Agenda booking/status/queue services and schedule UI                                                                                        | Add telemed actions and remote state without bypassing the existing scheduling writer, status machine or attendance authorization.                                                                                                     |
| WhatsApp send service and approved template configuration                                                                                   | Controlled server-generated delivery; account for contact versus attendee and approval/window rules.                                                                                                                                   |
| New migrations for `telemed_connections`, `telemed_professional_links`, `telemed_consultations`, `telemed_webhook_events`, `telemed_outbox` | Encrypted credentials and one-to-one clinic mapping; scoped professional mapping; unique business/appointment and remote consultation mapping; unique connection/event inbox; durable retry intents. No schema changes were run there. |

## Invariants carried from Clínica Fácil

- **Agenda** (`.claude/rules/agenda.md`, `agenda-assistente.md`, `agenda-assistente-paciente.md`): `appointments.attendee` identifies the patient; `customer_id` can identify someone else. Preserve source, product, professional, lead and business ownership. The assistant only prepares proposals; explicit confirmation performs booking. Existing Quark mirror and checkout guards remain authoritative.
- **Rescheduling** (`agenda.md` and `BookAppointmentService.rescheduleOfId`): creates a **new** appointment and marks the old one `rescheduled`. Cancel the old remote consultation and create a new remote consultation with the new external_id; do not reuse it via PATCH. PATCH serves genuine in-place corrections while scheduled. If the old consultation is in progress, stop the automation and require the attending workflow; the integrator cannot end it.
- **Professionals** (`agenda-equipe.md`, `agenda/models/professional.ts`): optional `user_id`, free-text council/registration and shared `profile_id` across local unit records are not verified CRM/UF identity. Provision doctors through the existing open-telemed panel, verify CRM/UF and persist explicit scoped ids. Never match by name or automatically parse free text as a credential. API account provisioning is deferred with auth decisions.
- **Attendance** (`agenda-atendimento.md`, `agenda/support/appointment_status.ts`): agenda states (`scheduled`, `confirmed`, `arrived`, `in_service`, `done`, `no_show`, `cancelled`, `rescheduled`) are not identical to telemed states. A video disconnect is not automatically a completed appointment. Reconcile through the existing service after the owner defines mappings.
- **WhatsApp/assistant** (`whatsapp.md`, `whatsapp-envio.md`, `whatsapp-assistente*.md`): preserve the 24-hour window, assignment, idempotency, human handoff and health/urgency guards. A consultation link is controlled server output, not an assistant-generated URL or a reason to broadly relax foreign-link restrictions.
- **Features/tenancy/RBAC** (`features.md`, `tenancy.md`, `rbac.md`): root aggregate mode is not a business context; resolve the owning business before operations. Enforce backend entitlements and capabilities even when the UI hides actions; no root or manager clinician impersonation.
- **Records** (`app/modules/patient_records/services/patient_notes_service.ts`): notes use `PATIENT_RECORDS_KEY`, are immutable and restricted to the attending author, with root denied. Store integration outcomes operationally; do not bypass that service or turn a webhook into a doctor's authored note. Future medical-record export is a separate access-controlled design.

## Doctor entry without another login — proposal only

Current option: existing open-telemed login/session and `doctor_url`. Proposed future option: a server-requested, signed, single-use entry ticket, expiring in 30–60 seconds, bound to issuer/audience, clinic, consultation and a verified doctor identity. Persist a nonce hash and consume it atomically. Recheck active membership, exact assigned professional and attendance permission when redeemed; never accept an arbitrary user id or grant manager impersonation. Establish a restricted session with fixation/CSRF protections; keep the ticket out of logs, referrers and analytics.

Risks: stolen/replayed links, service-user impersonation, stale professional mappings, cross-tenant confusion, session/cookie handling and revocation. Prefer an authenticated doctor-to-server exchange with step-up where needed over a transferable bearer link. An OIDC identity broker is an alternative with more infrastructure and clearer centralized identity lifecycle. Neither design is implemented; owner approval and a separate threat model are required.

## Questions for the owner

1. Approve service-account provisioning, verified CRM/UF mapping, token lifetime/rotation and allowed webhook origins; choose the future identity/SSO approach.
2. Define agenda mappings for completion, referral, refusal, absence, cancellation and interruption, plus compensation for rescheduling when remote cancellation fails.
3. Define delivery to contact versus attendee/representative, approved WhatsApp template, consent/location collection, Quark and paid-checkout scope.
4. Approve feature entitlement/billing and which roles configure, schedule, reissue and read records; decide durable receiver/reconciliation operations.
5. Decide clinical-record export, clinician identity snapshots, retention/legal responsibilities and strict video revocation/room-close retry requirements. Deleting a LiveKit room alone does not guarantee revocation of cached tokens; see the review report.
