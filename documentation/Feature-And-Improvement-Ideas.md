# Feature and Improvement Ideas

## 2 New Features (selected)

1. Advanced role permissions
   Add role levels like scout, lead scout, and admin with action-level permissions.

2. Match assignment board
   Let captains assign scouts to matches/teams and track assignment completion.

## 10 Improvements

## 10 Improvements

1. Tighten Supabase RLS policies
   Replace permissive anon/authenticated policies with event-scoped and admin-scoped rules.

2. Add server-side validation for critical writes
   Verify required fields, event scope, and admin actions before DB updates.

3. Improve duplicate detection
   Prevent accidental duplicate match-team submissions with clear overwrite options.

4. Add debounced search and pagination in admin tab
   Keep admin tools fast as data volume grows.

5. Add optimistic UI rollback handling
   If an action fails, restore the row cleanly and show actionable error details.

6. Normalize event key handling
   Ensure lowercase and trim behavior is consistent everywhere to avoid hidden mismatches.

7. Strengthen type safety for data payloads
   Introduce runtime schema validation to catch malformed records before saving.

8. Add automated tests for sync and moderation flows
   Cover queue behavior, delete/validate actions, and event-scoped filtering.

9. Improve performance with query-level filtering
   Fetch only records needed for active event views instead of broad queries.

10. Add monitoring and diagnostics
   Capture sync failures, API latency, and error rates with lightweight telemetry.
