# Humanizer PR Roadmap (Deferred)

Owner: Umer Siddique
Status: Deferred for later implementation

## Scope to include in separate PR

1. Stealth-style pre-check meters
   - AI likelihood meter (before/after)
   - Similarity meter (before/after)

2. Behavior controls during generation
   - Tone
   - Formality
   - Readability grade
   - Human variance level
   - Risk mode

3. Draft state workflow (temporary)
   - Auto-save temporary draft state
   - Keep unsaved draft until user explicitly saves final
   - Restore latest draft on return

4. Two-stage flow
   - Analyze first (scores + flags)
   - Humanize second (profile-driven rewrite)

5. Data model
   - Add `HumanizerDraft` shape with:
     - `id`, `userId`, `sourceText`, `settings`, `lastOutput`
     - `aiScoreBefore`, `aiScoreAfter`
     - `similarityBefore`, `similarityAfter`
     - `updatedAt`, `isFinal`

## Proposed PR breakdown

- PR-H1: Draft autosave + behavior controls UI
- PR-H2: Pre/post scoring meters and warnings
- PR-H3: Save final, draft history, restore and cleanup

## Notes

- Keep current Humanizer production flow unchanged until this PR is started.
- Reuse existing quality gate logic from `sentinelQuery` where appropriate.
