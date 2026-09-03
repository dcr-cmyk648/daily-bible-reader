# Show prepared studies in the calendar

## Goal

Make every calendar date communicate, subtly but unambiguously, whether its study is actually present in the server-provided prepared-reading prefix, without confusing preparation with Dustin/Shane completion.

## Requirements

- Use only the authoritative `preparedReadingIds` membership already returned by bootstrap; never infer readiness from date, accessibility, comments, cached payload presence, or a cosmetic range.
- Give prepared scheduled dates a restrained dark-mode treatment that remains visible on iPhone without competing with the today or selected states.
- Leave the two colored completion dots unchanged: their filled state must continue to mean that the named reader commented.
- Add a compact visual key that explains the prepared-state treatment and preserve the existing completion legend.
- Keep accessible calendar labels explicit about `Study prepared` versus `Study preparation pending`.
- Preserve the full-month layout, cell height, tap targets, selected-day behavior, current-day outline, locked-day rules, reduced motion, and no-horizontal-overflow behavior.
- Publish only code/style/release metadata to GitHub Pages. Do not include private content, ESV wording, reader credentials, private identifiers, comments, or highlights.

## Relevant repository state

- `renderCalendar()` already writes `data-prepared="true|false"` from `hasPreparedReading(day.entry)`, but CSS gives that state no visual treatment.
- `renderCalendarLegend()` currently explains the two participant colors and `Filled dot = commented` but does not explain prepared studies.
- On 2026-09-03 the local private manifest contains the contiguous D054–D081 prefix. The calendar therefore has prepared studies through 2026-09-04; D082/Zechariah 11 on 2026-09-05 is the first real gap. `npm run study:next -- --today 2026-09-03` independently selects D082 with `planExtensionRequired: true`.
- The selected checkout is dirty and must remain untouched. Implementation and release work occur only in the clean `/private/tmp/dbr-spark-luna-fallback.IM2dtz/repo` clone.

## Decisions

- Preparation receives a faint sage cell surface/inset boundary, not another colored dot or a completion checkmark.
- Selected and today treatments remain dominant; prepared styling is the quiet default underneath them.
- The legend uses the same visual swatch and plain language so the meaning is not conveyed by color alone.
- This UI milestone does not fabricate or bulk-generate the missing D082–D087 studies. The separately authorized rolling T+7 workflow remains responsible for publishing those studies one reviewed reading at a time.

## Milestones

1. Implement prepared-date styling, legend, and accessible wording with focused regression tests.
2. Review the diff and focused evidence, run the full repository release gate, and perform a 390×844 fabricated-data smoke covering prepared/unprepared, selected, today, and completion states.
3. Build/publish the immutable Pages release, commit and push the exact validated artifacts, verify GitHub workflows and live bytes, and update durable project state.

## Acceptance criteria

- A scheduled date in `preparedReadingIds` is visibly shaded/bounded; a scheduled date outside that set is not.
- Selected and today states remain visually distinct, and completion dots retain their prior semantics.
- The calendar includes text explaining the prepared treatment and the filled-comment dot treatment.
- Screen-reader labels say `Study prepared` or `Study preparation pending` accurately.
- Focused tests, `npm run check`, repository safety, exact Pages artifact verification, and mobile-width smoke pass.
- The live Pages artifact matches the committed release and no backend/private-content mutation is required for this UI change.

## Progress

- [x] Confirm authoritative prepared-state data already reaches the calendar renderer.
- [x] Audit the current prefix: September 4 is prepared; September 5 is the first gap.
- [x] Implement and test the calendar treatment: authoritative prepared membership now receives a subordinate sage surface/inset, the legend explains it in plain language, and accessible calendar labels distinguish prepared from pending studies without changing completion dots.
- [x] Complete the primary diff review and 390×844 visual smoke: prepared, pending, selected, and today styles were distinct; the completion dots and compact layout remained intact; horizontal overflow was zero.
- [x] Complete the final post-publication repository gate: safety inspected 339 files; all validators, 263/263 tests, every build, and exact frontend/PWA verification passed for `40476564f433ff33` / `d9a55fa727bf4e5d`.
- [ ] Commit/push the exact current immutable Pages artifacts and verify GitHub workflows plus live bytes.

## Discoveries

- The first visual smoke caught a specificity defect before release: the initial prepared selector contained two data attributes and overrode the selected/today rules. Reducing it to `.calendar-day[data-prepared="true"]` gives equal specificity, so the deliberately later selected/today rules remain dominant.
- The local mock intentionally reports the full calendar as prepared. The browser smoke therefore demoted one accessible scheduled cell to `data-prepared="false"` after render to exercise the same DOM/CSS contract supplied by a shorter production prefix; source and unit tests separately pin the authoritative `hasPreparedReading()` assignment and accessible wording.
- The first full `npm run check` passed safety, validators, and all 263 tests, then stopped at the expected pre-publication mismatch because `web/release.json` had not yet been regenerated. The immutable Pages artifacts were then produced through `npm run publish:pages`; the post-publication gate remains the exact next action.

## Exact next action

Stage only the current source/docs/tests plus frontend `40476564f433ff33` and PWA `d9a55fa727bf4e5d`, commit/push, then verify GitHub workflows and live immutable bytes.
