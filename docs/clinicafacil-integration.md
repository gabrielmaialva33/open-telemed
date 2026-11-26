**English** · [Português](clinicafacil-integration.pt.md)

# Clínica Fácil headless integration

Implemented in the engine; the Clínica Fácil changes below are the next implementation ticket. Its repository was read-only throughout. This document supersedes the earlier second-login proposal. See [OpenAPI](openapi.yaml), [headless report](headless-report.md) and [clinical requirements](brazil-telemedicine-rules.md).

## Chosen architecture and alternatives

**Clínica Fácil renders both patient and doctor flows on its own domain, with a backend-for-frontend (BFF).** All engine calls come from that backend. The doctor stays in the authenticated agenda; the patient uses a secret link without an account. Clínica Fácil uses `@livekit/components-react` inside its own layouts with room-scoped tokens from the BFF. It owns titles, copy, legal clinic identity, loading/error screens and support links: no engine login, logo, attribution or navigation. The engine panel is for platform operations. Public patient exchange and panel attendance are refused for configured headless clinics.

Rejected: an iframe/custom-host engine page duplicates the UI and session boundary; shared browser login/long-lived impersonation JWTs expand privileges. `custom_hosts` remains available for non-headless deployments, but is not the Clínica Fácil integration. Media infrastructure addresses may remain visible to developer tools; no claim is made that WebRTC hides its network destination. Product navigation and links remain Clínica Fácil's.

**Doctor authorization:** per-action signed assertions, not an engine login session. Keep one opaque service credential and one signing key pair per business/clinic; private keys and service tokens never enter the browser. The operator pins the issuer, RSA public key, service user, patient URL and explicit external-subject → professional mapping. Separate service and clinician accounts. Service membership must be exclusive to that clinic when configured.

## Provisioning and trust contract

Operator commands in the engine (placeholder values only):

```sh
pnpm ace permission:sync
pnpm ace telemed:configure-headless --tenant-id=7 --service-user-id=20 --issuer=clinicafacil-unit-7 --public-key-file=clinic-public.pem --patient-url=https://clinic.example/teleconsulta
pnpm ace telemed:map-doctor --tenant-id=7 --professional-id=42 --subject=doctor-314
```

Provision doctors with verified name/CRM/UF/RQE using the operations panel. A mapping requires an active clinic member with the `doctor` role; global root and service accounts cannot be mapped. Clínica Fácil's `professionals.user_id` is optional and its council/registration fields are free text: do not infer identity from a name or parse unverified credentials automatically. Map its authenticated account and local professional explicitly. Changing issuer with existing mappings is rejected; remove/reverify mappings first. Same-issuer key rotation preserves mappings, immediately invalidating assertions signed with the previous key.

The dedicated service role/token needs the existing create/read/update/link/cancel/audit and professional-read abilities, plus `consultations.headless_patient` and `consultations.headless_doctor`. Each route checks RBAC, token ability, tenant membership and the configured service user. Existing tokens require explicit reissuance for new abilities. No seed rerun is needed.

Clínica Fácil must check active login, module entitlement, business membership, exact assigned professional, doctor capability and current appointment on **every** doctor request before signing. An owner/manager cannot select a doctor's subject. A compromised trusted signing backend can impersonate its mapped doctors; protect and audit this explicit federation trust boundary.

## Doctor API — server to server

All requests use `Authorization: Bearer <service-token>` and mapped `X-Tenant-Id`. POST JSON `{ "assertion": "<signed JWT>" }` to `/api/v1/headless/doctor/:id/{state,admit,video-token,end}`.

Example signed payload; identifiers are synthetic:

```json
{
  "iss": "clinicafacil-unit-7",
  "aud": "telemed:doctor-action",
  "sub": "doctor-314",
  "jti": "cc0e4a41-a276-445c-8698-afb043bb1ac0",
  "iat": 1807000000,
  "exp": 1807000060,
  "consultation_id": 81,
  "action": "end",
  "outcome": "completed"
}
```

Sign with **RS256**, RSA ≥2048 bits. `exp-iat` must be positive and ≤60 seconds; expired assertions, old `iat`, `iat` more than five seconds in the future, wrong issuer/audience/algorithm/key, unmapped subject and action/consultation mismatch fail. `jti` is a UUID, consumed atomically with each successful action; retries after uncertain success use a fresh assertion and reconcile state. `outcome` is signed and required for `end`, not taken from an unsigned body field. No key URL supplied by the caller is fetched.

The engine rechecks connection, clinician membership, exact assigned professional, direct `doctor` role and its attendance grant under the consultation lock. Root and managers without that clinical identity are refused. It does not grant an integrator generic `attend` permission. Audit records distinguish the clinician from the service user/connection that transported the request.

| Action        | Result                                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`       | 200 `{data: ConsultationRecord}` from the authorized locked record.                                                                                                                      |
| `admit`       | 200 `{data}`; requires waiting plus accepted consent, starts attendance and freezes doctor identity.                                                                                     |
| `video-token` | 200 `{token,url}`; requires consent/admission/in-progress, role-only metadata, two participants, initial TTL 60 seconds.                                                                 |
| `end`         | 200 `{data}`; signed outcome `completed`, `referred_in_person` or `no_show`; records immutable authorship and schedules video closure. Medical completion/referral requires in-progress. |

Errors: 400 invalid tenant context/header; 401 invalid/expired credentials or assertion replay; 403 missing ability/membership or wrong clinical identity/scope; 404 missing/foreign resource; 409 incompatible state; 422 invalid payload; 429 rate limit. Retry transport/5xx/429 with bounded backoff; reconcile state after an uncertain mutation instead of treating a repeated transition as success.

There is no engine session cookie or second login. The BFF forwards only the authorized UI result, never the assertion/service token. All headless responses are `no-store, private` with `no-referrer`. Authenticate the BFF's own browser routes and enforce CSRF there.

## Patient API — server to server

All endpoints below are POST under `/api/v1/headless/patient`, with the same service/tenant credentials and the patient ability. The browser never receives the service credential.

| Endpoint       | Input and result                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/session`     | `{secret}` from the patient URL fragment → patient state plus `session_secret`; no engine patient cookie is set.                                                    |
| `/state`       | `?consultation_id=81` and `X-Patient-Session` → clinic branding, patient first name, status, consent/admission flags and version/hash/body of the displayed term.   |
| `/consent`     | Same context plus `{accepted:true,version,text_hash,recording_allowed?,representative_name?,representative_document?,client_ip,client_user_agent}` → waiting state. |
| `/video-token` | Same context → `{token,url}` only after consent and admission.                                                                                                      |
| `/decline`     | Same context → `ended/patient_declined`, attributed to the patient, with video closure scheduled.                                                                   |

On Clínica Fácil's patient page, capture the fragment once, remove it from the address bar and exchange through the BFF. Store the returned engine session securely server-side, indexed by an independent HttpOnly/Secure/SameSite session cookie per consultation; strip `session_secret` from browser JSON. Preserve the non-secret consultation selector across reloads/tabs. Send only verified request IP/user agent as consent evidence, not browser-supplied arbitrary forwarded headers. The BFF must rate-limit public secret exchange and session requests by IP/session; the engine also caps API requests at 100/minute per service user. Size polling against this shared budget; back off on 429, and use backend caching of non-secret operational state where appropriate.

Consent version/hash and explicit acceptance are unchanged. Legal representative fields must come as a pair. A stolen link or patient cookie grants that patient's limited flow; protect URLs from logs, analytics, referrers and previews. Reissuing a link revokes previous links/sessions, but is not video-token revocation and must not be done automatically during a call.

## Scheduling and export contract

Existing `/api/v1` endpoints remain: POST `/consultations`, GET/PATCH `/consultations/:id`, POST `/:id/patient-link`, POST `/:id/cancel`, GET `/:id/audit`, GET `/professionals?crm=...&crm_uf=...`. Full schemas are in OpenAPI. Create requires `professional_id`, actual `patient_name`, `patient_location`, offset-bearing `scheduled_at`; `patient_document` and `external_id` are optional. Use `external_id=appointment:<id>`.

Creation returns 201 `{created:true,consultation,patient_url,doctor_url:null}` for configured headless clinics. `patient_url` uses only the configured Clínica Fácil frontend URL plus a fragment secret. A valid retry with the same clinic/external_id returns 200/current record, `created:false`, `patient_url:null`; differences are ignored and no new link/event is generated. Without external_id each request creates a consultation. A lost first secret requires explicit link issuance. PATCH changes only time/professional while scheduled; it does not renew the existing link. Expiry is the later of scheduled time + 1 day and issuance + 3 hours. Cancellation is allowed before in-progress; terminal/state-incompatible actions return 409.

GET exports `record_schema_version:1`, `revision`, `professional_snapshot` and `outcome_author`, besides consultation/consent/timestamps/retention. Snapshot fields: `professional_id,user_id,name,crm,crm_uf,rqe,captured_at,capture_reason`. Capture occurs at admission, or at an explicit doctor's `no_show` decision if never admitted. Later profile edits do not rewrite it. PostgreSQL rejects changing/removing a captured snapshot or finalized attribution.

`outcome_author` contains `kind`, `user_id`, `external_subject`, `consultation_id`, `attributed_at`, and the frozen professional for doctor decisions. Patient refusal has kind `patient`; administrative cancellation has kind `system`, never a fabricated doctor. These are an attributed encounter summary and operational outcome, **not** a signed prescription, clinical narrative or ICP-Brasil signature. Historical data without a captured snapshot stays explicitly null; do not invent retrospective authorship. GET also exposes `video_closure` with pending/completed status, mode, attempts and `tokens_revoked`; clinical completion is not evidence of media revocation. Closure progress can change independently of the clinical revision and must still be refreshed after termination.

## Agenda reconciliation — recommended policy

Use a **durable outbox/inbox workflow with separate local and remote states**, not synchronous dual writes or direct status SQL. Native booking remains owned by `BookAppointmentService`; publish remote creation intent in the same local transaction, then retry remotely with external_id. Preserve source, attendee, lead, product, professional, capacity and checkout rules. Out-of-order webhooks never overwrite the agenda directly.

| Telemed evidence                            | Recommended Clínica Fácil effect                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scheduled`                                 | Persist remote mapping and pending/delivered invitation; do not mark confirmed/arrived automatically.                                                                                                                                                                                     |
| `waiting` after consent                     | Record remote waiting; on the appointment day transition eligible scheduled/confirmed appointments to arrived through `AppointmentStatusService`, once, respecting existing guards. Conflicts become an operational exception.                                                            |
| Doctor chooses Admit                        | Through an authenticated doctor workflow, reserve a local intent and use existing queue/status checks to start attendance, then delegate remote admit; retry/reconcile uncertain responses. Keep a visible synchronization state; never start a second appointment for that professional. |
| `in_progress`                               | Confirm the admission intent; never let a webhook impersonate a doctor or bypass the one-visit rule.                                                                                                                                                                                      |
| Doctor `completed` / `referred_in_person`   | Import the authored summary, then transition the matching active native visit to done through existing services; keep referral as separate clinical/operational detail.                                                                                                                   |
| `patient_declined`, `no_show`, cancellation | Record remote evidence; do not automatically free slots, void checkout, or mark absence without the native timing/checkout/actor checks. Queue a permitted operator action on conflict.                                                                                                   |
| `consultation.interrupted`                  | Show interrupted/reconnect state; retain in-progress. Room shutdown alone is neither completion nor absence.                                                                                                                                                                              |

A remarcação creates a **new** appointment (`rescheduleOfId`), marking the old rescheduled. Cancel the old remote consultation and create a new external_id; preserve a compensating intent if cancellation fails. Do not silently reuse the old consultation via PATCH. In-progress calls require the attending doctor, not integrator cancellation. On definitive remote admission failure, undo a local start only through the existing authorized undo flow and only when no clinical note or other irreversible effect exists; otherwise require an explicit reconciliation action. Initially exclude live Quark mirrors from telemed automation; their ownership/status path must be integrated separately. Do not bypass checkout, sale recording or billing effects.

For exported records, create an encrypted imported-encounter artifact linked to appointment/patient and frozen remote author, unique by remote consultation/schema revision. Keep transport identity separate. Do not insert through `PatientNotesService` as if the service user authored a note: its attending-author/root-denial and immutability rules remain. A doctor may explicitly adopt/reference the artifact in their own note while authorized; administrative history view must follow patient-record access rules. Import and inbox acknowledgement share a transaction.

## Link recipient and WhatsApp recommendation

Require **explicit recipient confirmation at booking**: patient themselves by default; an identified, authorized representative when appropriate. `appointments.attendee` is the patient and `customer_id`/WhatsApp lead may be a payer or other person; never silently equate them. Store recipient type, validated channel, appointment relation and the staff/patient confirmation. If no verified recipient/conversation exists, offer a controlled copy/send action and an operational pending-delivery state; do not invent a lead.

Use `SendMessageService`, preserving assignment and transactional enqueue. Deduplicate each delivery intent with stable `client_request_id`; a deliberate reissue is a new intent. Within the active 24-hour window, send a neutral transactional message. Outside it, use a provider-approved **utility template** with date/time, clinic identity and an access button, without diagnosis, CPF or unnecessary specialty details. Suggested copy: “Sua consulta está agendada para {{date}} às {{time}}. Acesse com segurança pelo botão. Se precisar de ajuda, fale com a clínica.” Obtain template approval and verify that its URL button preserves the chosen secret-fragment link before rollout; disable previews, and fall back to an approved delivery channel if that provider configuration cannot preserve it. Never weaken consent to fit a template.

Rejected: unconditional delivery to the current lead, autonomous assistant-generated links, and free text outside the window. The assistant may prepare a proposal; explicit confirmation, health/urgency handoff and foreign-link guards remain. Telemed URLs are controlled server output, not a broad link allowlist exception.

## Webhooks and video closure

Events contain stable `event_id` (`id` legacy alias), event/occurred_at/tenant_id, and consultation id/external_id/status/outcome/timestamps/professional CRM/UF. They now include monotonic `revision`, schema version and an author summary; CRM/UF uses the frozen snapshot when available. Events: `consultation.status_changed`, `consultation.updated`, `consultation.interrupted`. GET supplies the full attributed record; events omit patient name/document.

Verify `X-OpenTelemed-Signature: sha256=<hex>` using HMAC-SHA256 of `X-OpenTelemed-Timestamp + '.' + exact raw UTF-8 body`; validate timestamp within ±300 seconds, equal-length constant-time digest comparison, mapped tenant/consultation/external_id and durable unique `(connection,event_id)`. Acknowledge 2xx after transactional inbox acceptance. Fetch/reconcile current revision, never regress it; duplicates and stale events produce no repeated side effects. Timestamp alone does not prevent replay. Six attempts, exponential backoff from 1 second, 10-second timeout, no redirects; operator allowlist `WEBHOOK_ALLOWED_ORIGINS` and production HTTPS are required. Drain queued deliveries before rotating their snapshotted secret. Keep a worker consuming `consultation-webhooks`, run `pnpm ace telemed:dispatch-webhooks` for pending dispatch, and operate exhausted-job recovery.

Recommend **LiveKit Cloud with explicit revocation cutoff**, plus the implemented durable closure. Both deterministic participant identities are removed before room deletion; failures remain pending for retry. Self-hosted deletion does not revoke cached tokens. This distinction follows [LiveKit's token contract](https://docs.livekit.io/frontends/reference/tokens-grants/); real Cloud deployment still needs qualification and synchronized clocks. Do not claim strict revocation when configured as `self_hosted`. Outbox `tokens_revoked` distinguishes provider confirmation from mere room closure. Run `pnpm ace telemed:close-videos` every minute with monitoring, and `pnpm ace telemed:prune-assertions` periodically. No client-only disconnect or short initial TTL is accepted as proof of revocation.

## Clínica Fácil implementation ticket

- Add `app/modules/telemed/` with its controller → service → repository → model boundaries, client, signer, patient BFF, webhook inbox, outbox/reconciliation jobs and `routes.ts`. Add doctor/patient React pages and typed `app/types/inertia.ts` props, native Clínica Fácil navigation and LiveKit components.
- Extend `app/modules/features/feature_catalog.ts` and `inertia/lib/feature_keys.ts` with initially disabled `telemed`, requiring `agenda`; wire `features/support/module_permissions.ts` and `team/support/team_permissions.ts`. Enforce owning-business entitlement in services/jobs as well as routes. Billing policy stays explicit, not inferred from a video event.
- Integrate `agenda/services/book_appointment_service.ts`, `appointment_status_service.ts`, `queue_call_service.ts` and schedule UI without replacing their locks/guards. Extend `whatsapp/services/send_message_service.ts` integration and approved template configuration; preserve its ownership/window/idempotency rules.
- Add migrations for encrypted connections/private keys, verified professional mappings, consultation mappings + revision/local sync state, recipient confirmation/delivery intents, unique webhook inbox, durable outbox and encrypted imported encounter artifacts. Reuse patient-record access checks; do not weaken immutable authored notes.
- Acceptance must cover no second login/no engine branding, patient/representative distinction, replay/tampering/foreign clinician, retry-after-timeout, out-of-order revisions, Quark/checkout refusal, template delivery and verified terminal video revocation. No Clínica Fácil schema/runtime changes were made in this task.

Relevant invariants: `.claude/rules/agenda.md`, `agenda-atendimento.md`, `agenda-equipe.md`, `agenda-assistente*.md`, `whatsapp.md`, `whatsapp-envio.md`, `whatsapp-assistente*.md`, `features.md`, `tenancy.md`, `rbac.md`; implementations in agenda, WhatsApp, team, features and `patient_records/services/patient_notes_service.ts` grounded the recommendations above.
