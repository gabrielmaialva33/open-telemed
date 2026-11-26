**English** · [Português](ux-plan.pt.md)

# UX/UI execution

Specification: `docs/spec-ux-ui.md`. Executed in the current checkout, without committing and without changing the Metronic source.

- [x] Demo 1 shell: isolate derivatives in `inertia/components/metronic/` and `inertia/css/metronic/`, preserve ReUI/Inertia, clinic branding, accessible drawer, pt-BR menu and NOTICE.
- [x] Home: service with the same scope as consultations and `canAttend`; today in Brasília time, current waiting and upcoming; cover isolation and clinical visibility.
- [x] Consultations: responsive table, filter, empty state, copy with feedback and an organized form. Room: clear state, large video and outcome in a dialog without changing guards.
- [x] Clinic and professionals: sections, brand preview and empty states. Auth: derived branded layout, pt-BR texts.
- [x] Patient: camera → consent text → waiting → video, accessible progress, legal footer, no access to window during rendering; test navigation and consent.
- [x] Full gate on Node 24 with limited memory and workers; real screenshots at 390/1280 on dev 3333; final review and `docs/ux-report.md`.

Risks to verify: active clinic after switching; physician versus manager without ownership; waiting for a consultation scheduled on another day; future consultations beyond the 100 in the list; copy refused by the browser; camera denied; consent not checked; dialog via portal keeping the brand; overflow and focus on mobile.

Final gate: lint and typecheck exit 0; Japa 241/241 (39 s), Vitest 70/70 in 15 files (4.61 s). Evidence and limits in `docs/ux-report.md`. Independent review and fixes completed; 33 screenshots at 390/1280 px.
