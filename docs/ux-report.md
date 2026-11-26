**English** · [Português](ux-report.pt.md)

# UX/UI report — Open Telemed

11/26/2026 · Scope: `docs/spec-ux-ui.md`. Implemented in the current checkout, with no commit, staging, push or change to `LICENSE`. The original Metronic distribution was only consulted.

## Layout and origin

**Demo 1** was chosen: a classic sidebar, fixed header and wide content suit scheduling, clinic management and consultations. The mobile drawer reuses the existing Sheet/ReUI; navigation and clinic switching remain in Inertia. No dependency was added.

Isolated derivatives, all with an attribution header, also listed in `NOTICE`:

| File                                             | Origin/adaptation                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `inertia/components/metronic/shell.tsx`          | `layouts/demo1/layout.tsx`, sidebar, sidebar-header and header; active brand, drawer and React/Inertia structure |
| `inertia/components/metronic/sidebar_nav.tsx`    | Demo 1 navigation composition integrated with the kit's menu and permissions                                     |
| `inertia/components/metronic/header_actions.tsx` | Demo 1 header composition integrated with the kit's clinic/user menus                                            |
| `inertia/components/metronic/auth_layout.tsx`    | `auth/layouts/branded.tsx`, without the distribution's images or logos                                           |
| `inertia/css/metronic/demo1.css`                 | `css/demos/demo1.css`, adapted to the component scope and the Tailwind layer order                               |

The adapters in `inertia/layouts/` point to these components. Existing ReUI was reused. As per the specification's decision, **the checkout with these commercial derivatives must not be published as open source**; removing the dependency requires replacing these folders and their imports/adapters.

## Delivery per screen

- **Shell:** active clinic at the top, configured logo or fallback symbol; "Início" (Home), "Consultas" (Consultations), "Profissionais" (Professionals) and "Clínica" (Clinic) with distinct icons. Files, Settings, the kit's generic administration and demos were removed from the menu. Drawer with managed focus, closing on navigation and a skip-to-content link. Menus in a portal receive the brand; saving the brand updates the shell immediately.
- **Home:** today's schedule in Brasília time, patients waiting right now and six upcoming consultations starting tomorrow. Waiting includes patients whose scheduled date is not today. A manager sees the clinic; a doctor sees their consultations. Direct access to the room depends on `canAttend`. Refresh every ten seconds. The metric “Encerradas da agenda de hoje” (Finished from today's schedule) does not confuse absence/refusal with a completed consultation.
- **Consultations:** a table that reflows on mobile, status filter, badges in Portuguese, an empty state with filter clearing and a scheduling form with guidance. The existing limit of one hundred consultations was kept, now explicit. Patient link with copy confirmation and a manual alternative if the browser refuses.
- **Detail/room:** state and consent are evident; admission as the primary action. Video takes the full available width before the details. Closing opens a dialog with the outcome and confirmation. Attendance and cancellation guards preserved.
- **Clinic/professionals:** sections Brand, Legal data, Terms and Webhook, shortcuts and a live brand preview; team with a counter, empty state and organized creation/editing.
- **Patient:** camera → terms → waiting → video, one step at a time, accessible indicator, return to the camera, wide buttons and a legal footer in all steps. Consent and recording remain unchecked initially. Route base obtained from Inertia, without consulting `window` in the component body.
- **Auth:** branded layout, texts in Portuguese, brand of the clinic's domain or Open Telemed on the platform; login error visible. The development tools button was removed from the product screens.

No migration, authorization rule, clinical transition or API contract was changed. `visibleQuery` extracts the list's existing filter for Home; `ConsultationAccessService` was not modified. The public page keeps the block on sharing authenticated data.

## Final gate

| Command                       | Result                                                        |
| ----------------------------- | ------------------------------------------------------------- |
| `pnpm lint`                   | Exit 0; **0 errors**                                          |
| `pnpm typecheck`              | Exit 0; **0 errors**, backend and frontend                    |
| `pnpm test:e2e`               | **241/241 tests**, exit 0, 39 s; unit, functional and browser |
| `pnpm test:ui --maxWorkers=2` | **70/70 tests in 15 files**, exit 0, 4.61 s                   |
| `git diff --check`            | Exit 0                                                        |

Node **24.21.0** via Mise. Japa sequential in a scope with `MemoryHigh=8G`, `MemoryMax=10G`, `MemorySwapMax=2G`, `OOMPolicy=kill`; Vitest with two workers, limits 4G/6G/1G. Logs in `~/.cache/agents/2026-11-26-open-telemed-ux/`, files `lint-final.log`, `typecheck-final.log`, `e2e-final.log`, `ui-final.log` and `screenshots.log`.

New regressions: tenant/doctor scope, dashboard-only permission, day boundaries in Brasília, waiting from another date, upcoming consultations beyond the hundred in the list, login branding by domain, filter/empty state, dialog, steps/consent, refused copy, brand update and portals. Existing rule tests were preserved. In the browser, there is a check of LiveKit's internal theme, absence of overflow and content below the header.

There was RED/GREEN for filter/dialog, patient steps, overview, brand and login feedback. An independent static review found the brand update, portals and the metric label; all three were fixed. Visual inspection also fixed the header CSS layer and the blue defined internally by the LiveKit theme. Two new host fixtures were adjusted to Vite's existing allowlist, without changing its configuration. Non-blocking warnings remain from pnpm about a missing configuration variable and from LiveKit when closing DataChannels. The build was not run in this stage.

## Screenshots and visual verification

**33 real PNGs** from the server `http://localhost:3333`, at **390 and 1280 px**, inspected. Index and measured colors in [`screenshots/ux/verification.json`](screenshots/ux/verification.json).

| Screen               | 390 px                                              | 1280 px                                              |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Aurora Home, manager | [open](screenshots/ux/aurora-home-390.png)          | [open](screenshots/ux/aurora-home-1280.png)          |
| Aurora Consultations | [open](screenshots/ux/aurora-consultations-390.png) | [open](screenshots/ux/aurora-consultations-1280.png) |
| Aurora Detail        | [open](screenshots/ux/aurora-detail-390.png)        | [open](screenshots/ux/aurora-detail-1280.png)        |
| Aurora Room          | [open](screenshots/ux/aurora-room-390.png)          | [open](screenshots/ux/aurora-room-1280.png)          |
| Aurora Clinic        | [open](screenshots/ux/aurora-clinic-390.png)        | [open](screenshots/ux/aurora-clinic-1280.png)        |
| Horizonte Room       | [open](screenshots/ux/horizonte-room-390.png)       | [open](screenshots/ux/horizonte-room-1280.png)       |
| Patient: camera      | [open](screenshots/ux/patient-camera-390.png)       | [open](screenshots/ux/patient-camera-1280.png)       |
| Patient: terms       | [open](screenshots/ux/patient-consent-390.png)      | [open](screenshots/ux/patient-consent-1280.png)      |
| Patient: waiting     | [open](screenshots/ux/patient-waiting-390.png)      | [open](screenshots/ux/patient-waiting-1280.png)      |
| Patient: video       | [open](screenshots/ux/patient-video-390.png)        | [open](screenshots/ux/patient-video-1280.png)        |
| Login                | [open](screenshots/ux/login-390.png)                | [open](screenshots/ux/login-1280.png)                |

Extras: doctor's Home, professionals, room before admission in both clinics, closing dialog and mobile drawer. Capture with two isolated contexts, simulated camera/microphone and two decoded video tracks per participant; **zero JavaScript exceptions**. On LiveKit's internal element, Aurora uses `#0f766e` and Horizonte `#6d48a5`.

## Delivered state and limits

Dev is active again on port **3333**, via the transient user unit `open-telemed-ux-dev.service`, with Node 24 and limited memory. The captures created synthetic demo consultations through the interface; the calls were ended and abandoned attempts were cancelled, preserving audit/consents. One future consultation remains available in the schedule. Only the four login counters of the demo users used in the captures were cleared, after reaching the attempt limit.

No commit or change to the index: SHA-256 of `git ls-files -s` before/after `6ef9df12ed6bba7289810e72195280a2f79f8412a3a3ac36b7afe2a8ebd51fa1`. `docs/spec-ux-ui.md` was already untracked and was preserved.

Left for later: server-side pagination/filtering beyond the existing hundred consultations, schedule search, and certification with physical devices, Safari/Firefox and public network/TURN. There was no test with a physical camera, deploy or change to clinical items outside this specification.
