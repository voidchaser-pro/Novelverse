/*
# Restrict direct execution of the new-user trigger function

## Plain-English summary
The function that creates a profile when someone signs up is only meant to run
automatically inside the database. It was callable over the API by signed-in users.
This migration removes that permission. Sign-up keeps working because the database
runs the trigger itself.

## Changes
1. handle_new_user(): EXECUTE revoked from PUBLIC, anon and authenticated.
   No data, policies or triggers are changed.

## Security notes
- Idempotent: revoking an already-revoked permission has no effect.
- The trigger still fires on new auth.users rows.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
