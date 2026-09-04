# fenzo-app UI Design Spec (2026-09-01)

Authoritative visual design for every screen/component the Phase-1 stories build. Written against the ACTUAL theme source (`src/theme/*`) and the established screens (Home, Jobs, Customers, More, NewJob, sheets) so everything below composes existing tokens/components — nothing invents style. Stories reference sections here; a dev agent must not improvise visuals beyond this spec + DESIGN_SYSTEM.md.

Design research inputs: field-service technician app patterns (progress "N of 6" visible at a glance, current step unmistakable, ONE primary action at the bottom, checklist never buried) and offline-first UX guidance (pending = calm neutral, never alarm colors; labels Pending/Syncing/Failed; queued work always visibly acknowledged).

## §0 Design language cheat-sheet (exact tokens — verified in source)

- Screen scaffold: `SafeAreaView` edges top, bg `colors.surfacePage` (#F9FAFB), content padding `spacing.s4` (16), list item gap `spacing.s3` (12).
- Card: bg `colors.surfaceCard` (#FFF), 1px `colors.borderSubtle` (#E5E7EB), `radius.lg` (14), `shadow.sm`, `padding="md"` = s4, internal `gap: spacing.s2`.
- Sheet (Modal): scrim `colors.scrim`, top corners `radius.xl` (20), `shadow.sheet`, grabber 40×4 `colors.borderDefault` pill centered, title `typography.title` @22, form gap `spacing.s4`, KeyboardAvoidingView.
- Type roles: `title` 28 semibold (screens often override fontSize to 20–24 for section headers — Home uses 20, Today greeting 24), `heading` 18 semibold (card titles, names), `body` 16, `bodyStrong` 16 semibold, `bodySm` 14, `label` 14 medium, `labelStrong` 14 semibold, `caption` 12. Text colors: `textStrong` #111827, `textBody` #374151, `textMuted` #6B7280, `textDisabled` #9CA3AF.
- Status palette (`colors.status.<key>` where key ∈ done|progress|scheduled|cancelled|neutral): each has `fg` (700 shade), `bg` (50 shade), `solid` (500/600), `border` (200). **StatusKey is `progress`, NOT `inProgress`.** Badge labels fixed: Done / In Progress / Scheduled / Cancelled (this exact casing is the one title-case exception).
- Buttons: variants primary (blue solid, `shadow.primary`) | secondary (white, borderDefault) | ghost | danger (red solid); sizes sm/md/lg (md=44, lg≈52); press scale 0.97. IconButton press 0.92.
- Icons: lucide-react-native, stroke 2 (1.5 for large empty-state icons), 15px inline meta, 18–20px row leading, 22–24px headers.
- Meta row pattern (established in JobCard): `flexDirection row, gap s2, icon 15 textMuted, bodySm textMuted`.
- Empty state: `EmptyState` icon 36 `colors.primary` stroke 1.5 + title + description.
- Inline error: `InlineError` component; banners sit in a `paddingHorizontal s4` wrap.
- Dividers: 1px `colors.borderSubtle`.
- Back header pattern (full-screen routes like Technicians/NewJob — reuse it): row `paddingHorizontal s4, paddingVertical s2, gap s3`: IconButton(ChevronLeft) + `typography.title` @20 title, optional right slot.
- Times 12-hour "2:00 PM"; dates "12 Aug 2026" (`en-IN` short month); money ₹ Indian grouping (unused in Phase 1 — no amounts exist).
- No emoji, sentence case, flat backgrounds, no gradients.

## §1 JobCard v2 (Story 1.1; pending state Story 4.3)

Keeps the existing anatomy (header row / meta rows / divider / footer) — deltas only:
- Header row: title = `customerName` prop when provided, else `serviceTypeLabel(job.serviceType)` (technician side pre-sync). Right: `<Badge status dot>` unchanged.
- NEW jobNumber line? NO — keep the card clean; jobNumber lives on detail. Instead the FIRST meta row becomes: service icon + `description ?? serviceTypeLabel` (unchanged pattern).
- Second meta row: Clock icon + `formatTimeLabel(scheduledStart, scheduledEnd)`.
- Urgent: when `priority === 'urgent'`, a small leading `<Badge status="cancelled" tone="soft" size="sm">Urgent</Badge>` sits LEFT of the status badge in the header row (two badges, gap s2). Red communicates urgency without a new color.
- Footer row: Avatar + technician name (owner list resolves name from roster; technician side omits the footer entirely — it's themselves). **Amount is deleted** with nothing in its place; footer becomes left-aligned.
- Pending (technician, Epic 4): a third meta row `CloudOff 15 colors.status.scheduled.fg` + bodySm `colors.status.scheduled.fg` "Waiting to sync" — amber = pending vocabulary, calm not red.
- Service type → label map: ac_service "AC service", ac_installation "AC installation", pest_control "Pest control", plumbing "Plumbing", electrical "Electrical", other "Service". Icon map: plumbing→Droplet, ac_*→Snowflake, else→Wrench.
- statusToBadge: scheduled→scheduled, in_progress→**progress**, completed→done, cancelled→cancelled. Labels come from the existing STATUS_LABEL map.

## §2 Jobs filters (Story 1.1; revised by the 2026-09-04 chip-clutter redesign)

Two rows, strict hierarchy — never two shouting rows:

1. **Scope (view switching)** — `SegmentedControl`: sunken `surfaceSunken` track, `radius.md`, 4 equal segments (`radius.sm`, `touch.min` 44px each), raised `surfaceCard` + `shadow.sm` on the active segment, `textStrong` label. Today · Upcoming · Overdue · History. Pressing the active segment is a no-op.
2. **Status (filter)** — `StatusFilterBar` chip row: pill chips, `surfaceCard` bg + `borderDefault` when unselected; active chip is a **soft tint** (`primarySoft` bg, `primary` border, `primaryHover` label) — never solid `primary`, which stays reserved for primary actions (New job). Labels All / Scheduled / In progress / Done / Cancelled (sentence case — controls, not the Badge vocabulary).

Row visibility per scope: all five status chips under Today; All/Done/Cancelled under History; **no status row under Upcoming/Overdue** (the server pre-narrows status there — chips would lie). Never show more than one chip row at a time.

Contrast (WCAG AA, verified 2026-09-04): `primaryHover #1645B2` on `primarySoft #EFF4FE` ≈ 7.6:1; `textBody #4B5563` on `surfaceSunken #F3F4F6` ≈ 7.4:1 — both pass for the 14px semibold labels.

Decision record (2026-09-04): three mockup options were explored and **A** (segmented control + contextual chips) was chosen over **B** (two tamed rows — still two stacked rows, clutter remains) and **C** (one merged row — mixes view switching with filtering, breaks at 4+4 options and hides scopes from Upcoming/Overdue). The mockup file was deleted after the decision; this record is why A won.

## §3 Owner Job Detail screen (Story 1.2)

Full-screen route, back header (§0) with title = jobNumber (e.g. "JB-2026-0042").
ScrollView, content padding s4, section gap s4. Top-to-bottom:
1. **Header card** (Card md): row 1 = status Badge + optional Urgent badge (gap s2); row 2 = `heading` service line: `serviceTypeLabel` (textStrong); row 3 meta rows (icon 15 + bodySm muted): Calendar "12 Aug 2026", Clock "2:00 – 4:00 PM" (omit line 2 time row when no end: single time), MapPin `serviceLocation`; row 4 (only when currentStep non-null and status in_progress): small progress line `labelStrong colors.status.progress.fg` "Step 3 of 6 — Work started" (N = index+1; label from STEP_LABELS). If `description`: divider then body textBody paragraph. If `notesForTechnician`: divider then label muted "Notes for technician" + body.
2. **Actions slot** (`testID job-detail-actions`): empty View this story; 1.3 fills (see §5).
3. **Customer card**: SectionCard title "Customer"; PersonRow (§4) name/phone; below, when address: meta row MapPin + `address, city`.
4. **Technician card**: SectionCard "Technician"; PersonRow; when skills.length: meta row Wrench + skills.join(', ') (bodySm muted, numberOfLines 2).
5. **Photos & signature** (only when attachments non-empty): SectionCard "Photos & signature"; AttachmentGrid (§4).
6. **Activity**: SectionCard "Activity"; ActivityTimeline (§4).
States: loading = centered ActivityIndicator on surfacePage; error (network) = InlineError + Retry button (secondary, auto width) centered; 404/403 = centered EmptyState (icon FileQuestion 36 primary) title "This job isn't available" description "It may have been removed or reassigned." + Button secondary "Go back". Pull-to-refresh on the ScrollView.

## §4 Shared detail components (Story 1.2 — reused by 2.1, 3.2)

- **SectionCard**: Card md; header `labelStrong` textMuted UPPERCASE? NO — sentence case `heading` @16 textStrong, marginBottom s2; children below.
- **PersonRow**: row gap s3, minHeight touch.min: Avatar (size md, initials), middle column (name `bodyStrong` textStrong; sub-line `bodySm` textMuted optional), trailing phone affordance = IconButton(Phone 18, primary) 44px hit — the WHOLE row is NOT pressable, only the phone button (prevents accidental calls).
- **ActivityTimeline**: vertical list; each row: left rail = 8px dot (`colors.status.progress.solid` for step_* events, `colors.textDisabled` for job_created/neutral, `colors.status.cancelled.solid` for job_cancelled, `colors.status.done.solid` for step_completed) + 1px connector line `borderSubtle` between dots; right: `body` textBody label (eventLabel) + `caption` textMuted timestamp "12 Aug, 2:14 PM". Row gap s3. No cards per row — flat inside the SectionCard.
- **AttachmentGrid**: photos = 3-column grid (gap s2, tiles square, `radius.md` 10, bg surfaceSunken while loading, Image cover). Null-url tile: surfaceSunken bg + ImageOff icon 20 textDisabled + caption "Tap refresh" centered. Signature: full-width row below the grid — label muted "Customer signature" + white tile (border borderSubtle, radius.md, height 96, Image contain, padding s2). Optional `onRecapture` prop renders a ghost sm Button "Re-capture" right-aligned under the tile (3.5).

## §5 Edit job sheet + cancel dialog (Story 1.3)

- Actions slot content (scheduled jobs only): row gap s3 — Button secondary md flex-1 "Edit job" + Button ghost md "Cancel job" with label color `colors.danger` (danger-text ghost; NOT the solid danger variant — destructive-secondary pattern, consistent with MoreScreen's red logout row).
- EditJobSheet: standard sheet chrome (§0). Title "Edit job", subtitle bodySm muted "Only scheduled jobs can be edited." Form order: Description (Input multiline 3), Schedule (DateTimeFields as in NewJob), Notes for technician (Input multiline 3), Priority (two side-by-side selectable pills: "Normal" / "Urgent" — selected = primarySoft bg + primary border + primary labelStrong; unselected = surfaceCard + borderDefault + textBody; height touch.min), Technician (TechnicianPicker rows: Avatar + name + skills caption + trailing check circle when selected). Footer: Button primary lg fullWidth "Save changes" (loading state), disabled when diff empty. Inline error line (bodySm danger) above the footer.
- Cancel dialog: native `Alert.alert('Cancel job', 'The technician will no longer see this job.', [{text:'Keep job', style:'cancel'}, {text:'Cancel job', style:'destructive'}])`.

## §6 Customer Detail (Story 2.1)

Back header title = customer name. FlatList padding s4.
- **ListHeader**: Profile card (Card md): Avatar lg + name `title`@20 + phone PersonRow-style phone IconButton; meta rows: Phone formatted number (text, muted), MapPin `customerLocation(customer)`; caption muted "Customer since 12 Aug 2026". Then section header row (marginTop s4): `heading`@16 "Job history" + right `caption` muted count when known.
- **HistoryRow** (Card md, interactive when row.id): row 1 = `bodyStrong` jobNumber + Badge (statusToBadge) right; row 2 meta rows: Calendar date, service icon + serviceTypeLabel. Rows gap s3 via separator.
- Empty history: EmptyState inside the list area (icon Briefcase) title "No jobs yet" description "Jobs for this customer will appear here."
- Footer spinner while isLoadingMore. Pull-to-refresh. 404 view mirrors §3's.

## §7 Technician Today & History (Story 3.1)

- Today: keep the greeting header (title 24). Below it (Story 4.3 adds the sync line here). SectionList: **section headers** = `labelStrong` textMuted UPPERCASE tiny? No — sentence case `labelStrong` textMuted with letterSpacing caps? Use the eyebrow pattern: `caption` semibold, letterSpacing 0.06em equivalent (letterSpacing: 0.72), color textMuted, text UPPERCASE — "IN PROGRESS", "SCHEDULED", "DONE TODAY" — the one allowed caps use (DESIGN_SYSTEM: caps only for tiny letter-spaced eyebrow labels). paddingVertical s2.
- Cards: JobCard v2 technician variant (no footer). In-progress section cards get a 3px left accent? NO extra chrome — the Badge already carries state; keep cards uniform.
- History: FlatList of JobCard v2, footer spinner on load-more.
- Empty Today: existing EmptyState (CalendarCheck) copy unchanged. Empty History: EmptyState (History icon) title "No past jobs yet" description "Completed and cancelled jobs will show up here."

## §8 Technician Job Detail (Story 3.2)

Back header title = jobNumber; right slot = Badge (status). ScrollView padding s4 gap s4; bottom padding s20 to clear the action bar (§9).
1. **Progress card** (Card md): row 1 `labelStrong` textMuted "Progress" + right `labelStrong` colors.status.progress.fg "N of 6" (N = done steps count; "Done" when completed). Below: WorkflowStepper (§9).
2. **Customer card**: SectionCard "Customer": PersonRow (phone IconButton); address row = Pressable meta row (MapPin 15 primary + bodySm `colors.textLink` address, city + trailing Navigation icon 15 primary) → openMaps; 44px min height.
3. **Job info card**: SectionCard "Job details": meta rows Calendar date, Clock time range, service icon + serviceTypeLabel; when description: divider + body textBody.
4. **Owner notes card** (only when notesForTechnician): Card md with bg `colors.status.scheduled.bg`, border `colors.status.scheduled.border` — heading@16 `colors.status.scheduled.fg` "Notes from owner" + body textBody. Amber tint = "read this before starting".
5. **Photos card** (non-terminal jobs even when empty — the add tile invites): SectionCard "Photos" + PhotoSection (§10). Terminal + empty → omit card.
6. **Signature card**: SectionCard "Customer signature": signature tile per §4, or (non-terminal, none yet) dashed placeholder tile (borderDefault dashed 1.5, radius.md, height 96, centered PenLine 20 textMuted + caption "Captured at the signature step").
7. **History disclosure**: Pressable row (minHeight touch.min): heading@16 "History" + trailing ChevronDown/Up 20 textMuted; expanded → ActivityTimeline. Collapsed by default.
States: loading spinner; 403 EmptyState (UserX icon) title "This job is no longer assigned to you" description "It may have been reassigned." + "Go back" button; 404 as §3; offline fallback (4.1) renders the same layout from cache with §10's offline tiles and no phone/skills rows when absent.

## §9 WorkflowStepper + bottom action bar (Stories 3.2 render, 3.3 interact, 4.2/4.3 pending)

**Stepper rows** (inside Progress card; vertical, gap 0, each row minHeight 44):
left rail column (width 24, centered): state glyph + 2px connector line (`borderSubtle`; segment above a DONE row uses `colors.status.done.border`).
- done: filled circle 22 `colors.status.done.solid` + Check 14 white.
- next: circle 22 border 2 `colors.primary`, inner dot 8 primary; row label `bodyStrong` textStrong; right side `caption` primary "Up next".
- locked: circle 22 border 2 `borderDefault`, empty; label `body` textDisabled.
- skipped: circle 22 border 1.5 DASHED borderDefault; label `body` textMuted + right `caption` textMuted "Skipped".
- pending (optimistic, Epic 4): like done but circle `colors.status.scheduled.solid` amber + Check white; right `caption` colors.status.scheduled.fg "Waiting to sync".
Row right column: step label (STEP_LABELS) + below it `caption` textMuted timestamp when done ("2:14 PM").

**Bottom action bar** (3.3): absolutely positioned bottom, full width, bg surfaceCard, top border borderSubtle, padding s4 + safe-area bottom, `shadow.sheet`-style upward `shadow.md`. Contains ONE Button primary lg fullWidth with the step label ("On my way" / "Arrived" / "Start work" / "Capture signature" / "Mark complete"), loading while posting. Terminal or completed-step jobs render NO bar (scroll padding shrinks accordingly).
**Photo-required hint** (requireCompletionPhoto && currentStep === in_progress): the bar shows, instead of a button, an info row: Camera icon 18 `colors.status.progress.fg` + bodySm textBody "Upload a photo to continue" on `colors.status.progress.bg` pill (radius.md, padding s3) — not tappable; the Photos card above carries the action.
**Completed moment**: replace bar content with row: CheckCircle2 20 colors.status.done.solid + bodyStrong colors.status.done.fg "Job completed" (static, no animation loops).

## §10 PhotoSection (Story 3.4)

3-column grid, gap s2, tiles square radius.md:
- Confirmed tile: Image cover.
- In-flight tile: local-uri Image cover + full-tile overlay `rgba(17,24,39,0.45)` (scrim) + centered small ActivityIndicator white + `caption` white phase word below ("Preparing" | "Uploading" | "Saving").
- Failed tile: image dimmed (opacity 0.5) + overlay bottom strip bg cancelled.bg: caption cancelled.fg "Failed" + RefreshCw 14 cancelled.fg — whole tile pressable = retry (min 44 via tile size).
- Waiting-to-sync tile (4.2 queued confirm): image + bottom strip scheduled.bg: caption scheduled.fg "Waiting to sync".
- Offline tile (4.1 cache, no url): surfaceSunken + ImageOff 20 textDisabled + caption textMuted "Available online".
- Add tile: dashed 1.5 borderDefault, radius.md, centered Plus 22 primary + caption primary "Add photo"; disabled state (limit): borderSubtle, Plus textDisabled, caption textDisabled "Limit reached (5)".
- Below-grid caption textMuted: "Up to 5 photos · JPG, PNG or HEIC · max 10 MB". Per-file validation errors: InlineError line under the grid, auto-dismiss on next action.
- Choice: `Alert.alert('Add photo', undefined, [Take photo, Choose from gallery, Cancel])` (native sheet keeps it dependency-free).

## §11 Signature screen (Story 3.5)

Customer-facing = extra polish. Back header title "Customer signature". Column padding s4 gap s4:
1. `body` textBody instruction: "Please ask the customer to sign below."
2. Pad card: flex-1 (min height 320), Card chrome (white, borderSubtle, radius.lg) with inner signature canvas edge-to-edge (radius clipped); a 1px dashed baseline `borderDefault` sits at 70% height with `caption` textDisabled "Sign here" centered beneath it until first stroke (hide both on stroke).
3. Error line (bodySm danger) when upload fails — drawing preserved.
4. Footer row gap s3: Button secondary md flex-1 "Clear" + Button primary md flex-1 "Save signature" (disabled until stroke; loading through upload+advance).
Offline (4.2/4.3): Save disabled + helper caption textMuted under footer "Signature upload needs internet." Pen: colors.textStrong ~2.5 width; pad bg white.

## §12 Connectivity visuals (Story 4.3)

- **OfflineBanner**: pinned ABOVE the tab bar (TechnicianRootNavigator level, absolute, safe-area aware): height 36, bg `colors.status.scheduled.bg`, top+bottom hairline scheduled.border, row centered gap s2: CloudOff 15 scheduled.fg + `label` scheduled.fg "You're offline — changes will sync automatically". Syncing state: bg `colors.status.progress.bg`, RefreshCw 15 progress.fg + "Syncing…" progress.fg. Hidden otherwise. 150ms fade (motion.durationFast/Base), no slide bounce.
- **Pending pill** (Today header, right of greeting): Badge status="scheduled" dot size md → "2 waiting to sync" (count from queue); hidden at 0.
- **Last-synced row** (Today, under greeting): Pressable row minHeight 32: RefreshCw 13 textMuted + `caption` textMuted "Last synced 5 min ago" (or "Syncing…" with tiny spinner replacing icon). Disabled look offline (textDisabled). Tap = manual pipeline.
- Card/stepper pending styles: §1 / §9.

## §13 Skills (Story 5.1)

- More tile: reuse the Settings-row structure — icon box (36, radius.md, primarySoft bg, Wrench 18 primary), title `heading`@16 "Skills", subtitle bodySm muted "Manage service skills", ChevronRight.
- SkillsScreen: back header "Skills" + right slot Button primary sm "Add". List of Card md rows: left column (bodyStrong name; caption muted "Added 12 Aug 2026"), trailing IconButton(Trash2 18, `colors.danger`) 44px. Separator s3. EmptyState (Wrench) title "No skills yet" description "Add skills so you can assign them to technicians." + Button primary "Add a skill". Loading spinner; InlineError + retry.
- AddSkillSheet: sheet chrome; title "Add a skill"; Input placeholder "e.g. AC repair" autoFocus maxLength 100; inline duplicate error bodySm danger "This skill already exists"; footer Button primary lg fullWidth "Add skill" (disabled empty, loading).
- Delete: `Alert.alert('Delete skill', 'It will also be removed from any technicians who have it.', [Cancel, Delete·destructive])`.

## §14 Profile edit + session notice (Stories 5.2, 5.3)

- Edit affordance: IconButton(Pencil 18, textMuted) 44px at the trailing edge of the account row (owner More) / identity card (technician Profile), accessibilityLabel "Edit name".
- EditNameSheet: sheet chrome; title "Edit your name"; Input prefilled autoFocus maxLength 100; footer Button primary lg fullWidth "Save" (disabled unchanged/empty, loading); inline bodySm danger error.
- Session-expired notice (PhoneScreen, above the form): InlineError-style banner: bg cancelled.bg, border cancelled.border, radius.md, padding s3, row gap s2: Info 16 cancelled.fg + bodySm cancelled.fg "Session expired — please log in again." + trailing IconButton(X 16) dismiss.

## §15 Copy inventory (single source — sentence case, no emoji)

Buttons/actions: Edit job · Cancel job · Keep job · Save changes · On my way · Arrived · Start work · Capture signature · Mark complete · Add photo · Take photo · Choose from gallery · Clear · Save signature · Re-capture · Add · Add skill · Add a skill · Delete · Save · Go back · Retry.
Titles: Customer · Technician · Job details · Photos · Photos & signature · Customer signature · Activity · History · Notes from owner · Progress · Skills · Edit job · Add a skill · Edit your name.
Statuses/labels: Up next · Skipped · Waiting to sync · Syncing… · Failed · Preparing · Uploading · Saving · Limit reached (5) · Urgent · N of 6 · Step N of 6 — <step label>.
Messages: You're offline — changes will sync automatically. · Last synced <relative>. · Upload a photo to continue · Job completed · This job isn't available · It may have been removed or reassigned. · This customer isn't available · It may have been removed or is from another company. · This job is no longer assigned to you · It may have been reassigned. · This job has already started and can't be changed · This job can no longer be updated · That technician is no longer available · Only scheduled jobs can be edited. · The technician will no longer see this job. · It will also be removed from any technicians who have it. · This skill already exists · No skills yet · Add skills so you can assign them to technicians. · No jobs yet · Jobs for this customer will appear here. · No past jobs yet · Completed and cancelled jobs will show up here. · Please ask the customer to sign below. · Sign here · Signature upload needs internet. · Up to 5 photos · JPG, PNG or HEIC · max 10 MB · Only JPG, PNG or HEIC up to 10 MB · Camera permission is needed to take photos · Photo limit reached (5) · Available online · Tap refresh · Session expired — please log in again. · Customer since <date> · Added <date> · Captured at the signature step.
