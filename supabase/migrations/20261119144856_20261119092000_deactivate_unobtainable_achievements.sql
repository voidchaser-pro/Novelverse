/*
# Deactivate unobtainable achievements

## Plain-English summary
Adds an `is_active` boolean column to `achievement_definitions` (default true) and
sets 7 achievements to `is_active = false` because their underlying gameplay systems
(quiz arena, multiplayer, community) do not exist yet. These achievements can never
be unlocked until those features ship, so showing them as permanent 0% progress bars
is misleading.

The inactive achievements:
- first-victory (gaming, challenges_won)
- puzzle-solver (gaming, puzzles_completed)
- champion (gaming, challenges_won)
- unstoppable (gaming, challenges_won)
- social-butterfly (social, community_activity)
- supporter (social, community_help)
- popular (social, community_likes)

## Security
- No RLS policy changes. The `achievement_definitions_select_all` policy already
  allows everyone to read definitions. The new column is automatically readable.
- No new grants needed — existing SELECT grants cover the new column.

## Important notes
1. `is_active` defaults to true, so all existing and future achievements remain
   visible unless explicitly deactivated.
2. The `evaluate_achievements` function is unchanged — inactive achievements simply
   won't appear in the frontend list. If a user somehow already unlocked one (they
   can't, since the metrics return 0), the user_achievements row is preserved.
3. When quiz/multiplayer systems are built (Phase 2+), re-activate these by setting
   `is_active = true` in a future migration.
*/

ALTER TABLE public.achievement_definitions
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.achievement_definitions
SET is_active = false
WHERE id IN (
  'first-victory',
  'puzzle-solver',
  'champion',
  'unstoppable',
  'social-butterfly',
  'supporter',
  'popular'
);
