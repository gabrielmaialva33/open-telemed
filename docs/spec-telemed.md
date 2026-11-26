**English** · [Português](spec-telemed.pt.md)

# Spec: open-telemed on top of adonis-web-kit

This repo was born from `adonis-web-kit` (AdonisJS 7 + React 19 + Inertia, modules by domain,
N:N multi-tenancy, RBAC, audits, files). Goal: **multi-tenant, white label 1:1 teleconsultation**.
Each clinic is a tenant with its own brand, and the patient's legal flow is consent text → waiting →
admitted → video (LiveKit). The reason behind each rule is in `docs/brazil-telemedicine-rules.md`.
The reference code for the video, a working proof of concept, is in
`~/.cache/agents/2026-11-26-open-telemed-poc/` (`server.ts` and `src/main.tsx`).

Before coding, read `CLAUDE.md` and `AGENTS.md`. The kit's rules apply: modules in
`app/modules/<domain>/`, only the `#modules/*` and `#shared/*` aliases, `pnpm ace` and, before 1.0,
new schema goes into the original `create_*` migration when the table already exists.

## 0. Becoming open-telemed (mechanical)

- Replace `adonis-web-kit` / `Adonis Web Kit` / `adonis_web_kit` with `open-telemed` /
  `Open Telemed` / `open_telemed` in code, config, env, compose, docs and tests. That is about 70
  occurrences. `pnpm-lock.yaml` only changes through pnpm.
- `package.json`: name `open-telemed`, version `0.1.0`, license `AGPL-3.0-only`. Remove the kit's
  repo URLs, because the new repo does not exist on GitHub yet.
- `LICENSE` is already AGPL-3.0. The kit's MIT stays in `LICENSE-adonis-web-kit-MIT`. Create a `NOTICE`
  saying that part of the code comes from adonis-web-kit (MIT, © Gabriel Maia).
- Product defaults: `REGISTRATION_WORKSPACE_MODE=none` (no public sign-up: clinic and physician
  join by invitation or admin) and `DEMO_PAGES_ENABLED=false`.
- The README becomes pt-BR, short, about open-telemed: what it is, how to run it, the API, the flow and a link
  to the rules. `README-pt.md` goes away.

## 1. Dev infra (Docker on a remote host)

Dev Docker runs on a remote host, reached over the private network. Ports and volumes live there. Ports
5432 and 6379 on that host **already belong to another project**: do not touch its containers.

- `docker-compose.yml`: `postgres` on **5434**, `redis` on **6381**, `mailpit` on **1026/8026** and
  `livekit` (`livekit/livekit-server:v1.13.11`, `--dev --bind 0.0.0.0 --node-ip
  ${LIVEKIT_NODE_IP}`, ports 7880, 7881 and 7882/udp). Keep the compose project `open-telemed`
  and the `livekit` service: the `open-telemed-livekit-1` container is already running and must be reused.
  The kit's `app` service may stay, adjusted.
- `.env` / `.env.example` / `.env.test`: DB and Redis pointing to the Docker host on those ports,
  with a separate test database. Plus `LIVEKIT_URL=ws://<host-docker>:7880`,
  `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret` and `PLATFORM_HOSTS`, all validated in
  `start/env.ts`.

## 2. Domain

| Concept | Where |
|---|---|
| Clinic | the kit's `tenants`, with new columns for **branding** (logo_url, primary_color, accent_color, custom_hosts jsonb) and **legal data** (legal_name, cnpj, crm_pj, crm_pj_uf, technical_director_name, technical_director_crm, technical_director_uf), plus `webhook_url` and `webhook_secret` (encrypted with `encryption`) |
| Physician | kit user linked to the tenant + professional profile (crm, crm_uf, optional rqe) in a `professionals` table (tenant_id, user_id) |
| Patient | **has no account**: data lives in the consultation (name, optional document, reported location of the care) |
| Consultation | new `consultations` module (tenant-scoped): status `scheduled → waiting → in_progress → ended \| cancelled`, outcome `completed \| referred_in_person \| patient_declined \| no_show`, scheduled/started/ended_at, professional_id, integrator's external_id, `recording_allowed` (only the choice; it does not record) |
| Consent text | `consents` module: `consent_texts` (tenant_id, version, body, hash; **immutable**, changing creates a version) and `consents` (consultation_id, version, text_hash, accepted_at, ip, user_agent, optional legal representative). A default pt-BR text comes built in, covering art. 15, the physical exam limitation, the right to refuse and recording turned off |
| Patient link | `patient_links`: secret hash, expires_at. The secret goes in the `#fragment`, and the front end exchanges it for an anonymous session via POST |
| Video | service in `app/shared/` (or a `video` module) with `livekit-server-sdk`: room `t<tenantId>-<consultationId>`, `maxParticipants: 2`, token with a grant only for that room, metadata only `{ role }` |
| Audit | the kit's `audits` module: consented, joined the waiting room, admitted, joined, left, ended, outcome |

New permissions in the kit's seed (`consultations.*`, `professionals.*`, `consent_texts.*`,
`tenant_branding.update`) go to the right roles: the clinic owner gets everything; the physician sees and attends
their **own** consultations, through the kit's ownership check.

## 3. Screens

- **Panel (logged in, Inertia, with the active tenant's brand)**:
  - Consultations: list, create, detail with the patient link to copy.
  - **Physician room**: sees whether the patient is waiting and has consented → "Admitir" (Admit) → video →
    "Encerrar" (End) with the outcome, including "encaminhar ao presencial" (refer to in-person care).
  - Clinic settings: brand, legal data, consent text (new version) and webhook.
  - Professionals: CRM/state.
- **Patient (public, anonymous, white label)** `/c#<secret>`: camera and microphone test →
  consent text (accepting requires checking the box; recording is a separate choice and off) → waiting, which notifies
  by itself when admitted → video. The "prefiro atendimento presencial" (I prefer in-person care) button ends with
  `patient_declined`.
  - The footer shows legal name, CNPJ, CRM-PJ and technical director, because white label does not
    hide who is responsible.
  - The public page does **not** return logged-in user data.
- Tenant of the public page: by `Host`, checked against `custom_hosts` and `PLATFORM_HOSTS`. In dev
  `/t/<slug>/c#…` is served too. **Never** trust `X-Forwarded-Host` without `TRUST_PROXY`.
- Brand: the tenant's CSS variables, including LiveKit's `--lk-*`, logo and title.
- The call in pt-BR. If `VideoConference` does not accept labels, build it with `GridLayout`,
  `ParticipantTile` and `ControlBar`.
- Real-time waiting with short polling or SSE. Do not use LiveKit: the patient has no token yet.

## 4. Integrator API (for example Clínica Fácil)

Use the kit's **API tokens** of a tenant service user, with consultation-only permissions.
Routes under `/api/v1`:
- `POST /consultations` creates and returns the patient link and the physician room URL in the panel.
- `GET /consultations/:id` returns the record, with fields that map to the RAC.
- `POST /consultations/:id/cancel`.
- `GET /consultations/:id/audit`.

Document it in `docs/openapi.yaml`, which the kit already validates in tests. A resource from another tenant
answers **404**.

## 5. Webhooks

- **Inbound from LiveKit** `POST /webhooks/livekit`: validate with `WebhookReceiver`.
  `participant_joined`, `participant_left` and `room_finished` update the status and the audit.
- **Outbound to the integrator**: a job on the kit's Bull queue, with a JSON POST signed with HMAC-SHA256
  (`X-OpenTelemed-Signature`) on every status change and retries with backoff.
- In dev, LiveKit (on the remote host) cannot reach this machine. Test the handler with a signed payload in
  the tests.

## Out of scope for this stage

Prescription and medical certificate (ICP-Brasil), recording, FHIR/RNDS, CRM validation at CFM and a mobile app.

## Acceptance criteria

1. `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e` and `pnpm test:ui` pass. Run the test suites
   with few workers: the machine has 31 GiB and earlyoom has already killed a runaway runner.
2. Japa tests cover, at a minimum:
   - tenant A does not read, cancel or audit tenant B's consultation (404);
   - the patient does not receive a video token before consenting and being admitted;
   - a physician does not admit or get a token for a consultation that is not theirs;
   - the room has the tenant prefix and the token only has a grant for it;
   - a LiveKit webhook with an invalid signature is rejected;
   - a new consent text creates a version, and the old consent stores the version and hash it saw;
   - an unknown host does not resolve a tenant, and `X-Forwarded-Host` is ignored without `TRUST_PROXY`;
   - the public page does not leak data of whoever is logged in.
3. Dev seed with 2 clinics with different brands, each with a physician, a service user and one
   consultation. Links and logins are printed to the console.
4. Browser test with a fake camera (`--use-fake-device-for-media-stream`): the patient
   consents → waits → the physician admits in the panel → both see each other; clinic B shows a different
   brand. Screenshots at 390 and 1280 px.
5. pt-BR README updated.
