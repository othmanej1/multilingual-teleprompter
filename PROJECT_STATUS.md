# Teleprompter App — Project Status

> **For Claude:** This file is the authoritative project map. Read it at the start of any new session before touching code. The app is a professional multilingual teleprompter built with Vite + React 19 + TypeScript 6. No Electron. No voice recognition. No AI features. These are hard constraints.

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
src/
├── main.tsx                        # Entry: routes ?output=1 → OutputView, else → App
│                                   # Wraps both in <SettingsProvider>
│
├── App.tsx                         # Main operator window (~340 lines)
│                                   # Owns: script state, playback, fullscreen, guide, countdown
│                                   # Uses: useSettings() for all typography
│
├── App.css                         # All main-window styles
├── index.css                       # Full-viewport reset (overrides Vite defaults)
│
├── lib/
│   ├── types.ts                    # Core TypeScript interfaces (Script, SyncMessage, TypographySettings)
│   ├── settings.ts                 # TypographySettings defaults, font family map, localStorage helpers
│   └── storage.ts                  # Script localStorage helpers (tp_scripts, tp_active keys)
│
├── contexts/
│   └── SettingsContext.tsx         # Single source of truth for all typography settings
│                                   # Handles localStorage persistence + BroadcastChannel sync
│
├── hooks/
│   └── useSyncChannel.ts           # Thin BroadcastChannel wrapper (scroll/script sync)
│
└── components/
    ├── ScriptLibrary.tsx           # Sidebar: list, search, rename, duplicate, delete (React.memo)
    ├── ScriptLibrary.css
    ├── OperatorDashboard.tsx       # Right panel: play, jump, speed, progress, output indicator (React.memo)
    ├── OperatorDashboard.css
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
- [x] Script Library sidebar (256px, toggle with ☰ Scripts)
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
- [x] All existing features preserved: mirror, RTL, multi-monitor sync, typography sync

### Phase 3 — Settings Synchronization (refactor)
- [x] `SettingsContext` — React Context as single source of truth for all typography
- [x] Full settings pushed on every new output window connection (no stale values)
- [x] `settings-patch` messages for instant real-time sync (no refresh needed)
- [x] `settings-full` on reconnect (handles popup refresh edge case)
- [x] localStorage persistence for all typography settings (300ms debounce)
- [x] Settings restored from localStorage on app reload
- [x] Bidirectional: output window changes propagate back to main window
- [x] New typography controls: font family (System/Serif/Mono/Arabic), line height, letter spacing, text alignment

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
| `ping` | — | OutputView: sends `pong` |

---

## Known Issues

1. **Speed slider does not sync to output window.** Speed is local App state (intentional — it's a playback control, not display). The output window is driven by `frame` ratio messages, so it follows the scroll regardless. The `timeRemaining` estimate in OperatorDashboard may drift if speed changes mid-scroll.

2. **Header row overflow on small screens.** Row 2 has many controls. It scrolls horizontally (no scrollbar visible) but there is no visual affordance indicating hidden controls. On screens narrower than ~1100px some controls are reachable only by scrolling row 2.

3. **`timeRemaining` estimate is approximate.** The OperatorDashboard calculates remaining time from word count / scaled WPM. This is a rough heuristic and does not account for actual scroll speed vs. content density.

4. **Output window popup may be blocked.** Browsers block `window.open()` unless called from a direct user gesture. The "Open Output" button is a direct click handler, so this should be fine, but some aggressive popup blockers may still intercept it.

5. **No test suite.** There are no unit or integration tests. `tsc --noEmit` passes cleanly (zero errors) as of the last session.

6. **No build validation.** `npm run build` has not been run against the current codebase. The dev server works; a production build should be verified before any deployment.

---

## Hard Constraints (do not remove)

- No Electron packaging
- No AI features
- Arabic / RTL text must continue to work
- All existing features must be preserved when adding new ones
- No external state management libraries (Zustand, Redux, etc.) — React Context is sufficient

---

## Pending Roadmap (not started)

### Phase 5A — Presenter Experience
- [x] Cue markers (`[CUE]` tags in script, styled inline as `▸ CUE` badges; `◀ Cue` / `Cue ▶` buttons in transport group and Operator Dashboard; `[` / `]` keyboard shortcuts; rendered in output window too)
- [x] Presenter notes panel (separate from displayed text, visible to operator only; per-script; never broadcast; green dot indicator; auto-saved)
- [x] Script position memory (scroll ratio saved per script to `tp_scroll_positions`; restored on switch via RAF; cleared on explicit reset; persisted on app close via `beforeunload`)
- Font size presets (Quick 1-click size switching: Small / Medium / Large / XL)

### Phase 5 — Production Polish
- Keyboard shortcut reference overlay (press `?` to show all shortcuts)
- `npm run build` validation + `vite preview` test
- Touch / tablet support (pinch-to-zoom font size, swipe to scroll)
- High-contrast accessibility mode
- Print / PDF export of scripts

### Phase 6 — Multi-Script Workflow
- Script playlists (queue multiple scripts to run in order)
- Script versioning (save snapshots, diff view)
- Folder / category organization for the script library

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
- Run `npx tsc --noEmit` — must return zero output
- Read `PROJECT_STATUS.md` (this file) and the specific files you will touch
- Do not add Electron / voice / AI features

**Typical port situation:** Multiple dev server sessions accumulate. Vite auto-increments the port (5173, 5174, 5175…). Close unused terminal sessions to free ports.

**Testing the dual-screen sync:**
1. Open the app
2. Click `⊞ Dashboard` in the header
3. Click **Open Output** in the dashboard panel
4. Move the popup to a second monitor (or keep it side-by-side)
5. Change any typography setting in the main window — the popup updates instantly
6. Press Play — both windows scroll in sync
7. The green pulsing dot in the dashboard confirms live connection
