# Copilot Instructions for This Repository

## Project Purpose
This is an FRC scouting application with an event-centric workflow:
- Event list first
- Event workspace second (tabbed scouting views)
- Offline-first local storage plus periodic cloud sync

## Tech Stack
- Frontend: React 19 + TypeScript + Vite
- Styling: Tailwind CSS
- Backend: Vercel serverless functions under `api/`
- Data: Supabase Postgres + Supabase Storage
- External integrations: The Blue Alliance (TBA), Gemini, Statbotics, face-api.js

## Canonical Commands
- Install: `npm install`
- Dev: `npm run dev`
- Type-check: `npm run lint`
- Build: `npm run build`
- Preview build: `npm run preview`
- Clean dist: `npm run clean`
- Legacy pit photo cleanup dry run: `npm run cleanup:legacy-pit-photos:dry`
- Legacy pit photo cleanup execute: `npm run cleanup:legacy-pit-photos`

## Environment Rules
- Frontend env vars must be `VITE_*` values.
  - Required in browser code: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Server-only secrets must stay in API functions.
  - `TBA_API_KEY`, `GEMINI_API_KEY`
- Never expose server-only keys in `src/` code.

## Architecture Map
- `src/tabs/`: major event workspace pages (Pit, Match, Alliance, Admin, etc.)
- `src/components/`: reusable UI components
- `src/lib/`: shared client logic (storage, sync, supabase, scoring, providers)
- `src/types/`: domain type definitions
- `api/`: Vercel function endpoints for TBA, Gemini, Statbotics, Face ID flows
- `schema.sql`: canonical DB schema, RLS policies, storage buckets, migration cleanup

## Data and Sync Conventions
- Local data is stored via `src/lib/storage.ts` and synced by `src/lib/sync.ts`.
- Sync queue key: `syncQueue`.
- Sync runs every 15s and uses timestamp-based conflict behavior.
- Do not use record ID alone for conflict resolution.
- Preserve current key scoping conventions in local storage:
  - `global:*` for shared/global state
  - `device:*` for device-local state
  - scoped record keys such as `pitScout:<profileId>:<teamNumber>` and `matchScout:<matchNumber>:<teamNumber>`
- Keep legacy migration bridges intact unless explicitly removing legacy support.

## Supabase and Schema Conventions
- DB columns are snake_case. Frontend/domain objects are camelCase.
- Always map explicitly between DB rows and app types.
  - Examples: `event_key -> eventKey`, `team_number -> teamNumber`
- Keep `schema.sql` as the source of truth for table/policy/storage changes.
- When changing schema, maintain compatibility with existing sync + mapping code.
- Current RLS policies are permissive for anon/authenticated roles; treat this as non-production security by default and call out security impact in changes.

## API Route Conventions
- API handlers are default exported `async function handler(req, res)`.
- Validate request method first and set `Allow` headers for 405 responses.
- Validate required inputs and return structured JSON errors.
- Normalize event keys to lowercase before provider calls.
- Keep provider calls server-side only.

## Face ID and Media Conventions
- Storage buckets used by app:
  - `pit-scout-photos`
  - `face-id-snapshots`
- Preserve existing path conventions for uploads and cleanup logic.
- Do not weaken face verification thresholds/quality checks without explicit request.

## Modularity Requirements (Do Not Build Monoliths)
- Never add new monolithic files that combine UI, data access, business logic, and provider calls in one place.
- Prefer small, composable modules with single responsibility:
  - UI in components/tabs
  - data mapping in dedicated helpers
  - API/provider logic in `src/lib/*` or `api/*`
  - shared type contracts in `src/types`
- For complex features, split by concern before adding new behavior.
- If modifying a large file, extract reusable logic into nearby helper modules instead of expanding file complexity.
- Keep functions focused and short; avoid deeply nested branching when extraction is possible.

## Implementation Guardrails
- Preserve TypeScript strictness and existing domain types.
- Reuse existing helpers before creating new utilities.
- Match existing naming style and folder boundaries.
- Avoid broad refactors unrelated to the requested change.
- After changes, run `npm run lint` for type validation when feasible.

## Preferred Change Pattern
1. Add/update types in `src/types` when contracts change.
2. Add/update mapping/util helpers in `src/lib`.
3. Keep API handlers thin and delegate logic.
4. Keep UI components declarative and side-effect light.
5. Validate storage/sync behavior still works for offline-first flow.

When uncertain, follow existing patterns in nearby files and choose the most modular, testable option.

## Current Feature Index and Wiring

This section is the canonical map of implemented features and where each feature is wired.

### 1) App Shell, Navigation, and Role Gating
- Root shell, authentication gate, tab routing, and role-based tab fallback:
  - `src/App.tsx`
- Navigation tabs currently exposed in event mode:
  - `Pit` (admin only): `src/App.tsx` -> `src/tabs/PitScouting.tsx`
  - `Match`: `src/App.tsx` -> `src/tabs/EventMatchScouting.tsx`
  - `Strategy`: `src/App.tsx` -> `src/tabs/AllianceStrategy.tsx`
  - `Alliance`: `src/App.tsx` -> `src/tabs/AllianceSelection.tsx`
  - `Raw`: `src/App.tsx` -> `src/tabs/RawData.tsx`
  - `Admin` (admin only): `src/App.tsx` -> `src/tabs/AdminMatchCleanup.tsx`
  - `Coverage` (admin only): `src/App.tsx` -> `src/tabs/MatchScoutingCoverage.tsx`

### 2) Login, User Accounts, and Moderation
- Password + Face ID login/signup flow, role selection, admin PIN checks, profile persistence:
  - `src/App.tsx`
- Password hashing/verification (PBKDF2 + legacy hash fallback):
  - `src/App.tsx`
- User profile storage in Supabase table `admin_user_profiles`:
  - `src/App.tsx`
  - `src/lib/supabase.ts` (`setScoutBanState`)
- Scout ban/unban moderation (admin actions):
  - `src/App.tsx`
  - `src/tabs/AdminMatchCleanup.tsx`
  - `src/lib/supabase.ts`

### 3) Event Workspace and Competition Profiles
- Event list first, event workspace second:
  - `src/tabs/Home.tsx`
  - `src/App.tsx`
- Create/select active competition profile from TBA event key:
  - `src/App.tsx` (`handleCreateProfile`, `handleSelectProfile`)
  - `src/lib/competitionProfiles.ts`
- Profile/team hydration + migration from legacy local keys:
  - `src/lib/competitionProfiles.ts`

### 4) Pit Scouting
- Scoped pit form keyed by `pitScout:<profileId>:<teamNumber>`:
  - `src/tabs/PitScouting.tsx`
  - `src/lib/storage.ts`
- Team picker for unscouted teams (profile-scoped), edit existing pit records:
  - `src/tabs/PitScouting.tsx`
  - `src/lib/competitionProfiles.ts`
- Pit photo upload/delete (Supabase Storage bucket `pit-scout-photos`):
  - `src/tabs/PitScouting.tsx`
  - `src/lib/supabase.ts`

### 5) Match Scouting (Event Match Flow)
- Match/team selection from TBA schedule and assignments:
  - `src/tabs/EventMatchScouting.tsx`
  - `src/lib/tba.ts`
  - `src/lib/supabase.ts`
- Record autonomous path + teleop shot map + defense notes + general notes:
  - `src/tabs/EventMatchScouting.tsx`
  - `src/components/AutonPathField.tsx`
- Match record autosave/scoped save key `matchScout:<matchNumber>:<teamNumber>`:
  - `src/tabs/EventMatchScouting.tsx`
  - `src/lib/storage.ts`
- Scout assignment completion marking:
  - `src/tabs/EventMatchScouting.tsx`
  - `src/lib/supabase.ts` (`markAssignmentCompleted`)

### 6) Alliance Strategy Workbench
- Build hypothetical red/blue alliances and compare EPA totals:
  - `src/tabs/AllianceStrategy.tsx`
- Team EPA fetch and parsing (Statbotics):
  - `src/tabs/AllianceStrategy.tsx`
  - `api/statbotics/team/[teamNumber].js`
  - `api/statbotics/team_years.js`
- Embedded `RawData` popup for selected team detail:
  - `src/tabs/AllianceStrategy.tsx`
  - `src/tabs/RawData.tsx`
- Alliance/Team shot heatmaps and coordinate alignment:
  - `src/tabs/AllianceStrategy.tsx`
  - `src/components/FieldHeatmap.tsx`
  - `src/lib/heatmapUtils.ts`

### 7) Alliance Selection Board
- Draft board with TBA rank + Statbotics EPA + local/remote note summary:
  - `src/tabs/AllianceSelection.tsx`
- Picked-team persistence per event (`allianceSelection:picked:<eventKey>`):
  - `src/tabs/AllianceSelection.tsx`
  - `src/lib/storage.ts`
- Note aggregation from local storage + Supabase rows:
  - `src/tabs/AllianceSelection.tsx`
  - `src/lib/supabase.ts`

### 8) Raw Data Explorer and AI Summaries
- Unified merged view of local + remote pit/match rows with event/global scope:
  - `src/tabs/RawData.tsx`
- Team selector backed by Statbotics event team data + profile-team fallback:
  - `src/tabs/RawData.tsx`
  - `src/lib/statbotics.ts`
  - `src/lib/competitionProfiles.ts`
- Team charting/metrics from Statbotics team matches/years APIs:
  - `src/tabs/RawData.tsx`
  - `api/statbotics/team_matches.js`
  - `api/statbotics/team_years.js`
- Gemini note summarization for match notes:
  - `src/tabs/RawData.tsx`
  - `src/lib/gemini.ts`
  - `api/gemini/summarize-match-notes.js`

### 9) Admin Cleanup and Assignment Board
- Admin moderation table (validate/delete pending match records):
  - `src/tabs/AdminMatchCleanup.tsx`
  - `src/lib/supabase.ts` (`validateMatchScoutById`, `deleteMatchScoutById`)
- Assignment board (create/list/delete assignments):
  - `src/tabs/AdminMatchCleanup.tsx`
  - `src/lib/supabase.ts` (`upsertAssignment`, `listAssignmentsForEvent`, `deleteAssignmentById`)
- Event match/team options from TBA for assignment UX:
  - `src/tabs/AdminMatchCleanup.tsx`
  - `src/lib/tba.ts`

### 10) Coverage Tracking
- Match scouting coverage matrix (team x scheduled match cells):
  - `src/tabs/MatchScoutingCoverage.tsx`
- Coverage row extraction by event from `match_scouts` payload:
  - `src/lib/supabase.ts` (`listMatchCoverageRowsForEvent`)

### 11) Face ID Enrollment and Verification
- Capture modal with face-api.js descriptor collection, quality gating, snapshot capture:
  - `src/components/FaceIdCaptureModal.tsx`
- Client API wrappers:
  - `src/lib/faceid.ts`
- Server enrollment endpoint (dedupe + quality guard + metadata persistence):
  - `api/faceid/train.js`
  - `lib/faceid-server-utils.js`
- Server verification endpoint (strict threshold + margin + confidence policy):
  - `api/faceid/verify.js`
  - `lib/faceid-server-utils.js`
- Face ID snapshot upload bucket `face-id-snapshots`:
  - `src/lib/supabase.ts`

### 12) Offline-First Storage and Sync
- Local persistence and sync queue operations:
  - `src/lib/storage.ts`
- Periodic sync loop (15s), initial pull, queue cleanup, upsert to Supabase:
  - `src/lib/sync.ts`
- Sync status pill + hover diagnostics + sync-success toast:
  - `src/components/SyncIndicator.tsx`
  - `src/components/Toast.tsx`

### 13) Provider Integrations
- TBA client provider and caching:
  - `src/lib/tba.ts`
  - `api/tba/[resource]/[eventKey].js`
- Statbotics client provider and fallback strategy:
  - `src/lib/statbotics.ts`
  - `api/statbotics/*.js`
- Gemini client provider:
  - `src/lib/gemini.ts`
  - `api/gemini/*.js`

### 14) Settings and Session Controls
- Settings modal (active event, signed-in profile, back-to-events):
  - `src/components/SettingsModal.tsx`
  - `src/App.tsx`
- Session sign-out and active user profile key management:
  - `src/App.tsx`

### 15) Data Import / Backload Utilities
- CSV -> parsed team rows -> Supabase import workflow:
  - UI: `src/tabs/TeamLookup.tsx`
  - Client API: `src/lib/gemini.ts`
  - Server routes: `api/gemini/analyze-csv.js`, `api/gemini/import-teams.js`
- Note: this utility exists in code but is not currently shown in the main nav tabs in `src/App.tsx`.

### 16) Additional/Legacy Views Present in Codebase
- Legacy/general match form:
  - `src/tabs/MatchScouting.tsx`
- Match submission count dashboard by selected match:
  - `src/tabs/MatchView.tsx`
- User profile load modal component:
  - `src/components/UserProfileLoadModal.tsx`
- These are present and functional as modules, but not primary-routed in the current `App` tab shell.

### 17) API Route Inventory (Canonical)
- TBA proxy (event/teams/matches/rankings):
  - `api/tba/[resource]/[eventKey].js`
- Statbotics proxies:
  - `api/statbotics/teams_by_event.js`
  - `api/statbotics/team_event.js`
  - `api/statbotics/team_matches.js`
  - `api/statbotics/team_years.js`
  - `api/statbotics/team/[teamNumber].js`
- Gemini endpoints:
  - `api/gemini/analyze-csv.js`
  - `api/gemini/import-teams.js`
  - `api/gemini/summarize-match-notes.js`
- Face ID endpoints:
  - `api/faceid/train.js`
  - `api/faceid/verify.js`