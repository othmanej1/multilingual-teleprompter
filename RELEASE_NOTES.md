# TelePrompter — Release Notes

## v1.1.0 (2026-06-07)

### Phase 9 — Offline Speech Recognition
- Electron desktop app now uses **sherpa-onnx-node** for fully offline speech recognition
- Web Speech API (Chrome/Edge) is preserved unchanged in the browser version
- Audio captured via Web Audio `ScriptProcessorNode` at 16 kHz; streamed to main process via IPC
- `contextIsolation: true` and `nodeIntegration: false` preserved; bridge via preload `speech` object
- Engine badge ("Offline") shown in Voice Tracking panel when running offline mode
- Model-missing panel shows the exact directory path and links to `models/README.md`
- Models directory: `models/{lang}/` in dev, `{userData}/models/{lang}/` in production
- Supported model types: transducer (encoder/decoder/joiner) and Zipformer2 CTC
- Language switch while active swaps the recognizer without restarting microphone
- electron-builder config updated: sherpa-onnx-node bundled, DLLs in `asarUnpack`

## v1.0.0 (2026-06-07)

### Phase 8 — Production Branding Polish
- About dialog (Help → About TelePrompter, or ℹ toolbar button)
  - Shows app name, version, description
  - Shows userData folder path with "Open in Explorer" button (Electron only)
- Help menu added (Keyboard Shortcuts, Open App Data Folder, About)
- `__APP_VERSION__` injected at Vite build time from `package.json`
- Icon asset instructions in `build/README.md`
- Keyboard shortcuts accessible via Help menu (`Ctrl+/`) or `?` key

### Phase 7 — Windows Desktop Packaging
- Packaged as native Windows application via electron-builder
- NSIS installer (`release/TelePrompter Setup 1.0.0.exe`)
  - User-selectable install directory
  - Desktop and Start Menu shortcuts named "TelePrompter"
- Window position and size persist across launches (`userData/window-state.json`)
- Close-while-presenting confirmation dialog
- Output window opens as a native BrowserWindow on second monitor

### Phase 6 — Content Management
- Script folders: create, rename, delete, move scripts between folders
- Playlists: sequential auto-advance at end of script, reorder up/down
- Script version history: 10 versions per script; auto-snapshot on first edit per session, manual snapshots, restore
- Content search with toggle, date filter
- Safety confirmation dialogs for destructive operations

### Phase 5 — Production Polish
- Keyboard shortcuts overlay (`?` key)
- High-contrast accessibility mode (`◑ HC` button + `@media prefers-contrast`)
- Touch/swipe scroll and pinch-to-zoom for tablets
- Cue markers `[CUE]` → `▸ CUE` inline badges
- Presenter notes panel
- Scroll position memory per script
- Font size presets: S / M / L / XL

### Phase 4 — Voice Tracking
- Web Speech API word-match tracking (Arabic, French, English, Spanish, German, Portuguese)
- Configurable reading anchor: 30–70%, default 45% of usable viewport height
- Reading zone dead band: ±2–20%, default ±10% (suppresses micro-jitter)
- Accurate word-position formula uses `.tp-text` element bounds (not scrollHeight)
- ResizeObserver keeps metrics current on font/content/window changes
- Active paragraph highlight synced to output window via `voice-pos` BroadcastChannel message
- Voice zone overlay and anchor line in preview
- Auto-center toggle

### Phase 3 — Studio Output System
- Popup output window with 60 fps scroll sync via BroadcastChannel
- Operator dashboard panel
- Bidirectional settings sync: `settings-full` on connect, `settings-patch` incremental
- `ping`/`pong` heartbeat; seek sync

### Phase 2 — Professional Controls
- Fullscreen (F11 / native menu)
- Reading guide line
- Countdown timer: 3 / 5 / 10 s
- Jump ±5 s
- Word count and time-remaining estimate
- Script statistics

### Phase 1 — Core Teleprompter
- 60 fps RAF scroll with speed slider
- Font: family, size (S–XL presets + custom), color, line-height, letter-spacing
- Background color, text alignment
- Mirror mode (horizontal flip)
- Arabic / RTL full support
- Script library: create, rename, duplicate, delete, import (.txt / .md), export
- Auto-save with 800 ms debounce

---

## Roadmap

- Print / PDF export (Phase 5 — remaining item)
