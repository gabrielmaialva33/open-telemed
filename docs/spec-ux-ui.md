**English** · [Português](spec-ux-ui.pt.md)

# Spec: open-telemed UX/UI with Metronic

The panel and the patient page work, but look like a raw kit. One example: in the menu, "Consultas" and
"Dashboard" use the same house icon, and "Dashboard" and "Settings" are still in English. Goal: make
open-telemed look like a product, with **Metronic v9.5.0** as the visual base.

## Metronic: the owner's decision

- He bought Metronic and chose to **copy its code** (components, layout, CSS and icons) into
  the repo, instead of using it only as a reference.
- Accepted consequence: as long as there is Metronic code, the repo **cannot be published** as
  open source. Metronic's license is Envato's, commercial and single-use.
- To keep the exit open, every file copied or derived from Metronic stays **identifiable and
  removable**:
  - in its own folder (suggestion: `inertia/components/metronic/` and `inertia/css/metronic/`);
  - with a 1-line header:
    `// Derivado do Metronic v9.5.0 (Keenthemes), licença comercial: não redistribuir.`
- Note this in the `NOTICE`. Do not touch `LICENSE`: the license is the owner's decision.
- Source: `~/Projects/personal/metronic-v9.5.0/`. **Read-only**: change nothing there.
  - `metronic-tailwind-react-demos/typescript/vite/src/layouts/demo1..demo10`: complete layouts
    (sidebar, header, toolbar). Pick **one** and justify it in the report. demo1, with a
    classic sidebar, is the likely starting point.
  - `metronic-tailwind-react-starter-kit/typescript/vite/src/components/layouts/layout-*`:
    layout variations.
  - `figma/Metronic_v9.5.0.fig`: the design.
- Metronic React uses React 19, Tailwind 4, radix-ui, lucide and ReUI components. The kit's
  `inertia/components/ui/` folder already has those same ReUI components: reuse them instead of
  duplicating. Metronic uses `react-router`; here navigation is Inertia (`Link` and `router` from
  `@inertiajs/react`), and no react-router comes in.

## What to improve

1. **Panel shell** (`inertia/layouts/main/`): sidebar, header, clinic switcher and user menu
   in the style of the chosen layout.
   - Menu in pt-BR, with its own distinct icon for each item. Today `sidebar.tsx` repeats `Home`
     and `Settings`.
   - At the top of the sidebar go the logo and the name of the **active clinic** (white label). "Open Telemed" only
     shows when there is no clinic.
   - Mobile: menu in a drawer, no horizontal scrolling.
2. **Início (Home) instead of "Dashboard"**: a screen that is useful to whoever attends. It shows today's
   consultations, who is **in the waiting room right now** (highlighted and with a direct action to the room) and the
   upcoming consultations. The kit's cards that have nothing to do with telemedicine go away. The manager sees the
   clinic summary, and the physician sees their own consultations, respecting the permissions that already
   exist.
3. **Consultations**: list as a table or data grid with a status filter, pt-BR status badges
   and a decent empty state. The new consultation form and the detail get a clear hierarchy,
   and the patient link gets a copy button and feedback.
4. **Physician room**: patient state (waiting, consented, in the waiting room) clearly visible, and
   "Admitir" (Admit) as the primary action. The video takes up the usable area, and "Encerrar" (End) with the outcome goes in a
   dialog.
5. **Clinic and Professionals**: settings in tabs or sections (Brand, Legal data, Consent text,
   Webhook), with a brand preview.
6. **Patient** (`/c`, public): designed for mobile first. Shows one step at a time (camera,
   consent text, waiting, video), with a progress indicator, short texts and a big button. The legal
   footer keeps showing.
7. **Login** and the auth screens in Metronic's look, with the brand.
8. Kit items that do not serve the product leave the menu: the demos are already off, but check
   "Settings" and "Files". Translate whatever stays.

## Rules that do not change

- **No business or authorization rule changes.** Examples: `canAttend` (only the consultation's
  physician admits, gets a token and ends) and the consent text → waiting → admitted flow. This includes not
  hiding or showing a control that the rule decides today.
- **White label**: the clinic's color (`--brand` and the existing CSS variables, including LiveKit's
  `--lk-*`) keeps controlling the primary. Test with the seed's two clinics: Aurora
  is green and Horizonte is purple. Metronic cannot hard-code its blue.
- The public page keeps carrying no data of whoever is logged in.
- All interface text in pt-BR. Identifiers and code comments in English.
- SSR: no `typeof window` in the component body.

## Environment

- A `pnpm dev` is already running at http://localhost:3333: Claude started it, for the owner to look at. Use
  that server for the screenshots.
- If it gets in the way of the browser suite (for example, a fight over Vite's port 24678), you may
  stop it. At the end, leave a `pnpm dev` running again on 3333.
- Seed logins: README, password `TelemedDemo2026!`.
- The dev database is on the Docker host, port 5434. Tests use `open_telemed_test`.
- Node 24: `mise exec node@24.21.0 -- pnpm …`.
- Suites with few workers and inside a memory-limited scope (the machine has 31 GiB and
  earlyoom has already killed a runner), for example:
  `systemd-run --user --scope -p MemoryHigh=14G -p MemoryMax=16G -p MemorySwapMax=2G -p OOMPolicy=kill -- pnpm test:e2e`.
- **Do not commit**: the owner commits.

## Acceptance criteria

1. `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e` and `pnpm test:ui` pass. A test that only checked
   old text or structure may be updated. A rule test (access, tenant, consent)
   must not be loosened.
2. Screenshots at 390 and 1280 px, in `docs/screenshots/ux/`:
   - Início, Consultations, detail, physician room and Clinic, with Aurora;
   - the same room with Horizonte, to prove white label;
   - the patient's 4 steps;
   - the login.
3. Short report in `docs/ux-report.md`: the Metronic layout chosen and why, what
   was copied (list of files), what changed on each screen and what was left for later.
