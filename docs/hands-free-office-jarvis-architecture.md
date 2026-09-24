# Hands-Free Office JARVIS: Architecture

## Goal

Add an optional Windows/macOS background companion that can detect “Jarvis”
locally, capture a spoken command only after the wake word, send that command
to the existing JARVIS service, and speak the response. Keep the current web
application as the independent interface for capture, search, history, editing,
and backup. Do not replace the web app or create a second memory store.

This document describes a design and implementation sequence. It does not add
desktop runtime code or change the existing application.

## Findings from the current project

- The web app is a React/Vite artifact in `artifacts/jarvis-memory`.
- The API is an Express service in `artifacts/api-server`.
- `lib/db` connects through `DATABASE_URL` using Drizzle and PostgreSQL.
- No Supabase client or authentication middleware is present in the current
  routes. Although `.replit` contains a `SUPABASE_URL`, source search finds no
  code using it. `README.md` and `replit.md` say Supabase authentication is a
  future step.
- `artifacts/api-server/src/routes/memories.ts` and
  `artifacts/api-server/src/routes/assistant.ts` both use the hard-coded
  `local-user` identity. The API currently has no user authentication or
  per-user authorization boundary.
- Existing API behavior includes memory creation, listing/search, detail,
  correction, deletion, assistant question/repeat/correction handling, and a
  summary. The website uses these APIs and browser speech APIs.
- A memory can cause a reminder row to be inserted by
  `extractReminder()` during memory creation. There are currently no reminder
  read, update, completion, or notification endpoints.

### Blocking integration question

The requested target says Supabase and authenticated user data already exist,
but the checked-in implementation does not use either. Before implementing
desktop sign-in or changing the server's data layer, establish which is
authoritative:

1. The Supabase project named in the request (including its Auth configuration
   and current data/schema), which must remain the sole memory store; or
2. The currently running Replit PostgreSQL/Drizzle implementation.

Do not point the companion at a database directly, make a second database, or
silently migrate/replace data while this is unresolved. Keep this as an explicit
integration gate in implementation planning.

## Proposed shape

```text
┌──────────────────────────────────┐
│ Existing JARVIS web application  │
│ history, search, manual capture, │
│ editing, settings, backup        │
└────────────────┬─────────────────┘
                 │ HTTPS, authenticated API
                 ▼
┌──────────────────────────────────┐
│ Existing JARVIS API service      │
│ authentication + user scoping    │
│ memory / assistant / reminder   │
│ operations                       │
└────────────────┬─────────────────┘
                 │ one authoritative data store
                 ▼
        ┌───────────────────┐
        │ Confirmed existing│
        │ Supabase database │
        └───────────────────┘
                 ▲
                 │ HTTPS, authenticated API
┌────────────────┴─────────────────┐
│ Separate desktop companion      │
│ tray/login item · local wake     │
│ word · local speech · OS keychain│
└──────────────────────────────────┘
```

The companion is a separate installable application, not a website tab or
browser service worker. A browser cannot reliably keep the microphone active
after the page is closed or the computer restarts.

## Desktop companion

### Suggested implementation boundary

Add an independent desktop package (proposed location:
`desktop/jarvis-companion/`) and leave `artifacts/jarvis-memory` intact. A
lightweight Tauri 2 shell is a reasonable initial candidate for a tray app,
autostart, and signed Windows/macOS installers. Keep OS audio, wake-word
inference, secure token storage, and lifecycle handling behind small native
adapters so a different shell or wake-word SDK can be substituted without
changing JARVIS API behavior.

Before selecting a specific wake-word engine, check its Windows/macOS
distribution terms, model availability, microphone permissions, offline
behavior, and whether its SDK needs a vendor access key. If an access key is
required, provision and protect it through the appropriate vendor and OS
credential flows; never embed it in the app or check it into the repository.

### Audio and privacy lifecycle

1. Start quietly on user login, show a tray/status indicator, and request
   microphone permission through the operating system.
2. Process microphone frames on-device with a local wake-word detector. Do not
   stream audio to JARVIS or a transcription provider during wake-word
   monitoring. Discard non-wake audio immediately; do not write it to disk.
3. On a local “Jarvis” match, play the short response “Yes?” and start a
   bounded, local command-capture session.
4. Stop capture after endpoint silence, a maximum duration, user mute, or an
   error. Transcribe locally when feasible. If transcription cannot be local,
   make any opt-in remote transcription a separate, clearly disclosed setting;
   transmit only the post-wake command, never continuous microphone audio.
5. Send the recognized command over HTTPS to the authenticated JARVIS API.
6. Speak the API's reply with local operating-system text-to-speech. Do not
   retain the raw audio or transcript outside the normal memory that the user
   explicitly asked JARVIS to save.
7. Return to wake-word-only mode. Provide an obvious mute/disable control and
   expose microphone/listening state in the tray.

The wake-word component necessarily processes live microphone input locally
while enabled. “No continuous upload or recording” means no audio streaming
and no persistent audio capture; the UI and documentation must not imply the
microphone is inactive.

## API and identity boundary

- The desktop companion calls the existing service; it must never connect to
  PostgreSQL/Supabase directly or contain a database credential.
- Before desktop access, replace the `local-user` constant with identity
  derived from a validated authenticated request. Apply the same authorization
  consistently to memory list/detail/create/update/delete, assistant operations,
  and reminders. Reject missing/invalid credentials rather than falling back to
  a shared identity.
- If Supabase Auth is confirmed, use a supported native sign-in flow with
  OAuth Authorization Code + PKCE in the system browser and a loopback or
  registered callback. Store refresh credentials only in Windows Credential
  Manager/macOS Keychain; use short-lived access tokens for HTTPS requests.
  Validate tokens server-side and scope all queries to the verified subject.
- Never ship a Supabase service-role key, database URL, or other privileged
  server credential in the desktop bundle. Do not rely on an untrusted
  client-provided user ID.
- Configure HTTPS, allowed origins as appropriate, request size limits, and
  rate limiting on the server. Browser CORS is not a substitute for API
  authentication.

### Reuse existing behavior

- Send ordinary statements to the existing memory creation behavior so the
  same exact wording, categorization, extraction, and reminder parsing rules
  apply. Return and speak “Noted.” only after the API confirms success.
- Send questions, repeat requests, and corrections through the existing
  assistant query behavior, then speak its returned `reply`.
- Extend the contract-first API in `lib/api-spec/openapi.yaml` and regenerate
  client/validation packages when adding authentication metadata or
  reminder-management operations.
- Add reminder list/update/complete operations before promising full voice
  reminder management. Define whether notifications require the desktop to be
  online or a server-side scheduler; do not imply reliable delivery while all
  devices are offline.
- Give voice-originated writes the same ownership, validation, and error
  handling as web-originated writes. Do not create a parallel command-specific
  copy of the memory logic in the desktop app.

## Suggested milestones

1. **Resolve data and identity source.** Verify the real Supabase project,
   schema, existing data, and authentication provider. Decide how the current
   `DATABASE_URL`/Drizzle service relates to that system without losing or
   duplicating memories.
2. **Secure the shared API.** Implement verified identity and per-user
   authorization across the existing API and web app. Add contract-backed
   reminder management. Confirm the website's current flows still work.
3. **Prove the local audio loop.** Build a small desktop spike for tray,
   login startup, OS microphone permissions, local wake detection, bounded
   command capture, and local speech output on Windows and macOS. Test mute,
   sleep/wake, device changes, and process restarts.
4. **Connect authenticated commands.** Add the secure sign-in/token lifecycle
   and use the existing API for save, search, repeat, correction, and reminder
   management. Test that the companion and website see the same records.
5. **Package and document.** Produce signed installers, startup/mute/uninstall
   instructions, privacy disclosures, and a recovery path for expired sign-in
   or unavailable network. Keep desktop releases independent of the website.

## Acceptance criteria

- Closing the website does not stop the desktop companion.
- A wake-word detector runs locally; no audio is sent before a wake match.
- Only a bounded post-wake utterance is captured, and raw audio is not
  persisted.
- A memory written by voice appears in the existing website history; edits or
  deletions in the website are reflected in subsequent companion queries.
- Another account cannot read, alter, or delete the signed-in user's records.
- The user can mute/disable the microphone, see its state, sign out, and revoke
  desktop access.
- The existing website remains usable independently and no second memory
  database is introduced.