/*
# Close scenario self-publishing loophole

## Plain-English summary
Previously, the `scenarios_update_own` RLS policy only checked `auth.uid() = creator_id`,
which let a creator flip their own scenario to `status = 'approved'` and
`is_published = true` via a direct API call — bypassing admin review entirely.

This migration tightens the creator UPDATE policy so that:
1. Creators can only UPDATE scenarios that are still in 'draft' or 'pending' status
   (once a scenario is approved or rejected, only admins can modify it).
2. Creators can NEVER set `is_published = true` or `status = 'approved'` on their own
   scenario — those fields are set exclusively by the admin approval flow.

The admin UPDATE policy is unchanged — admins can still update any scenario.

## Security changes
- Replaces `scenarios_update_own` policy:
  - USING: creator AND status IN ('draft','pending') — can only touch un-reviewed scenarios
  - WITH CHECK: creator AND status IN ('draft','pending') AND NOT is_published — cannot
    self-publish or self-approve
- `scenarios_update_admin` is unchanged (admins retain full update access).

## Important notes
1. Existing approved/published scenarios are unaffected — the new USING clause only
   restricts the creator's ability to UPDATE, not existing data.
2. The admin approval flow (which sets status='approved' + is_published=true) still works
   because it runs through the admin UPDATE policy.
3. Creators can still edit draft/pending scenarios (title, nodes, characters, etc.) and
   submit for review — they just can't self-publish.
*/

DROP POLICY IF EXISTS "scenarios_update_own" ON scenarios;

CREATE POLICY "scenarios_update_own"
  ON scenarios FOR UPDATE TO authenticated
  USING (
    auth.uid() = creator_id
    AND status IN ('draft', 'pending')
  )
  WITH CHECK (
    auth.uid() = creator_id
    AND status IN ('draft', 'pending')
    AND is_published = false
  );
