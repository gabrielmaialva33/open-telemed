**English** · [Português](implementation-report.pt.md)

# Implementation report — Open Telemed

Date: 11/26/2026. Scope: sections 0–5 of `docs/spec-telemed.md`.

## Result

All five acceptance criteria were met in the development environment: green checks, Japa coverage of the required controls, a two-clinic seed, a real call through LiveKit between two browser contexts with a fake camera, and a README in pt-BR.

The work was done in the local checkout, with no `git add`, commit, push or branch switch. The staged base was preserved. New files remain untracked; therefore they do not show up in a plain `git diff` until the reviewer adds them.

## What was done

- Product renamed to Open Telemed, package `open-telemed` 0.1.0, AGPL-3.0-only, original repository URLs removed. `NOTICE` identifies the MIT origin and `LICENSE-adonis-web-kit-MIT` was preserved. Single README, in Portuguese; public sign-up and demos disabled by default.
- Compose with project `open-telemed`, PostgreSQL 5434, Redis 6381, Mailpit 1026/8026 and LiveKit 7880/7881/7882-UDP. Local `.env`, example, test and env-variable validation adjusted. Test database and Redis DB 15 separated from development.
- Clinic with branding, authorized domains, legal identification and an encrypted webhook secret. Medical profiles with CRM/UF/RQE (Brazilian medical license number, state and specialty registration); creation of a new user or linking of an existing member. The link assigns the doctor role and invalidates the permissions cache so that access is granted immediately.
- Tenant-isolated consultations, professional link also validated by a composite foreign key, states and outcomes, schedules, patient identification/reported location, modality and a configurable minimum retention of 20 years.
- Versioned terms per clinic, SHA-256 hash, explicit acceptance with IP, browser and optional representative. The recording choice is separate, unchecked by default and does not enable recording. Terms, acceptances and clinical audit are protected against UPDATE/DELETE by PostgreSQL triggers.
- Link with the secret in the fragment, hashes in the database, and exchange for an anonymous session that is HttpOnly, SameSite Strict and Secure in production. The fragment is stripped before Inertia initializes. Expired session, expired link and mismatched clinic are refused.
- Public flow with camera preview, microphone meter, terms, waiting via 2-second polling, entry after admission, video, and an in-person care option. Footer with the clinic's legal data. Public props do not include the authenticated user or flashes.
- Consultations panel, creation, detail/link, doctor's room, admission and closing with an outcome; screens for professionals, branding, legal data, terms and webhook. Responsiveness checked at 390 and 1280 px.
- Kit RBAC with clinic owner, doctor and integrator roles. A doctor accesses their own consultations by ownership. Administrative operations require a role in the active tenant. The API uses the kit's opaque tokens, abilities and permissions; a resource from another clinic answers 404.
- Video through the shared service: room `t<tenantId>-<consultationId>`, two-person limit, a 60-second join JWT restricted to the room, first name as display name and metadata only `{ role }`. Controls in Portuguese and room closing by the backend.
- LiveKit inbound webhook validated over the raw body by `WebhookReceiver`; join, leave and finish events, deduplication and protection against reactivation by late events. Audit of transitions, consent, admission and outcome.
- Outbound delivery with an outbox persisted in the same transaction as the state, a Bull job, HMAC-SHA256, six attempts with exponential backoff and a 10-second timeout. The queue receives only the delivery identifier. Command to recover events not yet enqueued.
- Responses/logs for clinical failures do not include SQL or document bindings. External identifier conflict returns 409. Audit sanitizes sensitive fields and does not store the clinical payload.

In the kit's interface, I removed the duplicated external Tailwind and the layerless universal reset that nullified spacing. I adjusted the mobile header and the height limit of the LiveKit bar so the controls are not clipped. The inherited sign-up/demo tests explicitly enable those modes only inside the test itself; the product defaults remain disabled.

## Main files

| Area                          | Files                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Consultations and integration | `app/modules/consultations/{controllers,services,repositories,models,validators,jobs}/`, `routes.ts`                                            |
| Terms                         | `app/modules/consents/models/`, `services/consent_text_service.ts`                                                                              |
| Professionals and panel       | `app/modules/professionals/`                                                                                                                    |
| Clinic                        | `app/modules/tenants/models/tenant.ts`, `services/branding_service.ts`, `services/public_clinic_service.ts`, `validators/branding_validator.ts` |
| Video and ownership           | `app/shared/services/video_service.ts`, `ownership_service.ts`                                                                                  |
| Privacy and audit             | `app/exceptions/handler.ts`, `app/shared/middleware/inertia_middleware.ts`, `app/modules/audits/`                                               |
| Interface                     | `inertia/pages/telemed/`, `inertia/components/telemed/`, `inertia/css/telemed.css`                                                              |
| Infra and jobs                | `docker-compose.yml`, `start/env.ts`, `config/queue.ts`, `commands/dispatch_webhooks.ts`                                                        |
| Seed                          | `database/seeders/tenant_seeder.ts`, `user_seeder.ts`                                                                                           |
| Contract                      | `docs/openapi.yaml`, `README.md`                                                                                                                |
| Regressions                   | `tests/functional/telemed/`, `tests/browser/telemed/consultation.spec.ts`, `inertia/tests/telemed/consent_form.test.tsx`                        |

The OpenAPI was converted from 3.1 to 3.0.3 because the validator installed in the kit accepts 3.0. The assertions plugin was wired into the bootstrap and the consultation-creation response is checked against the contract. The previous endpoints were kept.

## Migrations and seed

The original migrations for `tenants`, permissions/roles and `audit_logs` were adjusted, following the pre-1.0 policy. Seven migrations were added, `1795600000000` to `1795600000006`, creating:

1. `professionals`;
2. `consent_texts`;
3. `consultations`;
4. `consents`;
5. `patient_links`;
6. `webhook_deliveries`;
7. `livekit_events`.

This project's development database was recreated, received the 23 migrations and the seed. Final SQL check: Aurora, color `#0f766e`, one professional and one consultation; Horizonte, color `#6d48a5`, one professional and one consultation. Each clinic has an administrator, a doctor and a service user. The seed prints fictitious logins, links and tokens; tokens and secrets are not reproduced in this report. The test uses its own database and rolls back the migrations when it finishes.

## How to run

Use Node 24, as in `.nvmrc`. In this run the commands were prefixed with `mise exec node@24.21.0 --`.

```sh
pnpm install --frozen-lockfile
# Only on a fresh install, without .env:
cp .env.example .env
pnpm ace generate:key

docker context ls
# Confirm that the Docker context points to the dev host.
docker compose up -d --no-recreate postgres redis mailpit livekit
# Only if the test database does not exist yet:
docker compose exec -T postgres createdb -U postgres open_telemed_test

pnpm ace migration:run
pnpm ace db:seed
pnpm dev
```

In this checkout, `.env`, databases, migrations and seed are already prepared; there is no need to copy the file again or regenerate the key. Open `http://localhost:3333`. The README lists the fictitious logins and the demo password. For new seed links/tokens, run `pnpm ace db:seed` again.

In another terminal, for webhook delivery:

```sh
pnpm ace queue:listen --queue=consultation-webhooks
# Recovery of persisted events that did not reach the queue:
pnpm ace telemed:dispatch-webhooks
```

The recovery does not automatically restart jobs that have already exhausted the six attempts. Those cases stay in the outbox for operational intervention. No development server or permanent worker was left running; the four infra containers remain active on the dev Docker host.

The pre-existing LiveKit was reused, without recreation: ID starting with `c9e982fcce3c`, started at `2026-11-25T22:00:10Z`. PostgreSQL, Redis and Mailpit were healthy at the final check. No container from another project was changed.

Incident during preparation: a failure in the Compose edit script let an initial call use the old configuration, which tried to publish 6379 and was refused due to a collision. The three new `adonis-web-kit-*` containers stayed in the Created state and were removed, along with the network created in that attempt. No existing service was taken down and no volume was removed. Then the corrected Compose came up exclusively on the spec's ports.

## Validation run

| Command                       | Final result                                                   |
| ----------------------------- | -------------------------------------------------------------- |
| `pnpm lint`                   | Exit 0, no ESLint errors                                       |
| `pnpm typecheck`              | Exit 0, backend and frontend                                   |
| `pnpm test:e2e`               | **214 tests passed**, 34 seconds; unit, functional and browser |
| `pnpm test:ui --maxWorkers=4` | **58 tests passed in 10 files**, 1.67 seconds                  |
| `pnpm build`                  | Exit 0, client/SSR bundles and backend compilation             |
| `git diff --check`            | No whitespace problems                                         |

The Japa suites were run sequentially, with no concurrent Japa processes. Vitest was limited to four workers. Tests and build ran in a systemd scope with `MemoryHigh=8G`, `MemoryMax=10G`, `MemorySwapMax=2G` and `OOMPolicy=kill`.

```sh
TELEMED_SCREENSHOT_DIR="$PWD/docs/screenshots" \
  systemd-run --user --scope -p MemoryHigh=8G -p MemoryMax=10G \
  -p MemorySwapMax=2G -p OOMPolicy=kill -- pnpm test:e2e

systemd-run --user --scope -p MemoryHigh=8G -p MemoryMax=10G \
  -p MemorySwapMax=2G -p OOMPolicy=kill -- pnpm test:ui --maxWorkers=4
```

The telemedicine tests verify all eight Japa scenarios requested in the spec. They also cover expired session/link, immutable acceptance, signed and tampered webhooks, replay, RAC export, token abilities, identifier conflict without exposing the document, a doctor created from an existing member with previously cached permissions, and signed HTTP delivery with a 503 failure followed by success and deduplication. The delivery test calls the job handler again; it does not measure the time scheduling of the backoff in a separate worker.

The browser uses `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`, with two isolated contexts. It verifies two videos with decoded frames on each page, the doctor/patient identities in the real room and `maxParticipants=2`. It also checks that the fragment was removed, recording unchecked, closing with in-person referral, the patient's refusal at clinic B, no JavaScript exceptions, and no overflow/clipping of the controls at both widths.

Screenshots generated and inspected:

| Screen                        | Desktop                                           | Mobile                                          |
| ----------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| Aurora, preparation and terms | [1280 px](screenshots/aurora-consent-1280.png)    | [390 px](screenshots/aurora-consent-390.png)    |
| Patient waiting               | —                                                 | [390 px](screenshots/aurora-waiting-390.png)    |
| Doctor before admission       | [1280 px](screenshots/doctor-waiting-1280.png)    | —                                               |
| Patient video                 | [1280 px](screenshots/patient-video-1280.png)     | [390 px](screenshots/patient-video-390.png)     |
| Doctor video                  | [1280 px](screenshots/doctor-video-1280.png)      | [390 px](screenshots/doctor-video-390.png)      |
| Horizonte, another brand      | [1280 px](screenshots/horizonte-consent-1280.png) | [390 px](screenshots/horizonte-consent-390.png) |

Logs summarized above; full files in `~/.cache/agents/2026-11-26-open-telemed-implementation/{lint-final,typecheck-final,e2e-final,ui-final,build-final}.log`. The seed log in that directory has permission 600 and contains only synthetic development credentials/links.

Non-blocking warnings observed: a local pnpm configuration referencing a missing `NODE_AUTH_TOKEN`, a Vite warning about a chunk above 500 kB, and LiveKit SDK messages about DataChannels closing when the room ends. None of these warnings caused a check to fail.

## Out of scope and verified limits

- As per the spec: prescriptions/medical certificates and ICP-Brasil (Brazilian public key infrastructure), recording, FHIR/RNDS (Brazil's national health data network), CFM lookup (Federal Council of Medicine) and a mobile app were not implemented.
- Media test with Chromium and fake devices; there was no test with a physical camera, real phones, Safari/Firefox, public network/TURN or load. The microphone is requested and there is a meter in the preview; there was no human assessment of audio quality.
- The LiveKit on the dev Docker host does not send webhooks to this machine in the development environment. Inbound was validated with payloads signed by the SDK, including tampering and replay. Production needs to configure the webhook destination and HTTPS/WSS.
- A video JWT that has already been issued can be presented again until it expires in 60 seconds on self-hosted LiveKit. The backend blocks new issuance after finishing and closes the room; there is no additional central revocation at this stage.
- Immutability protection was validated on PostgreSQL. `retain_until` records the policy; it is not a backup solution, certified document custody or an electronic health record/SRES (certified electronic health record system). There is no automatic purge of clinical records.
- There was no deploy nor legal or clinical certification. The seed's legal data is fictitious; the CRM format is validated, professional standing is not.

Git index checked before and after: SHA-256 of `git ls-files -s` identical, `fef66978eb603340f5224db08c51696d4719fdc5c03a5f456fdb44519e652b2c`.

## Confidentiality fix

Review of 11/26/2026: the improper access by the manager to another professional's consultation was confirmed and fixed. Before the fix, the tests reproduced 200 responses where 403 responses were required for clinic owner, admin and root.

`ConsultationAccessService.canAttend` requires ownership of the consultation in the active tenant: the kit's check links `consultations.professional_id` to `professionals.id`, checks the same tenant and `professionals.user_id` equal to the authenticated user. This requirement precedes any authorization by role or permission. After it, `consultations.attend.own` is checked. Admission, the doctor's token and the end endpoint necessarily go through this rule; not even old broad permissions bypass the professional identity.

I removed `consultations.attend` without context from both the original permissions migration and the service that generates the catalog. `consultations.attend.own` remains, usable only on the professional's own consultations, including when they are also the clinic owner. No additional migration was created. In the local `open_telemed` database, I removed the single record of the obsolete permission and its links via cascade; the check now returns only `consultations.attend.own`. Cache invalidation was restricted to this project's ACL namespace in Redis. It was not necessary to recreate the database or change clinical data.

The controller provides `canAttend` to the detail page and also requires authorized attendance on direct access to `/consultations/:id/room`. A manager who is not the doctor still sees the administrative details, but does not see admission, joining the room, the link to the room, video, the outcome selector or closing. Cancelling a consultation that has not started yet remains available. The `end` endpoint remains entirely restricted to the professional, including for `no_show`.

Main files of this fix:

- `app/modules/consultations/services/consultation_access_service.ts`;
- `app/modules/consultations/controllers/consultations_controller.ts`;
- `app/modules/permissions/services/create_default_permissions_service.ts`;
- `database/migrations/1752435661561_create_default_permissions.ts`;
- `inertia/pages/telemed/consultation.tsx`;
- `tests/functional/telemed/clinical_access.spec.ts` and a fixture adjustment in `consultations.spec.ts`;
- `inertia/tests/telemed/clinical_access.test.tsx`.

New regressions: non-responsible owner/admin/root and a doctor of another consultation in the same tenant receive 403 on `admit`, `video-token` and `end` with `completed` or `referred_in_person`, without changing the state. An obsolete broad grant, deliberately inserted in the test, is also refused. The owner who is the professional can admit, receive a token with their own name and end with both outcomes. There is coverage of administrative reading, blocking of the room route, cancellation before admission, a catalog without the broad permission, and the panel controls in the waiting and in-attendance states.

RED/GREEN evidence: before the fix, **15 failures in 21 Japa regressions** and **2 failures in 4 interface regressions**; after, **21/21** and **4/4** passed. The final run of the full suites, after all changes, produced:

| Command                       | Summarized output                                                 |
| ----------------------------- | ----------------------------------------------------------------- |
| `pnpm lint`                   | Exit 0; no ESLint errors                                          |
| `pnpm typecheck`              | Exit 0; backend and frontend                                      |
| `pnpm test:e2e`               | `Tests 235 passed (235)`; 33 seconds                              |
| `pnpm test:ui --maxWorkers=4` | `Test Files 11 passed (11)`; `Tests 62 passed (62)`; 1.59 seconds |
| `git diff --check`            | Exit 0                                                            |

All four commands used Node 24.21.0 and a systemd scope with `MemoryHigh=8G`, `MemoryMax=10G`, `MemorySwapMax=2G` and `OOMPolicy=kill`. Japa with no concurrent suite processes; Vitest with at most four workers. The full suite also repeated the call between the two browsers through LiveKit. The build was not repeated in this fix.

Logs: `~/.cache/agents/2026-11-26-open-telemed-sigilo/{backend-red,backend-green,ui-red,ui-green,lint-final,typecheck-final,e2e-final,ui-final}.log`. The screenshots from the repeat of the existing flow are in `screenshots/` inside that scratch directory. The non-blocking pnpm and DataChannels-closing warnings already recorded above remained.

No commit and no `git add`. The SHA-256 of the index remains exactly equal to the one recorded in the initial delivery.
