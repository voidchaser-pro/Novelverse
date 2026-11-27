/*
# Tighten table privileges on profiles, novels and novel_submissions

## Plain-English summary
The three tables had full write privileges (insert, update, delete) granted to the
anonymous and signed-in roles. Row Level Security still limited what users could do,
but the profiles table allowed a signed-in user to update every column of their own
row, including `role`. That would let any reader promote themselves to admin.

This migration removes the broad grants and re-grants only the privileges the app uses.
No rows, columns or policies are deleted or changed.

## Changes
1. profiles
- anon: SELECT only (public profile data, e.g. leaderboards).
- authenticated: SELECT, INSERT own row, and UPDATE of user-editable columns only.
  `role`, `xp`, `level` and `streak` are NOT writable by the client.
- service_role: unchanged.

2. novels
- anon, authenticated: SELECT only. Writes happen through admin-only policies, which
  require the authenticated role, so the anon role loses write grants entirely.

3. novel_submissions
- anon: no privileges.
- authenticated: SELECT, INSERT, DELETE, and UPDATE (existing admin-only policy still
  decides who may update).

## Security notes
- Row Level Security policies are untouched.
- `role` can only be changed directly in the database by an operator.
- The migration is idempotent: REVOKE and GRANT can be re-run safely.
*/

REVOKE ALL ON profiles FROM anon, authenticated;
GRANT SELECT ON profiles TO anon, authenticated;
GRANT INSERT ON profiles TO authenticated;
GRANT UPDATE (username, full_name, bio, avatar_url, updated_at) ON profiles TO authenticated;

REVOKE ALL ON novels FROM anon, authenticated;
GRANT SELECT ON novels TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON novels TO authenticated;

REVOKE ALL ON novel_submissions FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON novel_submissions TO authenticated;
GRANT UPDATE (status, admin_feedback, reviewed_by, reviewed_at, novel_id, updated_at) ON novel_submissions TO authenticated;
