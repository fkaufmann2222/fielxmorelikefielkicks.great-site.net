# Project Tickets

Last updated: 2026-03-23

## Why Competition Profiles Were Added (TICKET-01)

Competition profiles were added to remove event-key sprawl and prevent users from entering or reloading event data in multiple places. A profile now represents a durable competition context and is required before using scouting tabs.

Benefits:
- One source of truth for active competition context.
- Team roster is fetched and cached once during profile creation.
- Existing tabs can continue to use legacy keys while profile APIs own real state.
- Prevents accidental scouting against the wrong event by hard-gating tab visibility until a profile is selected.

### What Competition Profiles Are Wired To

Profile storage/state:
- `src/lib/competitionProfiles.ts`
  - Stores `competitionProfiles` and `activeCompetitionProfileId` in local storage.
  - Persists per-profile team cache (`competitionProfileTeams:<profileId>`).
  - Syncs active profile into legacy compatibility keys (`eventKey`, `tbaTeams`).

App shell and gating:
- `src/App.tsx`
  - Adds Home flow for profile list/create/select.
  - Uses prompt-based profile creation with event key.
  - Hides non-home tabs until an active profile exists.

TBA integration:
- `src/lib/tba.ts`
  - Added `fetchEvent(eventKey)` for derived event metadata.
  - Existing `fetchTeams(eventKey)` used on first profile creation.
- `api/tba/event/[eventKey].js`
  - Backend proxy for TBA event metadata.

Types:
- `src/types/index.ts`
  - Added `TBAEvent` and `CompetitionProfile`.

Settings visibility:
- `src/components/SettingsModal.tsx`
  - Displays active profile key/info as read-only context.

## Ticket Status Tracker

### TICKET-01 - Home Page: Competition Profile Management
Status: DONE

Completed:
- Home screen lists saved competition profiles.
- Add Profile flow prompts for TBA event key.
- Profile is saved permanently in local storage with derived name/location/year/team count.
- First create fetches and stores teams from TBA.
- Selecting a profile sets active competition context.
- Non-home tabs are hidden/locked until profile selection.

Notes:
- Backward compatibility is preserved by mirroring active profile context to legacy `eventKey` and `tbaTeams` storage keys.

### TICKET-02 - Remove TBA Backload Tab
Status: TODO

Target:
- Remove legacy TBA key backload tab and controls.
- Team loading remains in profile creation flow from TICKET-01.

### TICKET-03 - Remove Legacy Strategy / Match Scouting Tab
Status: TODO

### TICKET-04 - Statbotics Integration
Status: TODO

### TICKET-05 - Match View: Team Listing + Scouting Count
Status: TODO

### TICKET-06 - Raw Data Section: Team-First Navigation
Status: TODO

### TICKET-07 - Pit Scouting: Photo Upload
Status: TODO

### TICKET-08 - TBA Fallback Data for Unscouted Teams
Status: TODO
