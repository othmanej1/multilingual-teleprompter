# Teleprompter App — Project Status

> **For Claude:** This file is the authoritative project map. Read it at the start of any new session before touching code. The app is a professional multilingual teleprompter built with Vite + React 19 + TypeScript 6. It includes an Electron IPC bridge (not packaged) and a Web Speech API voice-tracking feature. No AI features. These are hard constraints.

---

## Stack

| Layer | Choice |
|---|---|
| Bundler | Vite 8 |
| UI | React 19 + TypeScript 6 |
| Styling | Plain CSS modules (no Tailwind, no CSS-in-JS) |
| State | React `useState` / `useContext` — no external state lib |
| Persistence | `localStorage` only — no backend, no database |
| Cross-window sync | `BroadcastChannel` API (`tp_output_sync`) |
| Scroll animation | `requestAnimationFrame` loop — direct DOM `scrollTop`, never React state |
| Build output | Single-page app, `?output=1` query param routes to output window |

---

## File Map

```
electron/
├── main.ts                         # Electron main process: native menu + IPC bridge
└── preload.ts                      # Electron preload: exposes window.electronAPI to renderer

src/
├── main.tsx                        # Entry: routes ?output=1 → OutputView, else → App
│                                   # Wraps both in <SettingsProvider>
│
├── App.tsx                         # Main operator window
│                                   # Owns: script state, playback, fullscreen, guide, countdown,
│                                   #        folders, playlists, versions, voice config
│                                   # Uses: useSettings() for all typography
│
├── App.css                         # All main-window styles
├── index.css                       # Full-viewport reset (overrides Vite defaults)
├── electron.d.ts                   # Type declarations for window.electronAPI bridge
│
├── lib/
│   ├── types.ts                    # Core TypeScript interfaces (Script, Folder, Playlist,
│   │                               #   ScriptVersion, SyncMessage, TypographySettings)
│   ├── settings.ts                 # TypographySettings defaults, font family map, localStorage helpers
│   ├── storage.ts                  # Script/folder/playlist/version localStorage helpers
│   └── cues.tsx                    # [CUE] marker rendering + paragraph-level active highlight
│
├── contexts/
│   └── SettingsContext.tsx         # Single source of truth for all typography settings
│                                   # Handles localStorage persistence + BroadcastChannel sync
│
├── hooks/
│   ├── useSyncChannel.ts           # Thin BroadcastChannel wrapper (scroll/script sync)
│   ├── useVoiceTracking.ts         # Web Speech API hook — sliding-window word-match, 6 languages
│   ├── useFolders.ts               # Folder CRUD, persists to tp_folders
│   ├── usePlaylists.ts             # Playlist CRUD + cascade removal, persists to tp_playlists
│   └── useVersions.ts              # Script versioning, 10-version cap, persists to tp_versions
│
└── components/
    ├── ScriptLibrary.tsx           # Sidebar: folders, search, date filter, rename, duplicate, delete
    ├── ScriptLibrary.css
    ├── OperatorDashboard.tsx       # Right panel: play, jump, speed, progress, output indicator
    ├── OperatorDashboard.css
    ├── VoiceTracker.tsx            # Voice panel: language, start/stop, transcript, anchor/zone config
    ├── VoiceTracker.css
    ├── PlaylistPanel.tsx           # Playlist panel: create/reorder/activate playlists
    ├── PlaylistPanel.css
    ├── VersionPanel.tsx            # Version history panel: save/restore/delete script versions
    ├── VersionPanel.css
    ├── OutputView.tsx              # Popup output window: reads settings from context, script from channel
    └── OutputView.css
```

---

## Architecture: How the Pieces Connect

### Settings flow (typography)

```
User drags slider
  └─► update({ fontSize: 48 })          [SettingsContext]
        ├─► setSettings(...)             [React state — re-renders both panels]
        ├─► BroadcastChannel.postMessage({ type: 'settings-patch', patch })
        │     └─► OutputView's SettingsContext receives patch → setSettings(...)
        └─► debounced 300ms → persistSettings() → localStorage('tp_settings')
```

On output window connect:
```
OutputView mounts
  └─► send({ type: 'pong' })            [useSyncChannel in OutputView]
        ├─► App.tsx handler: setOutputConnected(true), send({ type: 'script', content })
        └─► SettingsContext handler: postMessage({ type: 'settings-full', settings: settingsRef.current })
              └─► OutputView's SettingsContext: setSettings(msg.settings)
```

**Key design decision:** `settingsRef.current` is updated every render so the `pong` handler never sends stale values — this was the root cause of the original sync bug.

### Script content flow

```
App.tsx (activeScript.content)
  ├─► Textarea editor (direct edit)
  ├─► useSyncChannel send({ type: 'script', content }) → OutputView on connect
  └─► useEffect([script, outputConnected]) → re-send on every content change
```

### Scroll sync flow (60fps)

```
App.tsx RAF loop (isPlaying=true)
  └─► el.scrollTop += speed * delta / 1000
        ├─► sendSyncRef.current({ type: 'frame', ratio })   [every frame, ~60fps]
        └─► setScrollRatio(ratio) throttled to ~10fps       [for OperatorDashboard]

OutputView
  └─► useSyncChannel receives 'frame' → requestAnimationFrame → el.scrollTop = ratio * maxScroll
```

### localStorage keys

| Key | Content | Who writes | Who reads |
|---|---|---|---|
| `tp_scripts` | `Script[]` JSON | App.tsx (800ms debounce) | bootstrapScripts() on mount |
| `tp_active` | active script id string | App.tsx (800ms debounce) | bootstrapActiveId() on mount |
| `tp_settings` | `TypographySettings` JSON | SettingsContext (300ms debounce) | loadSettings() on mount |
| `tp_scroll_positions` | `Record<string,number>` ratios | App.tsx (on switch / beforeunload / reset) | loadScrollPositions() on script switch |
| `tp_folders` | `Folder[]` JSON | useFolders hook | loadFolders() on mount |
| `tp_playlists` | `Playlist[]` JSON | usePlaylists hook | loadPlaylists() on mount |
| `tp_versions` | `ScriptVersion[]` JSON | useVersions hook (10-per-script cap) | loadVersions() on mount |
| `tp_editor_width` | number (px) | App.tsx | loadEditorWidth() on mount |
| `tp_editor_collapsed` | boolean string | App.tsx | useState initialiser |
| `tp_focus_mode` | boolean string | App.tsx | useState initialiser |
| `tp_notes_open` | boolean string | App.tsx | useState initialiser |
| `tp_high_contrast` | boolean string | App.tsx | useState initialiser |
| `tp_voice_anchor` | number (30–70) | App.tsx | useState initialiser |
| `tp_voice_zone` | number (2–20) | App.tsx | useState initialiser |
| `tp_voice_autoctr` | boolean string | App.tsx | useState initialiser |

---

## Completed Features

### Phase 1 — Core Teleprompter
- [x] Script editor (textarea) + live preview panel
- [x] Play / pause with Space key
- [x] Speed slider (10–300 px/s), font size slider (16–96px)
- [x] Text color, background color pickers
- [x] Mirror mode (`scaleX(-1)`)
- [x] Direction: Auto / LTR / RTL (Arabic support)
- [x] 60fps smooth scroll via `requestAnimationFrame`
- [x] Auto-stop at end of script

### Phase 2A — Professional Controls
- [x] Fullscreen mode (F11 shortcut, ESC to exit, Fullscreen API)
- [x] Reading guide line (adjustable color + opacity)
- [x] Script statistics (word count, char count, estimated read time)
- [x] Countdown overlay (3s / 5s / 10s) with animated number
- [x] Jump ±5 seconds, Reset to top

### Phase 2B — Script Management
- [x] Script Library sidebar (272px, toggle with ☰ Scripts)
- [x] Create / rename (inline double-click) / duplicate / delete scripts
- [x] Auto-save to localStorage (800ms debounce after any change)
- [x] Import .txt / .md files via FileReader API
- [x] Export active script as .txt or .md (Blob + URL.createObjectURL)
- [x] Script metadata: word count, read time, created/modified dates
- [x] Search/filter scripts by title

### Phase 3 — Studio Output System
- [x] Output popup window (`?output=1`) opened via `window.open(..., 'tp_output', 'popup')`
- [x] `BroadcastChannel('tp_output_sync')` for all cross-window messaging
- [x] Real-time scroll sync at 60fps (frame ratio messages)
- [x] Seek sync on jump / reset
- [x] Operator Dashboard (right panel): play/pause, ±5s/±10s jump, speed slider, progress bar, words/time remaining, output connection indicator
- [x] Output window auto-requests fullscreen on connect
- [x] Ping/pong heartbeat every 3s to detect window disconnection
- [x] Output window close detection via polling interval

### Phase 3 — Settings Synchronization (refactor)
- [x] `SettingsContext` — React Context as single source of truth for all typography
- [x] Full settings pushed on every new output window connection (no stale values)
- [x] `settings-patch` messages for instant real-time sync (no refresh needed)
- [x] `settings-full` on reconnect (handles popup refresh edge case)
- [x] localStorage persistence for all typography settings (300ms debounce)
- [x] Settings restored from localStorage on app reload
- [x] Bidirectional: output window changes propagate back to main window
- [x] New typography controls: font family (System/Serif/Mono/Arabic), line height, letter spacing, text alignment

### Phase 4 — Voice Tracking
- [x] Web Speech API hook (`useVoiceTracking`) — wraps `SpeechRecognition` / `webkitSpeechRecognition`
- [x] Continuous recognition with automatic restart on browser auto-stop
- [x] Language selector: en-US, en-GB, fr-FR, ar-MA, ar-SA, ar-EG
- [x] Status indicator: Ready / Listening (pulsing) / Permission Denied / Error / Not Supported
- [x] Sliding-window word-match algorithm to estimate speaker position (0–1 ratio)
- [x] Smooth scroll correction in RAF loop — proportional, capped at 300 px/s, never abrupt
- [x] 2-second grace period after any manual jump or reset — voice cannot fight the user
- [x] Voice panel UI: language selector, start/stop button, latest transcript, drift readout
- [x] Voice panel hidden in fullscreen mode (same as Dashboard)
- [x] Reading anchor: configurable viewport position (30–70%, default 50%) — spoken text stays at anchor, not top edge
- [x] Reading zone: configurable dead band (±2–20%, default ±10%) — scroll only when text drifts outside zone
- [x] Active paragraph highlight: spoken paragraph gets subtle green background (`tp-active-para`), synced to output window via `voice-pos` BroadcastChannel message
- [x] Voice zone overlay: translucent green band + anchor line visible in preview while listening
- [x] Auto-center toggle: disable to stop voice from controlling scroll entirely
- [x] Voice config persisted: `tp_voice_anchor`, `tp_voice_zone`, `tp_voice_autoctr`

### Workspace Ergonomics
- [x] Resizable editor panel (drag divider, 280–720px, persisted to `tp_editor_width`)
- [x] Collapsible editor strip (48px collapsed icon, persisted to `tp_editor_collapsed`)
- [x] Focus Mode — hides editor + library, maximises preview (persisted to `tp_focus_mode`)
- [x] Presenter notes panel (operator-only, never broadcast, persisted to `tp_notes_open`)
- [x] High-contrast mode (◑ HC toggle; `@media (prefers-contrast: more)` auto-activates; persisted to `tp_high_contrast`)

### Electron IPC Bridge
- [x] `electron/main.ts` + `electron/preload.ts` — native menu → renderer IPC
- [x] `window.electronAPI.setPresentingState()` — enables close-while-presenting confirmation dialog
- [x] `window.electronAPI.onMenuAction()` / `offMenuAction()` — bridges native menu to React handlers
- [x] All bridge calls are no-ops in browser (`window.electronAPI` is undefined); app runs as SPA without Electron

### Phase 5A — Presenter Experience
- [x] Cue markers (`[CUE]` tags in script, styled inline as `▸ CUE` badges; `◀ Cue` / `Cue ▶` buttons; `[` / `]` keyboard shortcuts; rendered in output window too)
- [x] Script position memory (scroll ratio saved per script to `tp_scroll_positions`; restored on switch via RAF; cleared on explicit reset; persisted on app close via `beforeunload`)
- [x] Font size presets (S=24 / M=36 / L=52 / XL=72 buttons in Typography panel; active preset highlights; slider stays for fine-tuning)

### Phase 5 — Production Polish
- [x] Keyboard shortcut reference overlay (`?` key or `?` button; `Esc`/backdrop to close; 3 sections: Playback / Navigation / Interface)
- [x] `npm run build` passes clean (`tsc -b` + Vite bundle, 253 kB JS / 48 kB CSS)
- [x] Touch / tablet support (swipe-to-scroll via `touch-action: pan-y`; pinch-to-zoom scales font size 16–96px, syncs to output window)
- [x] High-contrast accessibility mode (◑ HC toggle in Colors panel; overrides CSS vars to pure-black bg + yellow accent; persisted; `@media (prefers-contrast: more)` auto-activates)

### Phase 6 — Script Organization and Versioning
- [x] **Folders** — create/rename/delete folders; move scripts in (⤐ button); uncategorized section; folder sections in library; double-click to rename
- [x] **Playlists** — create/rename/delete playlists; add/remove/reorder scripts (↑↓); sequential playback with auto-advance at end-of-script; 0.8s gap between scripts; ≡ Lists button in header
- [x] **Script Versioning** — manual save (optional label); auto-snapshot before first edit each session; restore (saves current content first); 10-version cap per script; ⧖ Versions button in header
- [x] **Search & Filtering** — content search toggle (✦ button); date filter (Any / 7d / 30d); folder grouping in library sidebar; existing title search preserved
- [x] **Safety** — inline confirm for: script delete, folder delete, version delete, version restore, playlist delete; folder delete moves scripts to uncategorized (never deletes them); script delete cascades (removes versions + removes from all playlists)

---

## Typography Settings Reference

All controlled via `useSettings()` from `SettingsContext`:

| Setting | Type | Default | Range / Options |
|---|---|---|---|
| `fontSize` | `number` | `32` | 16–96 (px) |
| `fontFamily` | `string` | `'system'` | `'system'` / `'serif'` / `'mono'` / `'arabic'` |
| `textColor` | `string` | `'#ffffff'` | hex color |
| `bgColor` | `string` | `'#0a0a0f'` | hex color |
| `lineHeight` | `number` | `1.65` | 1.0–2.5 |
| `letterSpacing` | `number` | `0.2` | 0–5 (px) |
| `textAlign` | `'left' \| 'center' \| 'right'` | `'left'` | — |
| `direction` | `'auto' \| 'ltr' \| 'rtl'` | `'auto'` | — |
| `mirror` | `boolean` | `false` | — |

---

## BroadcastChannel Message Protocol

All messages use the channel name `'tp_output_sync'`. Both `SettingsContext` and `useSyncChannel` create separate instances of this channel (both valid — multiple instances share the same channel).

```typescript
type SyncMessage =
  | { type: 'script'; content: string }                        // script text
  | { type: 'settings-full'; settings: TypographySettings }    // full settings push on connect
  | { type: 'settings-patch'; patch: Partial<TypographySettings> } // incremental update
  | { type: 'frame'; ratio: number }                           // scroll position 0–1 at 60fps
  | { type: 'seek'; ratio: number }                            // seek to position
  | { type: 'voice-pos'; ratio: number | null }                // voice-matched position for active paragraph highlight
  | { type: 'ping' }                                           // heartbeat from main window
  | { type: 'pong' }                                           // output window announces presence
```

**Who handles what:**

| Message | Handler in main window | Handler in output window |
|---|---|---|
| `pong` | App.tsx: `setOutputConnected(true)`, sends `script` | — |
| `pong` | SettingsContext: sends `settings-full` | — |
| `script` | — | OutputView: `setScript(content)` |
| `settings-full` | — | SettingsContext: `setSettings(msg.settings)` |
| `settings-patch` | SettingsContext: `setSettings(prev => ...patch)` | SettingsContext: `setSettings(prev => ...patch)` |
| `frame` | — | OutputView: applies `ratio` to `scrollTop` via RAF |
| `seek` | — | OutputView: applies `ratio` to `scrollTop` via RAF |
| `voice-pos` | — | OutputView: `setVoiceRatio(ratio)` → active paragraph highlight |
| `ping` | — | OutputView: sends `pong` |

---

## Known Issues

1. **Speed slider does not sync to output window.** Speed is local App state (intentional — it's a playback control, not display). The output window is driven by `frame` ratio messages, so it follows the scroll regardless. The `timeRemaining` estimate in OperatorDashboard may drift if speed changes mid-scroll.

2. **Header row overflow on small screens.** Row 2 has many controls. It scrolls horizontally (no scrollbar visible) but there is no visual affordance indicating hidden controls. On screens narrower than ~1100px some controls are reachable only by scrolling row 2.

3. **`timeRemaining` estimate is approximate.** The OperatorDashboard calculates remaining time from word count / scaled WPM. This is a rough heuristic and does not account for actual scroll speed vs. content density.

4. **Output window popup may be blocked.** Browsers block `window.open()` unless called from a direct user gesture. The "Open Output" button is a direct click handler, so this should be fine, but some aggressive popup blockers may still intercept it.

5. **No test suite.** There are no unit or integration tests. `tsc -b` passes cleanly (zero errors); `npm run build` produces 253 kB JS / 48 kB CSS.

6. **Active paragraph highlight uses linear paragraph interpolation.** `voiceActivePara` maps `targetRatio × paragraphCount` linearly, assuming equal word counts per paragraph. Paragraphs with very different lengths may show the highlight one paragraph off.

---

## Hard Constraints (do not remove)

- No Electron packaging — the IPC bridge (`electron/main.ts`, `electron/preload.ts`) exists but the app must remain runnable as a plain SPA; do not bundle or package it as an Electron app
- No AI features
- No expanding voice recognition beyond the existing Web Speech API hook
- Arabic / RTL text must continue to work
- All existing features must be preserved when adding new ones
- No external state management libraries (Zustand, Redux, etc.) — React Context is sufficient

---

## Pending Roadmap

- Print / PDF export of scripts

---

## Development Notes for New Sessions

**To resume work:**
```
cd C:\Users\OthmaneMSI\Documents\Apps\teleprompter-app
npm run dev
# App: http://localhost:5173 (or next available port)
# Output window: click ⊞ Dashboard → Open Output
```

**Before any change:**
- Run `npx tsc -b` — must return zero output
- Read `PROJECT_STATUS.md` (this file) and the specific files you will touch
- Do not add AI features or Electron packaging; Electron bridge and Web Speech API voice tracking already exist

**Typical port situation:** Multiple dev server sessions accumulate. Vite auto-increments the port (5173, 5174, 5175…). Close unused terminal sessions to free ports.

**Testing the dual-screen sync:**
1. Open the app
2. Click `⊞ Dashboard` in the header
3. Click **Open Output** in the dashboard panel
4. Move the popup to a second monitor (or keep it side-by-side)
5. Change any typography setting in the main window — the popup updates instantly
6. Press Play — both windows scroll in sync
7. The green pulsing dot in the dashboard confirms live connection
