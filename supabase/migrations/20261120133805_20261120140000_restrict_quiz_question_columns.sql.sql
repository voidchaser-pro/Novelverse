/*
# Hide quiz answers from the client

## Plain-English summary
The quiz_questions table stored the correct answer index and the explanation visible to
any signed-in user through the API, which would let players look up answers before
playing. This migration restricts what the browser can read: questions, options, and XP
values stay readable (the play screen needs them), but correct_index and explanation are
now returned ONLY by the server-side submit function, after the attempt is scored.

## Security changes
- Replaces the table-wide SELECT grant on quiz_questions with a column-restricted grant:
  authenticated can read id, quiz_id, position, question, options, xp only.
- correct_index and explanation are no longer readable by any client role; the
  SECURITY DEFINER submit_quiz_attempt function reads them as the table owner and
  includes them in its (already validated) results.
- No RLS policy changes; the existing row policy still limits rows to published quizzes.

## Important notes
1. The frontend quiz player must take correct answers and explanations from the submit
   function's response, never from the question fetch.
2. Re-running is safe: the REVOKE/GRANT pair is idempotent.
*/

REVOKE SELECT ON public.quiz_questions FROM authenticated;
GRANT SELECT (id, quiz_id, position, question, options, xp) ON public.quiz_questions TO authenticated;
